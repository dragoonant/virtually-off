// Controller and keyboard input. The game reads one Intent per simulation step for each machine; the CPU builds the
// same Intent, so a human and a CPU machine run through identical code.
import type { Slot } from './roster'

export interface Intent {
  mx: number // strafe, -1 left .. 1 right
  my: number // -1 back .. 1 toward the target
  look: number // right stick x: camera offset
  dash: boolean // pressed this step
  dashHeld: boolean
  jump: boolean
  jumpHeld: boolean
  guard: boolean
  fire: Slot | null // a pull this step, already resolved from the trigger chord
  turn: boolean // quick turn: snap to face the target
}

export const emptyIntent = (): Intent => ({
  mx: 0, my: 0, look: 0, dash: false, dashHeld: false, jump: false, jumpHeld: false, guard: false, fire: null, turn: false,
})

export type ControlMode = 'modern' | 'lever'

// Xbox layout under the browser's standard gamepad mapping.
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const

const DEAD = 0.18
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD))
const CHORD_STEPS = 5 // a trigger waits this many steps (about 83 ms) for the other one before firing alone

const keys = new Set<string>()
// keys pressed since the last frame, so a tap shorter than a frame still counts
const taps = new Set<string>()
const down = (c: string) => keys.has(c) || taps.has(c)
/** Called once at the end of every frame. */
export function endFrame(): void {
  taps.clear()
}
let lastPadIndex = -1
export let lastDevice: 'pad' | 'keys' = 'keys'

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    keys.add(e.code)
    if (!e.repeat) taps.add(e.code)
    lastDevice = 'keys'
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault()
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  window.addEventListener('blur', () => keys.clear())
  window.addEventListener('gamepadconnected', (e) => {
    lastPadIndex = (e as GamepadEvent).gamepad.index
    lastDevice = 'pad'
  })
}

/** The first connected pad, preferring the one that last sent input. */
export function getPad(): Gamepad | null {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
  if (lastPadIndex >= 0 && pads[lastPadIndex]) return pads[lastPadIndex]
  for (const p of pads) if (p && p.connected) return p
  return null
}

export function padConnected(): boolean {
  return getPad() !== null
}

const pressed = (p: Gamepad | null, i: number, threshold = 0.4) => !!p && !!p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > threshold)

/** Rumble the pad, when it can. Strong and weak are 0..1. */
export function rumble(strong: number, weak: number, ms: number): void {
  const p = getPad() as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null
  try {
    p?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch?.(() => {})
  } catch {
    /* no rumble on this pad */
  }
}

/** Turns the raw controller or keyboard into one Intent per step for the human machine. */
export class HumanControls {
  mode: ControlMode = 'modern'
  private prev = { dash: false, jump: false, L: false, R: false, C: false, turn: false }
  private pending: { slot: 'L' | 'R'; steps: number } | null = null

