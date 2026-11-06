// One fighting machine: movement (walk, dash, jump, air dash, cancels), facing the lock-on target, weapons with
// gauges, melee, guard, hit reactions, and the animated model with its thrusters. The same class runs the human and
// the CPU; only the Intent source differs.
import {
  AdditiveBlending, AnimationMixer, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, LoopOnce, LoopRepeat, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, Quaternion, RingGeometry, Vector3, type AnimationAction, type Bone, type Object3D,
} from 'three'
import { assets } from './assets'
import { audio } from './audio'
import type { Intent } from './input'
import { shotFor, type MechDef, type ShotParams, type Slot, type Stance } from './roster'
import type { Battle } from './battle'

export const SCALE = 2.2 // the models are 1 unit tall; machines stand 2.2 units
export const HEIGHT = 2.2
export const RADIUS = 0.95
const GRAVITY = 36
/** One knob for round length: every hit is scaled by this. */
const DAMAGE_SCALE = 0.8

export type MechState = 'move' | 'dash' | 'dashEnd' | 'air' | 'airdash' | 'land' | 'guard' | 'charge' | 'melee' | 'stagger' | 'down' | 'ko' | 'intro'

interface Pending { at: number; slot: Slot; shot: ShotParams; i: number }

const v1 = new Vector3()
const v2 = new Vector3()
const v3 = new Vector3()
const UP = new Vector3(0, 1, 0)
const q1 = new Quaternion()
const q2 = new Quaternion()
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

export class Mech {
  readonly def: MechDef
  readonly side: 0 | 1
  readonly sideColor: number
  battle!: Battle
  target!: Mech

  pos = new Vector3()
  vel = new Vector3()
  yaw = 0
  hp: number
  gauge: Record<Slot, number> = { L: 100, R: 100, C: 100 }
  cool: Record<Slot, number> = { L: 0, R: 0, C: 0 }
  state: MechState = 'intro'
  stateT = 0
  grounded = true
  airDashUsed = false
  impact = 0
  invuln = 0
  hitFlash = 0
  lastHitAt = -9
  dashDir = new Vector3()
  dashFired = false
  pending: Pending[] = []
  charge: { slot: Slot; shot: ShotParams; t: number; stance: Stance } | null = null
  melee: { slot: Slot; t: number; hit: boolean } | null = null
  intent: Intent | null = null
  stats = { shots: 0, hits: 0, damage: 0 }
  flip = 0 // knockdown flip progress
  time = 0

  // model
  readonly root = new Group() // position + yaw
  private pivot = new Group() // lean
  private model: Object3D
  private mixer: AnimationMixer
  private actions = new Map<string, AnimationAction>()
  private current = ''
  private oneShotUntil = 0
  private bones: Record<string, Bone | undefined> = {}
  private flames: Mesh[] = []
  private flameMat: MeshBasicMaterial
  private shield: Mesh
  private sideRing: Mesh
  private mats: MeshStandardMaterial[] = []
  private thrustLoop: { set: (v: number, r: number) => void; stop: () => void } | null = null
  private stepT = 0
  private ghosts: { root: Object3D; pivot: Group; bones: Bone[]; mat: MeshBasicMaterial; t: number }[] = []
  private liveBones: Bone[] = []
  private ghostT = 0

