// On-screen controls for phones and tablets: a floating move stick under the left thumb and a fire, dash, jump and
// guard cluster under the right. They write into `virtual` in input.ts, which HumanControls reads like a controller.
// A thumb can slide from one right-hand button to the next (dash, then slide onto fire for a dash attack).
import { virtual } from './input'
import type { Battle } from './battle'
import type { Slot } from './roster'

type Btn = 'R' | 'L' | 'C' | 'dash' | 'jump' | 'guard' | 'turn' | 'pause'
const STICK_R = 58 // pixels from the stick centre to full tilt

export class TouchControls {
  readonly root: HTMLDivElement
  private base: HTMLDivElement
  private knob: HTMLDivElement
  private stickId = -1
  private ox = 0
  private oy = 0
  private held = new Map<number, Btn>() // pointer id -> the button under it
  private btns = new Map<Btn, HTMLDivElement>()
  private gauges = new Map<Slot, HTMLElement>()
  private shown = false
  private names = ''

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'tpad hidden'
    this.root.innerHTML = `
      <div class="t-zone"></div>
      <div class="t-base"><div class="t-knob"></div></div>
      <div class="t-btn t-pause" data-b="pause">II</div>
      <div class="t-btn t-turn" data-b="turn">⟲<small>TURN</small></div>
      <div class="t-btn t-guard" data-b="guard">GUARD</div>
      <div class="t-btn t-jump" data-b="jump">JUMP</div>
      <div class="t-btn t-dash" data-b="dash">DASH</div>
      <div class="t-btn t-wpn t-C" data-b="C"><i></i><b>C</b><small></small></div>
      <div class="t-btn t-wpn t-L" data-b="L"><i></i><b>L</b><small></small></div>
      <div class="t-btn t-wpn t-R" data-b="R"><i></i><b>R</b><small></small></div>`
    parent.appendChild(this.root)
    this.base = this.root.querySelector('.t-base') as HTMLDivElement
    this.knob = this.root.querySelector('.t-knob') as HTMLDivElement
    for (const e of this.root.querySelectorAll<HTMLDivElement>('.t-btn')) this.btns.set(e.dataset.b as Btn, e)
    for (const s of ['L', 'R', 'C'] as Slot[]) this.gauges.set(s, this.btns.get(s)!.querySelector('i')!)
    const r = this.root
    r.addEventListener('pointerdown', (e) => this.down(e))
    r.addEventListener('pointermove', (e) => this.move(e))
    r.addEventListener('pointerup', (e) => this.up(e))
    r.addEventListener('pointercancel', (e) => this.up(e))
    r.addEventListener('lostpointercapture', (e) => this.up(e))
    this.restStick()
  }

  private btnAt(x: number, y: number): Btn | null {
    const hit = document.elementFromPoint(x, y)?.closest?.('.t-btn') as HTMLElement | null
    return hit && this.root.contains(hit) ? (hit.dataset.b as Btn) : null
  }

  private down(e: PointerEvent): void {
    e.preventDefault()
    try { this.root.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ }
    const b = this.btnAt(e.clientX, e.clientY)
    if (b) { this.held.set(e.pointerId, b); this.sync(); return }
    if (this.stickId < 0 && e.clientX < window.innerWidth * 0.5) {
      this.stickId = e.pointerId
      this.ox = e.clientX
      this.oy = e.clientY
      this.base.classList.add('on')
      this.place(this.ox, this.oy)
      this.knob.style.transform = ''
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.ox, dy = e.clientY - this.oy
      const len = Math.hypot(dx, dy)
      // the base follows a thumb that runs past the rim, so turning back never needs a long drag
      if (len > STICK_R * 1.35) {
        const k = (len - STICK_R * 1.35) / len
        this.ox += dx * k; this.oy += dy * k
        dx = e.clientX - this.ox; dy = e.clientY - this.oy
        this.place(this.ox, this.oy)
      }
      const l = Math.hypot(dx, dy)
      const c = l > STICK_R ? STICK_R / l : 1
      this.knob.style.transform = `translate(${dx * c}px, ${dy * c}px)`
      const DEAD = 0.14
      const m = Math.min(1, l / STICK_R)
      const s = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD)
      virtual.mx = l ? (dx / l) * s : 0
      virtual.my = l ? (-dy / l) * s : 0
      return
    }
    if (this.held.has(e.pointerId)) {
      const b = this.btnAt(e.clientX, e.clientY)
      // slide between buttons; sliding off every button keeps the last one held
      if (b && b !== 'pause' && b !== this.held.get(e.pointerId)) { this.held.set(e.pointerId, b); this.sync() }
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      this.stickId = -1
      virtual.mx = virtual.my = 0
      this.base.classList.remove('on')
      this.restStick()
    }
    if (this.held.delete(e.pointerId)) this.sync()
  }

  private place(x: number, y: number): void {
    this.base.style.transform = `translate(${x}px, ${y}px)`
  }

  private restStick(): void {
    this.knob.style.transform = ''
    this.place(Math.max(110, window.innerWidth * 0.14), window.innerHeight - Math.max(110, window.innerHeight * 0.26))
  }

  private sync(): void {
    const on = new Set(this.held.values())
    virtual.R = on.has('R'); virtual.L = on.has('L'); virtual.C = on.has('C')
    virtual.dash = on.has('dash'); virtual.jump = on.has('jump'); virtual.guard = on.has('guard')
    virtual.turn = on.has('turn'); virtual.pause = on.has('pause')
    for (const [k, e] of this.btns) e.classList.toggle('on', on.has(k))
  }

  /** Let go of everything, as when the overlay hides or the match pauses. */
  release(): void {
    this.held.clear()
    this.stickId = -1
    virtual.mx = virtual.my = 0
    this.base.classList.remove('on')
    this.restStick()
    this.sync()
  }

  update(show: boolean, b: Battle | null): void {
    if (show !== this.shown) {
      this.shown = show
      this.root.classList.toggle('hidden', !show)
      if (!show) this.release()
      else this.restStick()
    }
    if (!show || !b) return
    const me = b.human
    const key = me.def.id
    if (key !== this.names) {
      this.names = key
      for (const s of ['L', 'R', 'C'] as Slot[]) this.btns.get(s)!.querySelector('small')!.textContent = me.def.weapons[s].name
    }
    for (const s of ['L', 'R', 'C'] as Slot[]) {
      this.gauges.get(s)!.style.transform = `scaleY(${me.gauge[s] / 100})`
      this.btns.get(s)!.classList.toggle('ready', me.gauge[s] >= me.def.weapons[s].cost && me.cool[s] <= 0)
    }
    const close = me.distance < me.def.melee.range && Math.abs(me.target.pos.y - me.pos.y) < 3.5
    this.root.classList.toggle('melee', close)
  }
}