  read(): Intent {
    const p = getPad()
    const it = emptyIntent()
    const k = down

    let mx = 0, my = 0, look = 0, dashHeld = false, jumpHeld = false, guard = false, lHeld = false, rHeld = false, cKey = false, turnHeld = false
    if (p) {
      const lx = dz(p.axes[0] ?? 0), ly = -dz(p.axes[1] ?? 0), rx = dz(p.axes[2] ?? 0), ry = -dz(p.axes[3] ?? 0)
      if (Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.2 || p.buttons.some((b) => b.pressed)) lastDevice = 'pad'
      if (this.mode === 'modern') {
        mx = lx; my = ly; look = rx
        dashHeld = pressed(p, BTN.RB) || pressed(p, BTN.LB)
        jumpHeld = pressed(p, BTN.A)
        guard = pressed(p, BTN.B)
        turnHeld = pressed(p, BTN.X) || pressed(p, BTN.RS)
        lHeld = pressed(p, BTN.LT)
        rHeld = pressed(p, BTN.RT)
        cKey = pressed(p, BTN.Y)
      } else {
        // Twin-lever: each stick is one lever. Both forward walks, both sideways strafes, apart jumps, together guards.
        mx = (lx + rx) / 2
        my = (ly + ry) / 2
        const apart = lx < -0.6 && rx > 0.6
        const together = lx > 0.6 && rx < -0.6
        jumpHeld = apart || pressed(p, BTN.A)
        guard = together || pressed(p, BTN.B)
        if (apart || together) { mx = 0; my = 0 }
        dashHeld = pressed(p, BTN.LB) || pressed(p, BTN.RB)
        lHeld = pressed(p, BTN.LT)
        rHeld = pressed(p, BTN.RT)
        turnHeld = pressed(p, BTN.X)
        cKey = pressed(p, BTN.Y)
      }
    }
    // keyboard: WASD move, Space jump, Shift dash, Ctrl/E guard, J/K left/right weapon, L or J+K centre, Q quick turn, arrows look
    if (k('KeyA')) mx -= 1
    if (k('KeyD')) mx += 1
    if (k('KeyW')) my += 1
    if (k('KeyS')) my -= 1
    if (k('ArrowLeft')) look -= 1
    if (k('ArrowRight')) look += 1
    dashHeld ||= k('ShiftLeft') || k('ShiftRight')
    jumpHeld ||= k('Space')
    guard ||= k('KeyE') || k('ControlLeft')
    lHeld ||= k('KeyJ')
    rHeld ||= k('KeyK')
    cKey ||= k('KeyL')
    turnHeld ||= k('KeyQ')

    const len = Math.hypot(mx, my)
    if (len > 1) { mx /= len; my /= len }
    it.mx = mx; it.my = my; it.look = look
    it.dashHeld = dashHeld; it.dash = dashHeld && !this.prev.dash
    it.jumpHeld = jumpHeld; it.jump = jumpHeld && !this.prev.jump
    it.guard = guard
    it.turn = turnHeld && !this.prev.turn

    // trigger chord: LT alone = L, RT alone = R, both within CHORD_STEPS = C (Y is also C)
    const lEdge = lHeld && !this.prev.L
    const rEdge = rHeld && !this.prev.R
    if (cKey && !this.prev.C) { it.fire = 'C'; this.pending = null }
    else if (this.pending) {
      const other = this.pending.slot === 'L' ? rEdge : lEdge
      if (other) { it.fire = 'C'; this.pending = null }
      else if (--this.pending.steps <= 0) { it.fire = this.pending.slot; this.pending = null }
    } else if (lEdge && rEdge) it.fire = 'C'
    else if (lEdge) this.pending = { slot: 'L', steps: CHORD_STEPS }
    else if (rEdge) this.pending = { slot: 'R', steps: CHORD_STEPS }

    this.prev = { dash: dashHeld, jump: jumpHeld, L: lHeld, R: rHeld, C: cKey, turn: turnHeld }
    return it
  }

  reset(): void {
    this.pending = null
    this.prev = { dash: true, jump: true, L: true, R: true, C: true, turn: true }
  }
}

export interface MenuInput { up: boolean; down: boolean; left: boolean; right: boolean; confirm: boolean; back: boolean; start: boolean; any: boolean }

/** Edge-triggered menu navigation from the d-pad, left stick (with repeat), A/B/Menu and the keyboard. */
export class MenuControls {
  private held = new Map<string, number>()
  private t = 0

  read(dt: number): MenuInput {
    this.t += dt
    const p = getPad()
    const k = down
    const ax = p ? p.axes[0] ?? 0 : 0
    const ay = p ? p.axes[1] ?? 0 : 0
    const raw = {
      up: pressed(p, BTN.UP) || ay < -0.55 || k('ArrowUp') || k('KeyW'),
      down: pressed(p, BTN.DOWN) || ay > 0.55 || k('ArrowDown') || k('KeyS'),
      left: pressed(p, BTN.LEFT) || ax < -0.55 || k('ArrowLeft') || k('KeyA'),
      right: pressed(p, BTN.RIGHT) || ax > 0.55 || k('ArrowRight') || k('KeyD'),
      confirm: pressed(p, BTN.A) || k('Enter') || k('Space'),
      back: pressed(p, BTN.B) || k('Escape') || k('Backspace'),
      start: pressed(p, BTN.MENU) || k('Escape') || k('KeyP'),
    }
    const out: MenuInput = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, any: false }
    for (const [name, on] of Object.entries(raw) as [keyof typeof raw, boolean][]) {
      const since = this.held.get(name)
      if (on) {
        if (since === undefined) { out[name] = true; this.held.set(name, this.t) }
        else if (['up', 'down', 'left', 'right'].includes(name) && this.t - since > 0.38) {
          out[name] = true
          this.held.set(name, this.t - 0.26) // repeat every 0.12 s after the first 0.38 s
        }
      } else this.held.delete(name)
    }
    out.any = out.confirm || out.start || (!!p && p.buttons.some((b, i) => b.pressed && i !== BTN.B && !this.held.has('b' + i)))
    if (p) p.buttons.forEach((b, i) => (b.pressed ? this.held.set('b' + i, this.t) : this.held.delete('b' + i)))
    return out
  }

  /** Swallow whatever is held now so a press that opened a screen does not also act on it. */
  latch(): void {
    for (const n of ['up', 'down', 'left', 'right', 'confirm', 'back', 'start']) this.held.set(n, this.t + 1000)
    const p = getPad()
    if (p) p.buttons.forEach((b, i) => b.pressed && this.held.set('b' + i, this.t))
  }
}
