// Every shot in flight: movement, homing (weaker against a dashing target, so dashing is how you dodge), collision
// with cover and machines, explosions, and the look of each kind.
import {
  AdditiveBlending, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry,
  Vector3, type BufferGeometry, type Scene,
} from 'three'
import type { ProjKind, ShotParams, Slot } from './roster'
import { HEIGHT, RADIUS, type Mech } from './mech'
import type { Arena } from './arena'
import type { Fx } from './fx'
import { audio } from './audio'

const SHELL_G = 22

interface Proj {
  kind: ProjKind
  shot: ShotParams
  owner: Mech
  target: Mech
  pos: Vector3
  prev: Vector3
  vel: Vector3
  age: number
  alive: boolean
  mesh: Mesh | null
  slot: Slot
  spin: number
}

const tmp = new Vector3()
const tmp2 = new Vector3()
const tmp3 = new Vector3()
const ab = new Vector3()

/** Closest distance between segment p0-p1 and segment q0-q1. */
function segSegDist(p0: Vector3, p1: Vector3, q0: Vector3, q1: Vector3): number {
  const d1 = tmp.subVectors(p1, p0)
  const d2 = tmp2.subVectors(q1, q0)
  const r = tmp3.subVectors(p0, q0)
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r)
  let s = 0, t = 0
  if (a <= 1e-8 && e <= 1e-8) return r.length()
  if (a <= 1e-8) { t = Math.min(1, Math.max(0, f / e)) } else {
    const c = d1.dot(r)
    if (e <= 1e-8) { s = Math.min(1, Math.max(0, -c / a)) } else {
      const b = d1.dot(d2)
      const den = a * e - b * b
      s = den !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)) } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)) }
    }
  }
  const cx = p0.x + d1.x * s - (q0.x + d2.x * t)
  const cy = p0.y + d1.y * s - (q0.y + d2.y * t)
  const cz = p0.z + d1.z * s - (q0.z + d2.z * t)
  return Math.sqrt(cx * cx + cy * cy + cz * cz)
}

const capA = new Vector3()
const capB = new Vector3()
function capsule(m: Mech): [Vector3, Vector3] {
  capA.set(m.pos.x, m.pos.y + 0.5, m.pos.z)
  capB.set(m.pos.x, m.pos.y + HEIGHT - 0.4, m.pos.z)
  return [capA, capB]
}

export class Projectiles {
  private list: Proj[] = []
  private group = new Group()
  private pools = new Map<string, Mesh[]>()
  private geos: Record<string, BufferGeometry>
  private matCache = new Map<string, MeshBasicMaterial>()
  onHit: (target: Mech, res: string, at: Vector3, p: { shot: ShotParams; owner: Mech }) => void = () => {}

  constructor(scene: Scene, private arena: Arena, private fx: Fx) {
    scene.add(this.group)
    const bolt = new SphereGeometry(1, 12, 8)
    bolt.scale(0.22, 0.22, 1.2)
    const heavy = new SphereGeometry(1, 20, 14)
    const rapid = new SphereGeometry(1, 8, 6)
    rapid.scale(0.12, 0.12, 0.7)
    const missile = new ConeGeometry(0.16, 0.8, 8)
    missile.rotateX(Math.PI / 2)
    const shell = new SphereGeometry(0.34, 12, 8)
    const wave = new TorusGeometry(1.2, 0.12, 6, 24, Math.PI)
    wave.rotateZ(Math.PI / 2)
    wave.scale(1, 1, 0.35)
    const drone = new ConeGeometry(0.3, 1.1, 3)
    drone.rotateX(Math.PI / 2)
    const claw = new CylinderGeometry(0.08, 0.35, 1.4, 6)
    claw.rotateX(Math.PI / 2)
    this.geos = { bolt, heavy, rapid, missile, shell, wave, drone, claw }
  }

