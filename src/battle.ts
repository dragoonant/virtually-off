// One match: two machines in an arena, best of three rounds against the CPU (or an endless training session).
// Runs the simulation at a fixed 60 Hz with hit-stop and knockout slow motion; the renderer and HUD read from it.
import { Scene, Vector3 } from 'three'
import { Arena, type ArenaDef } from './arena'
import { Fx } from './fx'
import { Mech } from './mech'
import { Projectiles } from './projectiles'
import { ChaseCam } from './camera'
import { Brain, DIFFICULTY, type DummyMode } from './ai'
import { HumanControls, rumble, emptyIntent } from './input'
import { audio } from './audio'
import type { MechDef, ShotParams, Slot } from './roster'

export type Phase = 'intro' | 'ready' | 'fight' | 'ko' | 'roundEnd' | 'over'
export interface Banner { text: string; sub?: string; t: number; style: 'round' | 'engage' | 'ko' | 'result' | 'small' }
export interface Popup { at: Vector3; text: string; t: number; color: string; big: boolean }

export interface MatchResult { winner: 0 | 1 | -1; wins: [number, number]; perfect: boolean; time: number; stats: Mech['stats'][] }

export interface BattleOptions {
  p1: MechDef
  p2: MechDef
  arena: ArenaDef
  mode: 'arcade' | 'training'
  difficulty: number
  controls: HumanControls
  dummy?: DummyMode
}

const STEP = 1 / 60
export const ROUND_TIME = 99

export class Battle {
  readonly scene = new Scene()
  readonly arena: Arena
  readonly fx: Fx
  readonly projectiles: Projectiles
  readonly camera: ChaseCam
  readonly mechs: [Mech, Mech]
  readonly brain: Brain
  readonly opts: BattleOptions
  phase: Phase = 'intro'
  phaseT = 0
  round = 1
  wins: [number, number] = [0, 0]
  timer = ROUND_TIME
  banner: Banner | null = null
  popups: Popup[] = []
  paused = false
  matchTime = 0
  private acc = 0
  private hitstopT = 0
  private koQueue: { t: number; at: Vector3; r: number }[] = []
  private roundWinner: 0 | 1 | -1 = -1
  private perfect = true
  onOver: (r: MatchResult) => void = () => {}
  events = { dash: (_m: Mech) => {} }
  /** Test hook: a CPU pilot for the player's machine too (CPU vs CPU). */
  autopilot: Brain | null = null

  constructor(opts: BattleOptions, aspect: number) {
    this.opts = opts
    this.arena = new Arena(opts.arena)
    this.arena.build(this.scene)
    this.fx = new Fx(this.scene)
    this.projectiles = new Projectiles(this.scene, this.arena, this.fx)
    this.projectiles.onHit = (t, res, at, p) => this.hitFx(t, res, at, p.shot, p.owner)
    this.camera = new ChaseCam(aspect)
    const a = new Mech(opts.p1, 0)
    const b = new Mech(opts.p2, 1)
    a.attach(this, b)
    b.attach(this, a)
    this.mechs = [a, b]
    this.brain = new Brain(DIFFICULTY[Math.max(0, Math.min(3, opts.difficulty))])
    if (opts.mode === 'training') this.brain.dummy = opts.dummy ?? 'walk'
    this.placeForRound()
    if (opts.mode === 'training') {
      this.setPhase('ready')
      this.phaseT = 1.0
      audio.voice('training')
      this.say('TRAINING RANGE', 'Free fire · nothing counts', 'round', 2)
    } else {
      this.setPhase('intro')
      this.camera.set('intro')
    }
    audio.music(opts.arena.music)
  }

  dispose(): void {
    for (const m of this.mechs) m.dispose()
    this.scene.traverse((o) => {
      const mesh = o as { geometry?: { dispose(): void } }
      mesh.geometry?.dispose()
    })
  }

  isHuman(m: Mech): boolean {
    return m === this.mechs[0]
  }

  get human(): Mech { return this.mechs[0] }
  get cpu(): Mech { return this.mechs[1] }

