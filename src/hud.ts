// The in-match HUD, drawn as range telemetry: armour bars, the round clock, weapon gauges, the lock-on brackets that
// follow the target, hit read-outs, an incoming-fire warning and the announcer banners.
import { Vector3, type PerspectiveCamera } from 'three'
import type { Battle } from './battle'
import type { Slot } from './roster'
import { HEIGHT } from './mech'
import { lastDevice } from './input'

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  e.className = cls
  if (html !== undefined) e.innerHTML = html
  parent?.appendChild(e)
  return e
}

const v = new Vector3()

export class Hud {
  readonly root: HTMLDivElement
  private hp: [HTMLDivElement, HTMLDivElement]
  private hpLag: [HTMLDivElement, HTMLDivElement]
  private hpNum: [HTMLDivElement, HTMLDivElement]
  private pips: [HTMLDivElement, HTMLDivElement]
  private timer: HTMLDivElement
  private gauges: Record<Slot, { bar: HTMLDivElement; box: HTMLDivElement }>
  private reticle: HTMLDivElement
  private retDist: HTMLDivElement
  private arrow: HTMLDivElement
  private banner: HTMLDivElement
  private bannerKey = ''
  private popLayer: HTMLDivElement
  private warn: HTMLDivElement
  private stance: HTMLDivElement
  private help: HTMLDivElement
  private lag = [1, 1]
  private popEls: HTMLDivElement[] = []
  private helpDevice = ''

  constructor(parent: HTMLElement, private battle: Battle) {
    const b = battle
    this.root = el('div', 'hud', parent)
    const top = el('div', 'hud-top', this.root)
    const side = (i: 0 | 1) => {
      const m = b.mechs[i]
      const box = el('div', 'hud-side hud-side-' + i, top)
      el('div', 'hud-name', box, `<span class="tag">${i === 0 ? 'YOU' : 'CPU'}</span>${m.def.name}<span class="role">${m.def.role}</span>`)
      const bar = el('div', 'hud-hp', box)
      const lag = el('div', 'hud-hp-lag', bar)
      const fill = el('div', 'hud-hp-fill', bar)
      el('div', 'hud-hp-ticks', bar)
      const num = el('div', 'hud-hp-num', box)
      const pips = el('div', 'hud-pips', box, '<i></i><i></i>')
      return { fill, lag, num, pips }
    }
    const s0 = side(0)
    const mid = el('div', 'hud-mid', top)
    this.timer = el('div', 'hud-timer', mid, '99')
    el('div', 'hud-arena', mid, b.arena.def.name.toUpperCase())
    const s1 = side(1)
    top.appendChild(s1.fill.parentElement!.parentElement!)
    this.hp = [s0.fill, s1.fill]
    this.hpLag = [s0.lag, s1.lag]
    this.hpNum = [s0.num, s1.num]
    this.pips = [s0.pips, s1.pips]

    const wpn = el('div', 'hud-weapons', this.root)
    const me = b.human
    const g = (slot: Slot, label: string) => {
      const box = el('div', 'hud-wpn hud-wpn-' + slot, wpn)
      el('div', 'hud-wpn-key', box, label)
      el('div', 'hud-wpn-name', box, me.def.weapons[slot].name)
      const track = el('div', 'hud-wpn-track', box)
      const bar = el('div', 'hud-wpn-bar', track)
      return { bar, box }
    }
    this.gauges = { L: g('L', 'LT'), C: g('C', 'LT+RT'), R: g('R', 'RT') }
    this.stance = el('div', 'hud-stance', this.root)
    this.reticle = el('div', 'hud-reticle', this.root, '<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><b></b>')
    this.retDist = el('div', 'hud-ret-dist', this.reticle)
    this.arrow = el('div', 'hud-arrow', this.root)
    this.banner = el('div', 'hud-banner', this.root)
    this.popLayer = el('div', 'hud-pops', this.root)
    this.warn = el('div', 'hud-warn', this.root, '▲ INCOMING')
    this.help = el('div', 'hud-help', this.root)
    if (b.opts.mode !== 'training') this.help.style.display = 'none'
  }

  dispose(): void {
    this.root.remove()
  }

  private setHelp(): void {
    const pad = lastDevice === 'pad'
    const key = pad ? 'pad' : 'keys'
    if (key === this.helpDevice) return
    this.helpDevice = key
    const rows = pad
      ? [['Left stick', 'Move'], ['RB / LB', 'Dash (tap A to cancel into a jump)'], ['A', 'Jump · hold to rise'], ['RB in air', 'Air dash'], ['RT / LT', 'Right / left weapon'], ['LT+RT or Y', 'Centre weapon'], ['Close in + fire', 'Melee'], ['B', 'Guard · cancels a dash'], ['X', 'Snap to target'], ['Menu', 'Pause']]
      : [['WASD', 'Move'], ['Shift', 'Dash'], ['Space', 'Jump'], ['K / J', 'Right / left weapon'], ['L', 'Centre weapon'], ['E', 'Guard'], ['Q', 'Snap to target'], ['Esc', 'Pause']]
    this.help.innerHTML = '<h4>TRAINING · CONTROLS</h4>' + rows.map(([a, b]) => `<div><kbd>${a}</kbd><span>${b}</span></div>`).join('')
  }

