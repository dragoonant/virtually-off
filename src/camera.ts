// The chase camera: behind the player's machine, always framing the lock-on target, with shake, a free-look nudge
// from the right stick, and scripted shots for the round intro and the knockout.
import { PerspectiveCamera, Vector3 } from 'three'
import type { Mech } from './mech'
import type { Arena } from './arena'

const v = new Vector3()
const w = new Vector3()

export type CamMode = 'chase' | 'intro' | 'ko' | 'orbit'

export class ChaseCam {
  readonly cam: PerspectiveCamera
  mode: CamMode = 'chase'
  modeT = 0
  private pos = new Vector3(0, 8, -20)
  private look = new Vector3()
  private lookOffset = 0
  focus: Mech | null = null

  constructor(aspect: number) {
    this.cam = new PerspectiveCamera(62, aspect, 0.1, 2000)
  }

  set(mode: CamMode, focus: Mech | null = null): void {
    this.mode = mode
    this.modeT = 0
    if (focus) this.focus = focus
  }

  update(dt: number, me: Mech, foe: Mech, arena: Arena, shake: number, look: number): void {
    this.modeT += dt
    const t = this.modeT
    if (this.mode === 'intro') {
      // a slow orbit around the opponent, then swing behind the player
      const ang = 1.8 - t * 0.5
      v.copy(foe.pos).add(w.set(Math.sin(ang) * 9, 3.2 + t * 0.4, Math.cos(ang) * 9))
      this.pos.lerp(v, Math.min(1, dt * 3))
      this.look.lerp(w.copy(foe.pos).setY(foe.pos.y + 1.4), Math.min(1, dt * 4))
    } else if (this.mode === 'ko' || this.mode === 'orbit') {
      const f = this.focus ?? foe
      const ang = t * 0.35 + 0.6
      v.copy(f.pos).add(w.set(Math.sin(ang) * 11, 4.5, Math.cos(ang) * 11))
      arena.clampBounds(v, 1)
      this.pos.lerp(v, Math.min(1, dt * 2.5))
      this.look.lerp(w.copy(f.pos).setY(f.pos.y + 1.2), Math.min(1, dt * 5))
    } else {
      this.lookOffset += (look * 0.9 - this.lookOffset) * Math.min(1, dt * 6)
      const dx = foe.pos.x - me.pos.x, dz = foe.pos.z - me.pos.z
      const dist = Math.hypot(dx, dz) || 1
      const yaw = Math.atan2(dx, dz) + this.lookOffset
      const fx = Math.sin(yaw), fz = Math.cos(yaw)
      // close in when the fight is close, pull back when it is far
      const back = 8.4 + Math.min(3, dist * 0.05)
      const up = 3.9 + Math.max(0, (me.pos.y - foe.pos.y) * 0.25) + Math.max(0, 7 - dist) * 0.35
      v.set(me.pos.x - fx * back, me.pos.y + up, me.pos.z - fz * back)
      // keep the camera inside the fence so it never looks through it
      arena.clampBounds(v, 0.6)
      const k = 1 - Math.exp(-dt * 9)
      this.pos.lerp(v, k)
      // look between the two, biased toward the target, and lift when the target is above
      const bias = Math.min(0.72, 0.45 + 8 / (dist + 8) * 0.0)
      w.set(me.pos.x + dx * bias, me.pos.y + 2.4 + (foe.pos.y - me.pos.y) * 0.55, me.pos.z + dz * bias)
      if (dist < 6) w.lerp(v.set(me.pos.x + fx * 6, me.pos.y + 1.6, me.pos.z + fz * 6), 0.5)
      this.look.lerp(w, 1 - Math.exp(-dt * 12))
    }
    this.cam.position.copy(this.pos)
    if (shake > 0) {
      const s = shake * shake * 0.6
      this.cam.position.x += (Math.random() - 0.5) * s
      this.cam.position.y += (Math.random() - 0.5) * s
      this.cam.position.z += (Math.random() - 0.5) * s
    }
    this.cam.lookAt(this.look)
  }

  snapBehind(me: Mech, foe: Mech): void {
    const dx = foe.pos.x - me.pos.x, dz = foe.pos.z - me.pos.z
    const d = Math.hypot(dx, dz) || 1
    this.pos.set(me.pos.x - (dx / d) * 9, me.pos.y + 4, me.pos.z - (dz / d) * 9)
    this.look.set(foe.pos.x, foe.pos.y + 1.4, foe.pos.z)
  }
}