  constructor(def: MechDef, side: 0 | 1) {
    this.def = def
    this.side = side
    this.sideColor = side === 0 ? 0x5ff2ff : 0xffb547
    this.hp = def.hp
    const m = assets.mech(def.id)
    this.model = m.scene
    this.model.scale.setScalar(SCALE)
    this.model.traverse((o) => {
      const mesh = o as Mesh
      if (mesh.isMesh) {
        const mat = (mesh.material as MeshStandardMaterial).clone()
        mat.emissive = new Color(0x000000)
        mesh.material = mat
        this.mats.push(mat)
      }
      if ((o as Bone).isBone) this.bones[o.name] = o as Bone
    })
    this.pivot.add(this.model)
    this.root.add(this.pivot)
    this.mixer = new AnimationMixer(this.model)
    for (const c of m.clips) {
      const a = this.mixer.clipAction(c)
      const loops = c.name === 'idle' || c.name === 'walk' || c.name === 'fly'
      a.setLoop(loops ? LoopRepeat : LoopOnce, Infinity)
      a.clampWhenFinished = true
      this.actions.set(c.name, a)
    }
    this.play('idle', 0)
    this.model.traverse((o) => { if ((o as Bone).isBone) this.liveBones.push(o as Bone) })
    // dash afterimages: three translucent copies that take the live pose when they spawn, then fade
    for (let i = 0; i < 3; i++) {
      const g = assets.mech(def.id).scene
      g.scale.setScalar(SCALE)
      const mat = new MeshBasicMaterial({ color: new Color(def.accent).multiplyScalar(0.9), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false })
      const bones: Bone[] = []
      g.traverse((o) => {
        const mesh = o as Mesh
        if (mesh.isMesh) { mesh.material = mat; mesh.castShadow = false; mesh.receiveShadow = false }
        if ((o as Bone).isBone) bones.push(o as Bone)
      })
      const pivot = new Group()
      const root = new Group()
      pivot.add(g)
      root.add(pivot)
      root.visible = false
      this.ghosts.push({ root, pivot, bones, mat, t: 0 })
    }

    // thrusters: two flames behind the back unit
    const accent = new Color(def.accent)
    this.flameMat = new MeshBasicMaterial({ color: accent.clone().multiplyScalar(2.5), transparent: true, blending: AdditiveBlending, depthWrite: false })
    const cone = new ConeGeometry(0.16, 1, 12, 1, true)
    cone.translate(0, -0.5, 0)
    cone.rotateX(-Math.PI / 2 - 0.5) // points backward and down
    for (const x of [-0.32, 0.32]) {
      const f = new Mesh(cone, this.flameMat)
      f.position.set(x, HEIGHT * 0.62, -0.42)
      f.renderOrder = 3
      this.pivot.add(f)
      this.flames.push(f)
    }
    // guard shield: a hex energy disc in front
    const sh = new CylinderGeometry(1.5, 1.5, 0.05, 6, 1, true)
    sh.rotateX(Math.PI / 2)
    this.shield = new Mesh(sh, new MeshBasicMaterial({ color: new Color(this.sideColor).multiplyScalar(1.4), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }))
    this.shield.position.set(0, HEIGHT * 0.55, 1.1)
    this.pivot.add(this.shield)
    const disc = new Mesh(new RingGeometry(1.2, 1.5, 6), new MeshBasicMaterial({ color: new Color(this.sideColor).multiplyScalar(2), transparent: true, opacity: 0.0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }))
    this.shield.add(disc)
    // side ring on the deck
    const rg = new RingGeometry(1.25, 1.45, 40)
    rg.rotateX(-Math.PI / 2)
    this.sideRing = new Mesh(rg, new MeshBasicMaterial({ color: new Color(this.sideColor).multiplyScalar(1.8), transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }))
    this.sideRing.renderOrder = 2
  }

  attach(battle: Battle, target: Mech): void {
    this.battle = battle
    this.target = target
    battle.scene.add(this.root)
    battle.scene.add(this.sideRing)
    for (const g of this.ghosts) battle.scene.add(g.root)
    this.thrustLoop = audio.loop('thruster_loop')
  }

  dispose(): void {
    this.root.removeFromParent()
    this.sideRing.removeFromParent()
    for (const g of this.ghosts) g.root.removeFromParent()
    this.thrustLoop?.stop()
    this.mixer.stopAllAction()
  }

  // --- animation -------------------------------------------------------------------------------------------------

  private play(name: string, fade = 0.15, speed = 1, restart = false): void {
    const a = this.actions.get(name)
    if (!a) return
    if (this.current === name && !restart) {
      a.timeScale = speed
      return
    }
    const old = this.actions.get(this.current)
    a.reset()
    a.timeScale = speed
    a.setEffectiveWeight(1)
    a.play()
    if (old && old !== a) a.crossFadeFrom(old, fade, false)
    this.current = name
  }

  private oneShot(name: string, dur: number, speed = 1): void {
    this.play(name, 0.08, speed, true)
    this.oneShotUntil = this.time + dur
  }

  // --- geometry helpers ------------------------------------------------------------------------------------------

  get center(): Vector3 {
    return v3.copy(this.pos).setY(this.pos.y + HEIGHT * 0.55)
  }

  centerInto(out: Vector3): Vector3 {
    return out.copy(this.pos).setY(this.pos.y + HEIGHT * 0.55)
  }