  private placeForRound(): void {
    const s = this.arena.def.size * 0.55
    const [a, b] = this.mechs
    const ang = Math.random() * Math.PI * 2
    a.pos.set(Math.sin(ang) * s, 0, Math.cos(ang) * s)
    b.pos.set(-Math.sin(ang) * s, 0, -Math.cos(ang) * s)
    for (const m of this.mechs) {
      // make sure neither starts inside a block
      for (let i = 0; i < 30 && this.arena.pushOut(m.pos, 1.2, 2.2); i++) { /* push until clear */ }
      m.pos.y = this.arena.groundAt(m.pos, 1, 50)
      m.vel.set(0, 0, 0)
      m.hp = m.def.hp
      m.gauge = { L: 100, R: 100, C: 100 }
      m.cool = { L: 0, R: 0, C: 0 }
      m.impact = 0
      m.invuln = 0
      m.charge = null
      m.melee = null
      m.pending.length = 0
      m.setState('intro')
    }
    a.yaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z)
    b.yaw = Math.atan2(a.pos.x - b.pos.x, a.pos.z - b.pos.z)
    this.projectiles.clear()
    this.timer = ROUND_TIME
    this.camera.snapBehind(a, b)
  }

  private announced = false

  private setPhase(p: Phase): void {
    this.phase = p
    this.phaseT = 0
    this.announced = false
  }

  say(text: string, sub: string | undefined, style: Banner['style'], t = 1.6): void {
    this.banner = { text, sub, t, style }
  }

  // --- the frame ------------------------------------------------------------------------------------------------

  update(realDt: number): void {
    if (this.paused) return
    const dt = Math.min(realDt, 0.1)
    // slow motion after a knockout
    let scale = 1
    if (this.fx.slowmo > 0) { this.fx.slowmo -= dt; scale = 0.25 }
    const sdt = dt * scale
    this.phaseT += sdt
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null }
    for (const p of this.popups) p.t -= dt
    this.popups = this.popups.filter((p) => p.t > 0)

    this.flow(sdt)

    if (this.hitstopT > 0) {
      this.hitstopT -= dt
    } else {
      this.acc += sdt
      let n = 0
      while (this.acc >= STEP && n < 6) {
        this.simStep(STEP)
        this.acc -= STEP
        n++
      }
      for (const m of this.mechs) m.present(sdt)
    }
    // knockout explosion series
    for (const k of this.koQueue) {
      k.t -= sdt
      if (k.t <= 0) {
        this.fx.explosion(k.at, k.r, 0xff8a3d)
        audio.sfx(k.r > 2.5 ? 'explosion_big' : 'explosion_small', { at: k.at, vol: 0.9, minGap: 0.05 })
      }
    }
    this.koQueue = this.koQueue.filter((k) => k.t > 0)
    this.fx.update(sdt)
    this.arena.update(dt)
    const [a, b] = this.mechs
    this.arena.focus(new Vector3().lerpVectors(a.pos, b.pos, 0.5))
    const look = this.phase === 'fight' ? this.lastLook : 0
    this.camera.update(dt, a, b, this.arena, this.fx.shake, look)
    audio.listener.x = this.camera.cam.position.x
    audio.listener.z = this.camera.cam.position.z
    audio.listener.yaw = a.yaw
  }

  private lastLook = 0

  private simStep(dt: number): void {
    const [a, b] = this.mechs
    const fighting = this.phase === 'fight'
    const frozen = !fighting && this.phase !== 'ko' && this.phase !== 'roundEnd'
    const hi = this.autopilot ? (fighting ? this.autopilot.think(dt, a, this) : emptyIntent()) : fighting || this.phase === 'ko' ? this.opts.controls.read() : emptyIntent()
    this.lastLook = hi.look
    const ci = fighting ? this.brain.think(dt, b, this) : emptyIntent()
    a.step(dt, this.phase === 'ko' || this.phase === 'roundEnd' ? emptyIntent() : hi, frozen)
    b.step(dt, ci, frozen || this.phase === 'ko' || this.phase === 'roundEnd')
    a.tickCharge(dt)
    b.tickCharge(dt)
    this.projectiles.step(dt)
    if (fighting) {
      this.matchTime += dt
      if (this.opts.mode === 'arcade') {
        this.timer -= dt
        if (this.timer <= 0) { this.timer = 0; this.timeUp() }
      } else {
        // training: nobody stays down
        for (const m of this.mechs) if (m.hp < m.def.hp * 0.2) { m.hp = m.def.hp; this.say('REPAIRED', undefined, 'small', 1) }
      }
    }
  }

  private flow(dt: number): void {
    void dt
    const t = this.phaseT
    if (this.phase === 'intro') {
      if (t > 3.2) {
        this.setPhase('ready')
        this.camera.set('chase')
        this.camera.snapBehind(this.mechs[0], this.mechs[1])
      }
    } else if (this.phase === 'ready') {
      if (this.opts.mode === 'arcade' && !this.announced) {
        this.announced = true
        const last = this.wins[0] === 1 && this.wins[1] === 1
        this.say(last ? 'FINAL ROUND' : 'ROUND ' + ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][this.round - 1], undefined, 'round', 1.4)
        audio.voice(last ? 'round_final' : this.round === 1 ? 'round1' : 'round2')
      }
      if (t > 1.6) {
        this.setPhase('fight')
        for (const m of this.mechs) m.setState('move')
        this.opts.controls.reset()
        if (this.opts.mode === 'arcade') { this.say('ENGAGE', undefined, 'engage', 0.9); audio.voice('engage') }
        audio.sfx('power_up', { vol: 0.6 })
      }
    } else if (this.phase === 'ko') {
      if (t > 2.6) {
        this.setPhase('roundEnd')
        const w = this.roundWinner
        if (w === 0 || w === 1) this.wins[w]++
        const name = w === 0 ? 'YOU WIN THE ROUND' : w === 1 ? 'ROUND LOST' : 'DRAW'
        this.say(name, undefined, 'small', 1.6)
      }
    } else if (this.phase === 'roundEnd') {
      if (t > 1.8) {
        if (this.wins[0] >= 2 || this.wins[1] >= 2 || this.round >= 5) {
          this.setPhase('over')
          const winner: 0 | 1 | -1 = this.wins[0] > this.wins[1] ? 0 : this.wins[1] > this.wins[0] ? 1 : -1
          this.onOver({ winner, wins: this.wins, perfect: this.perfect && winner === 0, time: this.matchTime, stats: this.mechs.map((m) => m.stats) })
        } else {
          this.round++
          this.placeForRound()
          this.camera.set('chase')
          this.setPhase('ready')
          this.banner = null
        }
      }
    }
  }

  private timeUp(): void {
    const [a, b] = this.mechs
    const ra = a.hp / a.def.hp, rb = b.hp / b.def.hp
    this.roundWinner = ra > rb ? 0 : rb > ra ? 1 : -1
    if (this.roundWinner !== 0) this.perfect = false
    this.say('TIME UP', undefined, 'ko', 2.2)
    audio.voice('timeup')
    this.setPhase('ko')
    this.camera.set('orbit', this.roundWinner === 1 ? b : a)
  }

  onKO(m: Mech): void {
    if (this.opts.mode === 'training') {
      m.hp = m.def.hp
      m.setState('air')
      return
    }
    if (this.phase !== 'fight') return
    this.roundWinner = m === this.mechs[1] ? 0 : 1
    if (this.roundWinner === 1) this.perfect = false
    if (this.human.hp < this.human.def.hp) this.perfect = false
    this.setPhase('ko')
    this.fx.slowmo = 1.3
    this.camera.set('ko', m)
    this.say('MACHINE DOWN', undefined, 'ko', 2.4)
    audio.voice('down')
    audio.sfx('ko_blast', { at: m.pos, vol: 1 })
    rumble(1, 1, 700)
    const c = m.centerInto(new Vector3())
    this.fx.explosion(c, 3.2, 0xffa050)
    for (let i = 0; i < 7; i++) {
      this.koQueue.push({ t: 0.25 + i * 0.28, at: c.clone().add(new Vector3((Math.random() - 0.5) * 2.5, Math.random() * 1.8 - 0.4, (Math.random() - 0.5) * 2.5)), r: 1.2 + Math.random() * 1.6 })
    }
    this.koQueue.push({ t: 2.1, at: c.clone(), r: 4.5 })
  }

  spawnShot(owner: Mech, shot: ShotParams, origin: Vector3, aim: Vector3, fan: number, slot: Slot): void {
    // CPU aim error, so it does not hit with every shot
    if (owner === this.cpu) {
      const err = (1.3 - this.brain.skill.aggression * 0.6) * 1.4
      aim.x += (Math.random() - 0.5) * err
      aim.y += (Math.random() - 0.5) * err * 0.5
      aim.z += (Math.random() - 0.5) * err
    }
    this.projectiles.spawn(owner, shot, origin, aim, fan, slot)
  }

  private hitFx(t: Mech, res: string, at: Vector3, shot: ShotParams, owner: Mech): void {
    if (res === 'none') return
    const beam = shot.kind === 'bolt' || shot.kind === 'heavy' || shot.kind === 'rail' || shot.kind === 'wave'
    if (res === 'guarded') {
      this.fx.sparks(at, 0xffffff, 16, 10)
      return
    }
    audio.sfx(beam ? 'hit_beam' : 'hit_metal', { at, vol: 0.9, minGap: 0.04 })
    this.fx.sparks(at, shot.color, res === 'down' ? 50 : 22, res === 'down' ? 16 : 11, 0.4)
    this.fx.flash(at, shot.color, res === 'down' ? 2.6 : 1.3, 0.12)
    if (res === 'down') {
      this.fx.ring(at, shot.color, 6, 0.4)
      this.hitstop(0.07)
      this.fx.shake = Math.min(1, this.fx.shake + 0.5)
    } else this.fx.shake = Math.min(1, this.fx.shake + (t === this.human ? 0.3 : 0.12))
    const dmg = Math.round(shot.damage)
    this.popups.push({ at: at.clone(), text: res === 'down' ? dmg + ' DOWN' : String(dmg), t: 0.9, color: owner === this.human ? '#ffd27a' : '#ff6a5a', big: res === 'down' || res === 'ko' })
  }

  hitstop(t: number): void {
    this.hitstopT = Math.max(this.hitstopT, t)
  }

  rumbleHit(k: number): void {
    rumble(0.3 + k * 0.7, 0.4 + k * 0.4, 120 + k * 200)
  }
}
