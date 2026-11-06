// The CPU pilot. It keeps its machine's preferred range, circles, dodges incoming fire by dashing across it, fires
// when it has a line of sight, and closes for melee when its machine likes it close. Difficulty sets reaction time,
// how often it dodges and how aggressively it spends its gauges.
import { Vector3 } from 'three'
import { emptyIntent, type Intent } from './input'
import type { Mech } from './mech'
import type { Battle } from './battle'
import type { Slot } from './roster'

export interface Skill { react: number; dodge: number; aggression: number; guard: number; airplay: number }

export const DIFFICULTY: Skill[] = [
  { react: 0.55, dodge: 0.25, aggression: 0.5, guard: 0.05, airplay: 0.1 }, // Cadet
  { react: 0.36, dodge: 0.5, aggression: 0.8, guard: 0.15, airplay: 0.25 }, // Pilot
  { react: 0.22, dodge: 0.72, aggression: 1.05, guard: 0.3, airplay: 0.4 }, // Veteran
  { react: 0.13, dodge: 0.88, aggression: 1.3, guard: 0.45, airplay: 0.5 }, // Ace
]
export const DIFFICULTY_NAMES = ['Cadet', 'Pilot', 'Veteran', 'Ace']

const RANGE: Record<string, number> = { u07: 18, u11: 34, u12: 7, u14: 22, u15: 30, u02: 14 }

export type DummyMode = 'stand' | 'walk' | 'fight'

export class Brain {
  private strafe = Math.random() < 0.5 ? -1 : 1
  private strafeT = 0
  private thinkT = 0
  private dodgeT = 0
  private plan = { mx: 0, my: 0 }
  private holdJump = 0
  private guardT = 0
  private wantFire: Slot | null = null
  private fireAt = 0
  private time = 0
  private airPlan = 0
  dummy: DummyMode | null = null

  constructor(public skill: Skill) {}

  think(dt: number, me: Mech, battle: Battle): Intent {
    this.time += dt
    const it = emptyIntent()
    if (!me.alive) return it
    if (this.dummy === 'stand') return it
    if (this.dummy === 'walk') {
      this.strafeT -= dt
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 2 + Math.random() * 2 }
      it.mx = this.strafe * 0.8
      return it
    }
    const foe = me.target
    const sk = this.skill
    const dist = me.distance
    const pref = RANGE[me.def.id] ?? 18
    const a = me.centerInto(new Vector3())
    const b = foe.centerInto(new Vector3())
    const los = battle.arena.clear(a, b)

    // movement plan, refreshed every reaction period
    this.thinkT -= dt
    this.strafeT -= dt
    if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1.2 + Math.random() * 2.5 }
    if (this.thinkT <= 0) {
      this.thinkT = sk.react * (0.7 + Math.random() * 0.6)
      const err = dist - pref
      let my = Math.max(-1, Math.min(1, err / 8))
      let mx = this.strafe * (0.6 + Math.random() * 0.4)
      if (!los) { mx = this.strafe; my = 0.4 } // work around cover
      this.plan = { mx, my }
      // decide a shot
      if (foe.alive && foe.state !== 'down' && Math.random() < sk.aggression * 0.8) {
        const close = dist < me.def.melee.range
        const meleeFan = pref < 10 || Math.random() < 0.35
        if (close && meleeFan) this.wantFire = Math.random() < 0.3 ? 'C' : 'R'
        else if (los || me.def.weapons.L.stand.kind === 'shell' || me.def.weapons.L.stand.kind === 'missile') {
          const opts: Slot[] = []
          for (const s of ['L', 'R', 'C'] as Slot[]) {
            const w = me.def.weapons[s]
            if (me.gauge[s] >= w.cost && me.cool[s] <= 0) opts.push(s)
          }
          if (opts.length) {
            // the centre weapon when its gauge is full, otherwise whichever is ready
            this.wantFire = opts.includes('C') && me.gauge.C >= 100 && Math.random() < 0.6 ? 'C' : opts[Math.floor(Math.random() * opts.length)]
          }
        }
        this.fireAt = this.time + Math.random() * 0.15
      }
      // a dash to reposition now and then
      if (me.state === 'move' && Math.random() < 0.18 * sk.aggression) {
        it.dash = true
        this.plan.mx = this.strafe
        this.plan.my = dist > pref + 6 ? 0.8 : dist < pref - 6 ? -0.6 : 0
      }
      // jump play
      if (me.state === 'move' && Math.random() < sk.airplay * 0.25) {
        it.jump = true
        this.holdJump = 0.3
        this.airPlan = Math.random() < 0.6 ? 0.35 + Math.random() * 0.2 : 0
      }
    }

    // dodge incoming fire
    this.dodgeT -= dt
    const th = battle.projectiles.threat(me)
    if (th.t < 0.7 && this.dodgeT <= 0) {
      this.dodgeT = sk.react
      if (Math.random() < sk.dodge) {
        // dash across the shot's path
        const side = new Vector3(-th.dir.z, 0, th.dir.x)
        const fx = foe.pos.x - me.pos.x, fz = foe.pos.z - me.pos.z
        const fl = Math.hypot(fx, fz) || 1
        const rx = -fz / fl, rz = fx / fl
        const s = side.x * rx + side.z * rz >= 0 ? 1 : -1
        this.plan.mx = s * this.strafe
        this.plan.my = 0
        if (me.state === 'move' || me.state === 'guard') it.dash = true
        else if (me.state === 'air' && !me.airDashUsed) it.dash = true
      } else if (Math.random() < sk.guard && me.state === 'move') {
        this.guardT = 0.4
      }
    }
    // a melee coming in
    if (foe.state === 'melee' && dist < 6 && Math.random() < sk.guard * dt * 20 && me.state === 'move') this.guardT = 0.5

    it.mx = this.plan.mx
    it.my = this.plan.my
    if (this.holdJump > 0) { it.jumpHeld = true; this.holdJump -= dt }
    if (this.airPlan > 0 && me.state === 'air') {
      this.airPlan -= dt
      if (this.airPlan <= 0 && !me.airDashUsed) { it.dash = true; it.mx = this.strafe; it.my = 0.3 }
    }
    if (this.guardT > 0) { it.guard = true; this.guardT -= dt; it.dash = false; it.jump = false }
    if (this.wantFire && this.time >= this.fireAt && me.canAct && !it.guard) {
      it.fire = this.wantFire
      this.wantFire = null
    }
    return it
  }
}