  forward(out = new Vector3()): Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
  }

  /** World position of a muzzle for a slot. */
  muzzle(slot: Slot, out: Vector3): Vector3 {
    const bone = slot === 'L' ? this.bones['hand_L'] : slot === 'R' ? this.bones['weapon_R'] ?? this.bones['hand_R'] : this.bones['chest']
    if (bone) {
      bone.getWorldPosition(out)
      if (slot === 'C') out.y += 0.5
    } else this.centerInto(out)
    // push it a little forward so shots leave the body
    out.addScaledVector(this.forward(v2), 0.6)
    return out
  }

  get distance(): number {
    return Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z)
  }

  get alive(): boolean {
    return this.state !== 'ko'
  }

  get stance(): Stance {
    if (this.state === 'dash') return 'dash'
    if (this.state === 'air' || this.state === 'airdash') return 'air'
    return 'stand'
  }

  get canAct(): boolean {
    return this.state === 'move' || this.state === 'dash' || this.state === 'air' || this.state === 'airdash'
  }

  setState(s: MechState, t = 0): void {
    this.state = s
    this.stateT = t
  }

  // --- the step --------------------------------------------------------------------------------------------------

  step(dt: number, it: Intent, frozen: boolean): void {
    this.time += dt
    this.intent = it
    const arena = this.battle.arena
    for (const s of ['L', 'R', 'C'] as Slot[]) {
      const w = this.def.weapons[s]
      this.gauge[s] = Math.min(100, this.gauge[s] + w.regen * dt)
      this.cool[s] = Math.max(0, this.cool[s] - dt)
    }
    this.impact = Math.max(0, this.impact - 40 * dt)
    this.invuln = Math.max(0, this.invuln - dt)
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4)
    this.stateT -= dt

    // facing frame toward the target
    const tx = this.target.pos.x - this.pos.x
    const tz = this.target.pos.z - this.pos.z
    const tl = Math.hypot(tx, tz) || 1
    const fx = tx / tl, fz = tz / tl
    const rx = -fz, rz = fx
    const wantYaw = Math.atan2(fx, fz)

    if (frozen) it = { ...it, mx: 0, my: 0, dash: false, jump: false, fire: null, guard: false }

    // stick direction in the world
    const mvx = rx * it.mx + fx * it.my
    const mvz = rz * it.mx + fz * it.my
    const mvLen = Math.hypot(mvx, mvz)

    const st = this.state
    // --- state transitions from input
    if (!frozen && this.state !== 'intro') {
      if (st === 'move') {
        if (it.guard) this.setState('guard')
        else if (it.jump) this.startJump(0.35)
        else if (it.dash) this.startDash(mvLen > 0.2 ? v1.set(mvx / mvLen, 0, mvz / mvLen) : v1.set(fx, 0, fz))
      } else if (st === 'guard') {
        if (!it.guard) this.setState('move')
        else if (it.jump) this.startJump(0.35)
        else if (it.dash) this.startDash(mvLen > 0.2 ? v1.set(mvx / mvLen, 0, mvz / mvLen) : v1.set(fx, 0, fz))
      } else if (st === 'dash') {
        if (it.jump) { this.vel.multiplyScalar(0.75); this.startJump(0.15) } // dash cancel into a jump keeps the momentum
        else if (it.guard) this.setState('dashEnd', 0.1) // dash cancel: stop dead
      } else if (st === 'air') {
        if (it.dash && !this.airDashUsed) this.startAirDash(mvLen > 0.2 ? v1.set(mvx / mvLen, 0, mvz / mvLen) : v1.set(fx, 0, fz))
      } else if (st === 'airdash') {
        if (it.guard) { this.setState('air'); this.vel.multiplyScalar(0.3) }
      }
      if (it.fire && this.canAct) this.pull(it.fire)
      if (it.turn && this.canAct) this.yaw = wantYaw
    }

    // --- movement per state
    const s = this.state
    let turnRate = 7
    if (s === 'move') {
      const sp = this.def.walk
      this.approach(mvx * sp, mvz * sp, 70, dt)
    } else if (s === 'guard' || s === 'charge' || s === 'land' || s === 'stagger') {
      this.approach(0, 0, s === 'stagger' ? 20 : 45, dt)
      if (s === 'land' && this.stateT <= 0) this.setState('move')
      if (s === 'stagger' && this.stateT <= 0) this.setState(this.grounded ? 'move' : 'air')
      turnRate = s === 'guard' ? 5 : 2
    } else if (s === 'dash') {
      // the stick bends the dash a little
      if (mvLen > 0.2) {
        const a = Math.atan2(this.dashDir.x, this.dashDir.z)
        const b = Math.atan2(mvx, mvz)
        const na = a + Math.max(-1.6 * dt, Math.min(1.6 * dt, angDiff(a, b)))
        this.dashDir.set(Math.sin(na), 0, Math.cos(na))
      }
      const sp = this.def.dash * (this.stateT < 0.15 ? 0.85 : 1)
      this.vel.x = this.dashDir.x * sp
      this.vel.z = this.dashDir.z * sp
      turnRate = 3.5
      if (this.stateT <= 0) this.setState('dashEnd', this.dashFired ? 0.32 : 0.16)
    } else if (s === 'dashEnd') {
      this.approach(0, 0, 55, dt)
      turnRate = 3
      if (this.stateT <= 0) this.setState('move')
    } else if (s === 'air' || s === 'down' || s === 'ko') {
      if (s === 'air') {
        this.approach(this.vel.x + mvx * 3 * dt * 10, this.vel.z + mvz * 3 * dt * 10, 0, dt)
        const hs = Math.hypot(this.vel.x, this.vel.z)
        const cap = Math.max(this.def.walk * 1.1, hs - 4 * dt)
        if (hs > cap) { this.vel.x *= cap / hs; this.vel.z *= cap / hs }
        if (it.jumpHeld && this.vel.y > 0 && this.stateT > 0) this.vel.y += 22 * dt // hold to rise higher
      }
      this.vel.y -= GRAVITY * dt * (s === 'down' ? 0.8 : 1)
      turnRate = s === 'air' ? 4 : 0
    } else if (s === 'airdash') {
      if (mvLen > 0.2) {
        const a = Math.atan2(this.dashDir.x, this.dashDir.z)
        const b = Math.atan2(mvx, mvz)
        const na = a + Math.max(-1.2 * dt, Math.min(1.2 * dt, angDiff(a, b)))
        this.dashDir.set(Math.sin(na), 0, Math.cos(na))
      }
      this.vel.x = this.dashDir.x * this.def.airDash
      this.vel.z = this.dashDir.z * this.def.airDash
      this.vel.y = Math.max(this.vel.y - 6 * dt, -1)
      turnRate = 3
      if (this.stateT <= 0) { this.setState('air'); this.vel.x *= 0.55; this.vel.z *= 0.55 }
    } else if (s === 'melee') {
      this.stepMelee(dt, fx, fz)
      turnRate = 10
    } else if (s === 'intro') {
      this.approach(0, 0, 30, dt)
    }
    if (s === 'charge') this.stepCharge(dt)

    // facing
    if (turnRate > 0 && this.state !== 'ko') {
      const d = angDiff(this.yaw, wantYaw)
      this.yaw += Math.max(-turnRate * dt, Math.min(turnRate * dt, d))
    }

    // integrate and collide
    this.pos.addScaledVector(this.vel, dt)
    arena.clampBounds(this.pos, RADIUS)
    arena.pushOut(this.pos, RADIUS, HEIGHT)
    // machines push each other apart
    const o = this.target
    const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z
    const dd = Math.hypot(dx, dz)
    if (dd < RADIUS * 2 && Math.abs(this.pos.y - o.pos.y) < HEIGHT && dd > 1e-4) {
      const push = (RADIUS * 2 - dd) * 0.5
      this.pos.x += (dx / dd) * push
      this.pos.z += (dz / dd) * push
    }
    const ground = arena.groundAt(this.pos, RADIUS, this.pos.y)
    const airborne = this.state === 'air' || this.state === 'airdash' || this.state === 'down' || this.state === 'ko'
    if (airborne || (this.state === 'stagger' && !this.grounded)) {
      if (this.pos.y <= ground && this.vel.y <= 0) {
        this.pos.y = ground
        this.landed(ground)
      } else this.grounded = false
    } else {
      if (this.pos.y > ground + 0.05) {
        // walked off a ledge
        if (this.state === 'dash' || this.state === 'move' || this.state === 'dashEnd') {
          this.grounded = false
          if (this.state !== 'dash') { this.setState('air', 0); this.vel.y = 0 }
          else this.vel.y = Math.min(0, this.vel.y - GRAVITY * dt)
          if (this.state === 'dash') this.pos.y += this.vel.y * dt
        }
      } else {
        this.pos.y = ground
        this.vel.y = 0
        this.grounded = true
      }
    }

    // queued burst shots
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i]
      if (this.time >= p.at) {
        this.pending.splice(i, 1)
        if (this.alive && this.state !== 'stagger' && this.state !== 'down') this.release(p.slot, p.shot, p.i)
      }
    }
  }

  private approach(x: number, z: number, accel: number, dt: number): void {
    if (accel <= 0) { this.vel.x = x; this.vel.z = z; return }
    const dx = x - this.vel.x, dz = z - this.vel.z
    const d = Math.hypot(dx, dz)
    const m = Math.min(d, accel * dt)
    if (d > 1e-6) { this.vel.x += (dx / d) * m; this.vel.z += (dz / d) * m }
  }

  private startDash(dir: Vector3): void {
    this.dashDir.copy(dir)
    this.dashFired = false
    this.setState('dash', this.def.dashTime)
    this.battle.events.dash(this)
    audio.sfx('dash', { at: this.pos, vol: 0.9 })
    this.battle.fx.dust(this.pos, 10, 6)
    this.battle.fx.ring(v2.copy(this.pos).setY(this.pos.y + 0.1), this.def.accent, 3.2, 0.3)
    this.battle.fx.flash(v2.copy(this.pos).setY(this.pos.y + HEIGHT * 0.6).addScaledVector(dir, -0.8), this.def.accent, 1.4, 0.1)
  }

  private startAirDash(dir: Vector3): void {
    this.dashDir.copy(dir)
    this.airDashUsed = true
    this.dashFired = false
    this.vel.y = 1.5
    this.setState('airdash', 0.55)
    audio.sfx('dash', { at: this.pos, vol: 0.8, rate: 1.1 })
  }

  private startJump(holdTime: number): void {
    this.vel.y = this.def.jump
    this.grounded = false
    this.airDashUsed = false
    this.setState('air', holdTime)
    this.oneShot('jump', 0.5, 1.4)
    audio.sfx('jump', { at: this.pos, vol: 0.8 })
    this.battle.fx.dust(this.pos, 12, 7)
  }

  private landed(ground: number): void {
    const hard = this.vel.y < -18 || this.state === 'airdash'
    this.vel.y = 0
    this.grounded = true
    this.airDashUsed = false
    this.pos.y = ground
    if (this.state === 'ko') return
    if (this.state === 'down') {
      this.flip = 0
      this.setState('land', 0.35)
      this.invuln = Math.max(this.invuln, 0.7)
      audio.sfx('land', { at: this.pos })
      this.battle.fx.dust(this.pos, 18, 8)
      return
    }
    if (this.state === 'stagger') return
    this.setState('land', hard ? 0.2 : 0.06)
    if (hard) {
      audio.sfx('land', { at: this.pos, vol: 0.8 })
      this.battle.fx.dust(this.pos, 10, 6)
      this.battle.fx.ring(v2.copy(this.pos).setY(this.pos.y + 0.08), 0xc8d8e8, 3, 0.35)
    }
  }

  // --- weapons ---------------------------------------------------------------------------------------------------

  /** A trigger pull for a slot: melee when the target is close, otherwise the weapon of the current stance. */
  private pull(slot: Slot): void {
    const tgt = this.target
    const w = this.def.weapons[slot]
    const dist = this.distance
    const dy = Math.abs(tgt.pos.y - this.pos.y)
    if ((this.state === 'move' || this.state === 'dash') && dist < this.def.melee.range && dy < 3.5 && tgt.state !== 'down' && tgt.alive) {
      this.melee = { slot, t: 0, hit: false }
      this.setState('melee', 0.85)
      this.oneShot('melee', 0.85, 1.35)
      audio.sfx('sword_swing', { at: this.pos, rate: 0.9 })
      return
    }
    if (this.cool[slot] > 0 || this.gauge[slot] < w.cost) {
      if (this.battle.isHuman(this)) audio.sfx('ui_back', { vol: 0.4, minGap: 0.2 })
      return
    }
    const stance = this.stance
    const shot = shotFor(w, stance)
    this.gauge[slot] -= w.cost
    this.cool[slot] = w.cooldown
    if (stance === 'dash') this.dashFired = true
    this.stats.shots++
    if (shot.charge) {
      this.charge = { slot, shot, t: shot.charge, stance }
      if (stance === 'stand') this.setState('charge', shot.charge + 0.25)
      this.oneShot('shoot', shot.charge + 0.3, 0.9)
      this.battle.fx.flash(this.muzzle(slot, v1), shot.color, 0.8, shot.charge)
      if (shot.kind === 'rail') audio.sfx('lock_on', { at: this.pos, vol: 0.6 })
      return
    }
    this.queueShots(slot, shot)
    if (stance === 'stand' && this.state === 'move' && Math.hypot(this.vel.x, this.vel.z) < 2) this.oneShot('shoot', 0.45, 1.6)
  }

  private queueShots(slot: Slot, shot: ShotParams): void {
    for (let i = 0; i < shot.count; i++) {
      if (shot.interval > 0 && i > 0) this.pending.push({ at: this.time + shot.interval * i, slot, shot, i })
      else this.release(slot, shot, i)
    }
  }

  private stepCharge(dt: number): void {
    // a ground charge roots the machine; the timer in `charge` releases it
    void dt
    if (this.stateT <= 0) this.setState('move')
  }

  /** Called every step from the battle so air and dash charges also release. */
  tickCharge(dt: number): void {
    if (!this.charge) return
    if (this.state === 'stagger' || this.state === 'down' || this.state === 'ko') { this.charge = null; return }
    this.charge.t -= dt
    const m = this.muzzle(this.charge.slot, v1)
    if (Math.random() < 0.7) this.battle.fx.trail(m, this.charge.shot.color, 0.5, 0.15)
    if (this.charge.t <= 0) {
      const c = this.charge
      this.charge = null
      this.queueShots(c.slot, c.shot)
    }
  }

  private release(slot: Slot, shot: ShotParams, i: number): void {
    const origin = this.muzzle(slot, new Vector3())
    const aim = this.target.centerInto(new Vector3())
    // fan: spread the projectiles of one pull evenly around the aim
    const n = shot.count
    const fan = n > 1 && shot.spread > 0 && shot.interval === 0 ? (i - (n - 1) / 2) * shot.spread : shot.interval > 0 && shot.spread > 0 ? (Math.random() - 0.5) * shot.spread * 2 : 0
    this.battle.spawnShot(this, shot, origin, aim, fan, slot)
  }

  private stepMelee(dt: number, fx: number, fz: number): void {
    const m = this.melee!
    m.t += dt
    const def = this.def.melee
    const dist = this.distance
    if (m.t < 0.3) {
      // lunge, homing on the target, stopping just short
      const sp = dist > 2.4 ? def.lunge : 0
      this.vel.x = fx * sp
      this.vel.z = fz * sp
      this.vel.y = 0
      if (Math.random() < 0.8) this.battle.fx.exhaust(this.centerInto(v1), v2.set(-fx, 0, -fz), this.def.accent, 1.5)
    } else {
      this.approach(0, 0, 60, dt)
    }
    if (!m.hit && m.t >= 0.28 && m.t <= 0.46) {
      const tgt = this.target
      const dy = Math.abs(tgt.pos.y - this.pos.y)
      if (dist < 3.6 && dy < 3) {
        m.hit = true
        const mult = m.slot === 'C' ? 1.3 : m.slot === 'L' ? 0.85 : 1
        const res = tgt.takeHit(def.damage * mult, def.impact * mult, this, 'melee')
        const at = tgt.centerInto(v1)
        if (res === 'blocked') {
          audio.sfx('guard_block', { at })
          this.battle.fx.sparks(at, 0xffffff, 30, 14)
          this.setState('stagger', 0.55)
          this.melee = null
          this.oneShot('hit', 0.5)
          return
        }
        if (res !== 'none') {
          audio.sfx('sword_hit', { at })
          this.battle.fx.sparks(at, this.def.accent, 50, 18, 0.5)
          this.battle.fx.flash(at, this.def.accent, 2.4, 0.15)
          this.battle.fx.ring(at, this.def.accent, 5, 0.35)
          this.battle.hitstop(0.09)
        }
      }
    }
    if (this.stateT <= 0) { this.melee = null; this.setState(this.grounded ? 'move' : 'air') }
  }

  // --- taking hits -----------------------------------------------------------------------------------------------

  /** Apply a hit. Returns what happened, for effects. */
  takeHit(damage: number, impact: number, from: Mech | null, kind: 'shot' | 'melee' | 'blast'): 'none' | 'blocked' | 'guarded' | 'hit' | 'down' | 'ko' {
    if (this.state === 'ko' || this.state === 'down' || this.invuln > 0 || this.battle.phase !== 'fight') return 'none'
    damage *= DAMAGE_SCALE
    // guard covers the front
    if (this.state === 'guard' && from) {
      const fwd = this.forward(v1)
      v2.set(from.pos.x - this.pos.x, 0, from.pos.z - this.pos.z).normalize()
      if (fwd.dot(v2) > 0.25) {
        if (kind === 'melee') return 'blocked'
        damage *= 0.2
        impact = 0
        this.hp = Math.max(1, this.hp - damage)
        if (from) { from.stats.damage += damage; from.stats.hits++ }
        audio.sfx('guard_block', { at: this.pos, vol: 0.7 })
        this.hitFlash = 0.3
        return 'guarded'
      }
    }
    this.hp -= damage
    this.lastHitAt = this.time
    if (from) { from.stats.damage += Math.min(damage, damage + this.hp); from.stats.hits++ }
    this.hitFlash = 1
    this.charge = null
    this.pending.length = 0
    if (this.battle.isHuman(this)) this.battle.rumbleHit(Math.min(1, impact / 100))
    if (this.hp <= 0) {
      this.hp = 0
      this.ko(from)
      return 'ko'
    }
    this.impact += impact / this.def.weight
    if (this.impact >= 100) {
      this.impact = 0
      this.knockdown(from)
      return 'down'
    }
    if (impact >= 25) {
      this.setState('stagger', 0.18 + impact / 300)
      this.oneShot('hit', 0.4)
      this.melee = null
    }
    return 'hit'
  }

  private knockdown(from: Mech | null): void {
    const away = from ? v1.set(this.pos.x - from.pos.x, 0, this.pos.z - from.pos.z).normalize() : this.forward(v1).negate()
    this.vel.set(away.x * 14, 11, away.z * 14)
    this.grounded = false
    this.melee = null
    this.flip = 0.0001
    this.setState('down', 2)
    this.invuln = 0
    this.play('fly', 0.1)
    audio.sfx('explosion_small', { at: this.pos, vol: 0.7 })
  }

  private ko(from: Mech | null): void {
    const away = from ? v1.set(this.pos.x - from.pos.x, 0, this.pos.z - from.pos.z).normalize() : this.forward(v1).negate()
    this.vel.set(away.x * 10, 9, away.z * 10)
    this.grounded = false
    this.melee = null
    this.setState('ko', 99)
    this.play('destroyed', 0.1)
    this.battle.onKO(this)
  }

  // --- presentation ----------------------------------------------------------------------------------------------

  /** Pose the model, lean it, drive thrusters and sounds. dt is real-time scaled by the battle's slow motion. */
  present(dt: number): void {
    const s = this.state
    const hs = Math.hypot(this.vel.x, this.vel.z)
    const fwd = this.forward(v1)
    const right = v2.set(-fwd.z, 0, fwd.x)
    const vf = this.vel.x * fwd.x + this.vel.z * fwd.z
    const vr = this.vel.x * right.x + this.vel.z * right.z

    // base clip
    if (this.time >= this.oneShotUntil || s === 'ko' || s === 'down') {
      if (s === 'ko') this.play('destroyed', 0.1)
      else if (s === 'dash' || s === 'airdash' || s === 'down') this.play('fly', 0.12)
      else if (s === 'air') this.play('fly', 0.25, 0.6)
      else if (s === 'melee') this.play('melee', 0.08, 1.35)
      else if (s === 'stagger') this.play('hit', 0.06)
      else if (s === 'charge') this.play('shoot', 0.1, 0.9)
      else if ((s === 'move' || s === 'intro' || s === 'guard' || s === 'land' || s === 'dashEnd') && hs > 1.5 && s !== 'guard') {
        const rate = Math.max(0.6, hs / this.def.walk) * 1.15 * (vf < -1 ? -1 : 1)
        this.play('walk', 0.18, rate)
      } else this.play('idle', 0.25)
    }
    this.mixer.update(dt)

    // lean into motion, flip on a knockdown
    let pitch = Math.max(-0.45, Math.min(0.45, vf * 0.012))
    let roll = Math.max(-0.4, Math.min(0.4, -vr * 0.014))
    if (s === 'dash' || s === 'airdash') { pitch = Math.max(-0.5, Math.min(0.55, vf * 0.02)); roll = Math.max(-0.5, Math.min(0.5, -vr * 0.02)) }
    if (s === 'guard') pitch = -0.1
    this.pivot.rotation.x += (pitch - this.pivot.rotation.x) * Math.min(1, dt * 10)
    this.pivot.rotation.z += (roll - this.pivot.rotation.z) * Math.min(1, dt * 10)
    if (s === 'down') {
      this.flip = Math.min(1, this.flip + dt * 1.25)
      this.pivot.rotation.x = -this.flip * Math.PI * 2
      this.pivot.position.y = HEIGHT * 0.5 * Math.sin(this.flip * Math.PI)
    } else this.pivot.position.y = 0
    this.root.position.copy(this.pos)
    this.root.rotation.y = this.yaw
    // the torso turns toward the target when the body has not caught up
    const chest = this.bones['chest']
    if (chest && s !== 'ko' && s !== 'down') {
      const want = Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z)
      const ang = Math.max(-0.6, Math.min(0.6, angDiff(this.yaw, want)))
      if (Math.abs(ang) > 0.01 && chest.parent) {
        // rotate about the world's up axis, expressed in the chest's parent frame
        chest.parent.getWorldQuaternion(q1).invert()
        v3.copy(UP).applyQuaternion(q1)
        chest.quaternion.premultiply(q2.setFromAxisAngle(v3, ang))
      }
    }

    // thrusters
    let power = 0.15
    if (s === 'dash' || s === 'airdash') power = 1.4
    else if (s === 'air') power = this.vel.y > 0 ? 1 : 0.5
    else if (s === 'melee' && this.melee && this.melee.t < 0.3) power = 1.2
    else if (s === 'down' || s === 'ko') power = 0.3
    else if (hs > 2) power = 0.3
    const flick = 0.85 + Math.random() * 0.3
    for (const f of this.flames) {
      f.scale.set(1 + power * 0.6, 0.6 + power * 2.2 * flick, 1 + power * 0.6)
      f.visible = power > 0.05
    }
    this.flameMat.opacity = Math.min(1, 0.35 + power * 0.5)
    if (power > 0.6) {
      for (const f of this.flames) {
        f.getWorldPosition(v3)
        const back = v1.set(-Math.sin(this.yaw), -0.6, -Math.cos(this.yaw)).normalize()
        this.battle.fx.exhaust(v3, back, this.def.accent, power)
      }
      if ((s === 'dash' || s === 'airdash') && Math.random() < 0.5) {
        // speed streaks off the body
        v3.copy(this.pos).add(v1.set((Math.random() - 0.5) * 1.6, Math.random() * HEIGHT, (Math.random() - 0.5) * 1.6))
        this.battle.fx.trail(v3, this.def.accent, 0.35, 0.3)
      }
      if (s === 'dash' && this.grounded && Math.random() < 0.6) this.battle.fx.dust(this.pos, 1, 3)
    }
    this.thrustLoop?.set(power > 0.6 ? Math.min(0.55, power * 0.35) : 0.04, 0.85 + power * 0.25)

    // afterimages while dashing
    this.ghostT -= dt
    if ((s === 'dash' || s === 'airdash' || (s === 'melee' && this.melee && this.melee.t < 0.3)) && this.ghostT <= 0) {
      this.ghostT = 0.07
      const g = this.ghosts.reduce((a, b) => (a.t < b.t ? a : b))
      for (let i = 0; i < g.bones.length && i < this.liveBones.length; i++) {
        g.bones[i].position.copy(this.liveBones[i].position)
        g.bones[i].quaternion.copy(this.liveBones[i].quaternion)
        g.bones[i].scale.copy(this.liveBones[i].scale)
      }
      g.root.position.copy(this.root.position)
      g.root.rotation.copy(this.root.rotation)
      g.pivot.rotation.copy(this.pivot.rotation)
      g.pivot.position.copy(this.pivot.position)
      g.t = 0.28
      g.root.visible = true
    }
    for (const g of this.ghosts) {
      if (g.t <= 0) { g.root.visible = false; continue }
      g.t -= dt
      g.mat.opacity = Math.max(0, g.t / 0.28) * 0.32
    }

    // a badly damaged machine smokes and sparks
    const hk = this.hp / this.def.hp
    if (hk < 0.35 && s !== 'ko' && Math.random() < (0.35 - hk) * 2.5) {
      v3.copy(this.pos).add(v1.set((Math.random() - 0.5) * 0.8, HEIGHT * (0.55 + Math.random() * 0.3), (Math.random() - 0.5) * 0.8))
      this.battle.fx.smokeTrail(v3)
      if (Math.random() < 0.15) this.battle.fx.sparks(v3, 0xffc070, 3, 6, 0.25)
    }
    if (s === 'ko' && Math.random() < 0.6) {
      v3.copy(this.pos).add(v1.set((Math.random() - 0.5) * 1.2, HEIGHT * Math.random() * 0.8, (Math.random() - 0.5) * 1.2))
      this.battle.fx.smokeTrail(v3)
      this.battle.fx.trail(v3, 0xff7a2a, 0.6, 0.3)
    }

    // footsteps
    if (s === 'move' && this.grounded && hs > 2) {
      this.stepT -= dt * hs / this.def.walk
      if (this.stepT <= 0) { this.stepT = 0.5; audio.sfx('footstep', { at: this.pos, vol: 0.35, minGap: 0.1 }) }
    }

    // guard shield
    const sm = this.shield.material as MeshBasicMaterial
    const want = s === 'guard' ? 0.35 : 0
    sm.opacity += (want - sm.opacity) * Math.min(1, dt * 14)
    ;((this.shield.children[0] as Mesh).material as MeshBasicMaterial).opacity = sm.opacity * 2
    this.shield.rotation.z += dt * 1.5
    this.shield.visible = sm.opacity > 0.01

    // hit flash and the invulnerable blink after getting up
    const blink = this.invuln > 0 && s !== 'down' && Math.floor(this.time * 20) % 2 === 0
    for (const m of this.mats) {
      const k = this.hitFlash
      m.emissive.setRGB(k * 1.2, k * 0.9, k * 0.7)
      if (blink) m.emissive.setRGB(0.25, 0.4, 0.5)
    }
    this.sideRing.position.set(this.pos.x, this.battle.arena.groundAt(this.pos, RADIUS, this.pos.y) + 0.04, this.pos.z)
    ;(this.sideRing.material as MeshBasicMaterial).opacity = s === 'ko' ? 0 : 0.8
    void UP
  }
}