  update(dt: number, cam: PerspectiveCamera, w: number, h: number): void {
    const b = this.battle
    const show = b.phase !== 'intro'
    this.root.classList.toggle('hidden', !show)
    if (b.opts.mode === 'training') this.setHelp()
    for (const i of [0, 1] as const) {
      const m = b.mechs[i]
      const k = Math.max(0, m.hp / m.def.hp)
      this.lag[i] = Math.max(k, this.lag[i] - dt * 0.35)
      if (this.lag[i] < k) this.lag[i] = k
      this.hp[i].style.transform = `scaleX(${k})`
      this.hpLag[i].style.transform = `scaleX(${this.lag[i]})`
      this.hp[i].classList.toggle('low', k < 0.3)
      this.hpNum[i].textContent = String(Math.ceil(m.hp)).padStart(4, '0')
      const pipEls = this.pips[i].children
      for (let j = 0; j < pipEls.length; j++) pipEls[j].classList.toggle('on', b.wins[i] > j)
    }
    this.timer.textContent = b.opts.mode === 'training' ? '∞' : String(Math.ceil(b.timer)).padStart(2, '0')
    this.timer.classList.toggle('low', b.opts.mode === 'arcade' && b.timer < 10)
    const me = b.human
    for (const s of ['L', 'R', 'C'] as Slot[]) {
      const gg = this.gauges[s]
      const val = me.gauge[s]
      gg.bar.style.transform = `scaleX(${val / 100})`
      gg.box.classList.toggle('ready', val >= me.def.weapons[s].cost && me.cool[s] <= 0)
    }
    const close = me.distance < me.def.melee.range && Math.abs(me.target.pos.y - me.pos.y) < 3.5
    const st = me.state
    this.stance.textContent = close ? 'MELEE RANGE' : st === 'dash' ? 'DASH ATTACK' : st === 'air' || st === 'airdash' ? 'AIR ATTACK' : st === 'guard' ? 'GUARD' : st === 'down' ? 'RECOVERING' : ''
    this.stance.className = 'hud-stance' + (close ? ' melee' : '')

    // lock-on brackets
    const t = b.cpu
    v.copy(t.pos).setY(t.pos.y + HEIGHT * 0.55).project(cam)
    const behind = v.z > 1
    let x = (v.x * 0.5 + 0.5) * w
    let y = (-v.y * 0.5 + 0.5) * h
    const inView = !behind && x > 0 && x < w && y > 0 && y < h
    if (inView && t.alive) {
      this.reticle.style.display = 'block'
      const size = Math.max(46, Math.min(160, 2400 / Math.max(4, me.distance)))
      this.reticle.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`
      this.reticle.style.width = this.reticle.style.height = size + 'px'
      this.reticle.classList.toggle('melee', close)
      this.retDist.textContent = 'RNG ' + me.distance.toFixed(1)
      this.arrow.style.display = 'none'
    } else {
      this.reticle.style.display = 'none'
      if (t.alive && b.phase === 'fight') {
        if (behind) { x = w - x; y = h - y }
        const cx = w / 2, cy = h / 2
        const ang = Math.atan2(y - cy, x - cx)
        const r = Math.min(w, h) * 0.38
        this.arrow.style.display = 'block'
        this.arrow.style.transform = `translate(${cx + Math.cos(ang) * r}px, ${cy + Math.sin(ang) * r}px) rotate(${ang}rad)`
      } else this.arrow.style.display = 'none'
    }

    // incoming warning
    const th = b.projectiles.threat(me)
    this.warn.classList.toggle('on', th.t < 0.65 && b.phase === 'fight')

    // banner
    const bn = b.banner
    const key = bn ? bn.text + bn.style : ''
    if (key !== this.bannerKey) {
      this.bannerKey = key
      this.banner.className = 'hud-banner' + (bn ? ' on ' + bn.style : '')
      this.banner.innerHTML = bn ? `<div class="t">${bn.text}</div>${bn.sub ? `<div class="s">${bn.sub}</div>` : ''}` : ''
    }

    // damage read-outs
    while (this.popEls.length < b.popups.length) this.popEls.push(el('div', 'hud-pop', this.popLayer))
    this.popEls.forEach((pe, i) => {
      const p = b.popups[i]
      if (!p) { pe.style.display = 'none'; return }
      v.copy(p.at).project(cam)
      if (v.z > 1) { pe.style.display = 'none'; return }
      pe.style.display = 'block'
      const rise = (0.9 - p.t) * 50
      pe.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h - rise}px) translate(-50%, -50%)`
      pe.style.opacity = String(Math.min(1, p.t * 2.5))
      pe.style.color = p.color
      pe.classList.toggle('big', p.big)
      pe.textContent = p.text
    })
  }
}