  private mat(color: number, k: number): MeshBasicMaterial {
    const key = color + ':' + k
    let m = this.matCache.get(key)
    if (!m) {
      m = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(k), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false })
      this.matCache.set(key, m)
    }
    return m
  }

  private meshFor(kind: ProjKind, color: number): Mesh | null {
    if (kind === 'rail') return null
    const key = kind + ':' + color
    const pool = this.pools.get(key) ?? []
    this.pools.set(key, pool)
    const free = pool.find((m) => !m.visible)
    if (free) { free.visible = true; return free }
    const geo = this.geos[kind]
    const mesh = new Mesh(geo, this.mat(kind === 'shell' ? 0x302820 : color, kind === 'heavy' ? 2.2 : 3))
    if (kind === 'shell') {
      mesh.material = new MeshBasicMaterial({ color: 0x2a2420 })
      const core = new Mesh(new SphereGeometry(0.2, 8, 6), this.mat(color, 4))
      mesh.add(core)
    }
    if (kind === 'heavy' || kind === 'bolt' || kind === 'missile') {
      const halo = new Mesh(new SphereGeometry(1, 12, 8), this.mat(color, 0.7))
      halo.scale.setScalar(kind === 'heavy' ? 1.6 : 1.8)
      if (kind !== 'heavy') halo.scale.set(0.45, 0.45, 1.6)
      mesh.add(halo)
    }
    mesh.renderOrder = 3
    this.group.add(mesh)
    pool.push(mesh)
    return mesh
  }

  clear(): void {
    for (const p of this.list) if (p.mesh) p.mesh.visible = false
    this.list.length = 0
  }

  spawn(owner: Mech, shot: ShotParams, origin: Vector3, aim: Vector3, fan: number, slot: Slot): void {
    const target = owner.target
    const dir = tmp.subVectors(aim, origin)
    const dist = dir.length()
    dir.normalize()
    if (fan !== 0) dir.applyAxisAngle(ab.set(0, 1, 0), fan)
    this.fx.muzzle(origin, dir, shot.color, shot.kind === 'heavy' ? 1.6 : shot.kind === 'rapid' ? 0.6 : 1)
    audio.sfx(shot.sfx, { at: origin, vol: shot.kind === 'rapid' ? 0.6 : 0.9, minGap: shot.kind === 'rapid' ? 0.05 : 0.03 })

    if (shot.kind === 'rail') {
      this.fireRail(owner, shot, origin, dir)
      return
    }
    const vel = dir.clone().multiplyScalar(shot.speed)
    if (shot.kind === 'shell') {
      // lob it to land on where the target is heading
      const lead = tmp2.copy(target.pos).addScaledVector(target.vel, dist / shot.speed * 0.5)
      const flat = Math.hypot(lead.x - origin.x, lead.z - origin.z)
      const T = Math.max(0.6, (flat / shot.speed) * (1 + (shot.arc ?? 0.5)))
      vel.set((lead.x - origin.x) / T, (lead.y - origin.y + 0.5 * SHELL_G * T * T) / T, (lead.z - origin.z) / T)
      if (fan !== 0) {
        const s = new Vector3(vel.x, 0, vel.z).applyAxisAngle(ab.set(0, 1, 0), fan * 0.6)
        vel.x = s.x * (0.85 + Math.random() * 0.3); vel.z = s.z * (0.85 + Math.random() * 0.3)
      }
    }
    if (shot.kind === 'wave') vel.y *= 0.3
    if (shot.kind === 'drone' || shot.kind === 'missile') {
      // launch upward and outward first, then the homing takes over
      vel.multiplyScalar(0.6).add(ab.set(0, shot.kind === 'drone' ? 6 : 9, 0))
    }
    const p: Proj = {
      kind: shot.kind, shot, owner, target, slot,
      pos: origin.clone(), prev: origin.clone(), vel, age: 0, alive: true,
      mesh: this.meshFor(shot.kind, shot.color), spin: Math.random() * 6,
    }
    if (p.mesh) {
      p.mesh.position.copy(p.pos)
      if (shot.kind === 'heavy') p.mesh.scale.setScalar(shot.radius * 0.7)
      else p.mesh.scale.setScalar(shot.kind === 'wave' ? shot.radius / 1.2 : 1)
    }
    this.list.push(p)
  }

  private fireRail(owner: Mech, shot: ShotParams, origin: Vector3, dir: Vector3): void {
    const far = tmp2.copy(origin).addScaledVector(dir, 220)
    const t = this.arena.sweep(origin, far, 0.1)
    const end = t >= 0 ? new Vector3().lerpVectors(origin, far, t) : far.clone()
    const target = owner.target
    const [a, b] = capsule(target)
    const d = segSegDist(origin, end, a, b)
    let hitAt = end
    if (d < RADIUS * 0.9 + shot.radius) {
      hitAt = target.centerInto(new Vector3())
      const res = target.takeHit(shot.damage, shot.impact, owner, 'shot')
      this.onHit(target, res, hitAt, { shot, owner })
    } else if (t >= 0) {
      this.fx.sparks(end, shot.color, 18, 10)
    }
    this.fx.beam(origin, hitAt, shot.color, 0.18, 0.35)
    this.fx.beam(origin, hitAt, 0xffffff, 0.06, 0.2)
    this.fx.flash(hitAt, shot.color, 1.6, 0.15)
  }

  private explode(p: Proj, at: Vector3): void {
    const r = p.shot.blast ?? 0
    if (r > 0) {
      this.fx.explosion(at, r * 0.55, p.shot.kind === 'missile' ? 0xff9a4a : 0xff7a2a)
      audio.sfx(r > 3 ? 'explosion_big' : 'explosion_small', { at, vol: r > 3 ? 0.8 : 0.7, minGap: 0.06 })
      const t = p.target
      const c = t.centerInto(tmp2)
      const d = c.distanceTo(at)
      if (d < r + RADIUS) {
        const k = 1 - Math.max(0, d - RADIUS) / r
        const res = t.takeHit(p.shot.damage * (0.5 + 0.5 * k), p.shot.impact * k, p.owner, 'blast')
        this.onHit(t, res, c, p)
      }
    } else {
      this.fx.sparks(at, p.shot.color, 14, 9)
      this.fx.flash(at, p.shot.color, p.kind === 'heavy' ? 2.5 : 1, 0.1)
      if (p.kind === 'heavy') audio.sfx('explosion_small', { at, vol: 0.6 })
    }
    this.kill(p)
  }

  private kill(p: Proj): void {
    p.alive = false
    if (p.mesh) p.mesh.visible = false
  }

  step(dt: number): void {
    for (const p of this.list) {
      if (!p.alive) continue
      p.age += dt
      p.prev.copy(p.pos)
      const s = p.shot
      // homing
      if (s.homing > 0 && p.age < s.homingTime && p.target.alive) {
        const evading = p.target.state === 'dash' || p.target.state === 'airdash'
        const rate = s.homing * (evading ? 0.3 : 1) * (p.kind === 'missile' || p.kind === 'drone' ? Math.min(1, p.age * 3) : 1)
        const want = p.target.centerInto(tmp2).sub(p.pos)
        if (p.kind === 'wave') want.y = 0
        want.normalize()
        const speed = p.vel.length()
        const cur = tmp3.copy(p.vel).normalize()
        const ang = cur.angleTo(want)
        if (ang > 1e-4) {
          const k = Math.min(1, (rate * dt) / ang)
          cur.lerp(want, k).normalize()
        }
        const accel = p.kind === 'missile' || p.kind === 'drone' ? Math.min(s.speed, speed + s.speed * 1.5 * dt) : speed
        p.vel.copy(cur).multiplyScalar(accel)
      }
      if (p.kind === 'shell') p.vel.y -= SHELL_G * dt
      if (p.kind === 'wave') {
        // waves ride just over the deck
        const g = this.arena.groundAt(p.pos, 0.2, p.pos.y)
        p.vel.y += ((g + 1.1) - p.pos.y) * 8 * dt
      }
      p.pos.addScaledVector(p.vel, dt)

      // cover and deck
      const t = this.arena.sweep(p.prev, p.pos, p.kind === 'wave' ? 0.1 : s.radius * 0.5)
      if (t >= 0 && !(p.kind === 'wave' && p.pos.y > 0.3 && this.arena.sweep(p.prev, p.pos, 0.05) < 0)) {
        const at = new Vector3().lerpVectors(p.prev, p.pos, t)
        this.explode(p, at)
        continue
      }
      // the target
      if (p.target.alive) {
        const [a, b] = capsule(p.target)
        const d = segSegDist(p.prev, p.pos, a, b)
        if (d < s.radius + RADIUS * 0.8) {
          const at = p.pos.clone()
          if (s.blast) { this.explode(p, at); continue }
          const res = p.target.takeHit(s.damage, s.impact, p.owner, 'shot')
          this.onHit(p.target, res, at, p)
          if (res === 'none' && p.target.state === 'down') continue // passes through a machine that is down
          this.explode(p, at)
          continue
        }
      }
      if (p.age > s.life || this.arena.outside(p.pos)) {
        if (s.blast) this.explode(p, p.pos.clone())
        else this.kill(p)
        continue
      }
      // look
      if (p.mesh) {
        p.mesh.position.copy(p.pos)
        if (p.kind === 'heavy' || p.kind === 'shell') {
          p.mesh.rotation.y += dt * 4
        } else {
          tmp.copy(p.pos).add(p.vel)
          p.mesh.lookAt(tmp)
          if (p.kind === 'drone') { p.spin += dt * 14; p.mesh.rotateZ(p.spin) }
          if (p.kind === 'wave') p.mesh.rotateZ(Math.PI / 2)
        }
      }
      // trails
      if (p.kind === 'missile') { this.fx.smokeTrail(p.pos); this.fx.trail(p.pos, 0xffc070, 0.5, 0.12) }
      else if (p.kind === 'bolt') this.fx.trail(p.pos, s.color, 0.55, 0.22)
      else if (p.kind === 'heavy') { this.fx.trail(p.pos, s.color, s.radius * 1.4, 0.3); if (Math.random() < 0.5) this.fx.sparks(p.pos, s.color, 1, 6, 0.3) }
      else if (p.kind === 'wave') { this.fx.trail(p.pos, s.color, 0.8, 0.35); this.fx.trail(tmp.copy(p.pos).setY(p.pos.y - 0.8), s.color, 0.5, 0.3) }
      else if (p.kind === 'drone') this.fx.trail(p.pos, s.color, 0.4, 0.3)
      else if (p.kind === 'shell') this.fx.trail(p.pos, s.color, 0.4, 0.4)
      else if (p.kind === 'claw') this.fx.trail(p.pos, s.color, 0.35, 0.12)
    }
    if (this.list.length > 64) this.list = this.list.filter((p) => p.alive)
  }

  /** Shots heading at this machine, for the CPU's dodge: the soonest time to impact, or Infinity. */
  threat(m: Mech): { t: number; dir: Vector3 } {
    let best = Infinity
    const dir = new Vector3()
    const c = m.centerInto(new Vector3())
    for (const p of this.list) {
      if (!p.alive || p.target !== m) continue
      const rel = tmp.subVectors(c, p.pos)
      const sp = p.vel.length()
      if (sp < 1) continue
      const along = rel.dot(p.vel) / sp
      if (along <= 0) continue
      const t = along / sp
      const miss = Math.sqrt(Math.max(0, rel.lengthSq() - along * along))
      if (miss < 3.5 && t < best) { best = t; dir.copy(p.vel).normalize() }
    }
    return { t: best, dir }
  }

  get count(): number {
    return this.list.filter((p) => p.alive).length
  }
}
