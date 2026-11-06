// Virtually Off: boot, the renderer and post-processing, and the screen flow
// (title -> menu -> difficulty -> select -> versus -> match -> result, plus training, settings and controls).
import './style.css'
import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace, Vector2, WebGLRenderer } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { assets } from './assets'
import { audio } from './audio'
import { ARENAS, TRAINING } from './arena'
import { Battle, type MatchResult } from './battle'
import { Hud } from './hud'
import { HumanControls, MenuControls, endFrame, lastDevice, padConnected, type MenuInput } from './input'
import { ROSTER, mechById } from './roster'
import { Showcase } from './showcase'
import { TouchControls } from './touch'
import { Brain, DIFFICULTY, DIFFICULTY_NAMES, type DummyMode } from './ai'
import { loadRun, loadSettings, saveRun, saveSettings, storageOk, type ArcadeRun, type Settings } from './save'

// --- renderer -------------------------------------------------------------------------------------------------------
const app = document.getElementById('app')!
const canvas = document.createElement('canvas')
app.appendChild(canvas)
const ui = document.createElement('div')
ui.className = 'ui'
app.appendChild(ui)
const vignette = document.createElement('div')
vignette.className = 'vignette'
app.appendChild(vignette)
const touch = new TouchControls(app)
const rotate = document.createElement('div')
rotate.className = 'rotate'
rotate.innerHTML = '<b>⟳</b><div>TURN YOUR PHONE SIDEWAYS</div>'
app.appendChild(rotate)
const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false

const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.25 : 1.75)) // phones: fewer pixels, steadier frames
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = PCFShadowMap
assets.setRenderer(renderer)

const composer = new EffectComposer(renderer)
const renderPass = new RenderPass(undefined as never, undefined as never)
const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.7, 0.45, 1.5)
composer.addPass(renderPass)
composer.addPass(bloom)
composer.addPass(new OutputPass())

let settings: Settings = loadSettings()
const controls = new HumanControls()
const menu = new MenuControls()
function applySettings(): void {
  controls.mode = settings.controls
  audio.vol = { master: settings.master, music: settings.music, sfx: settings.sfx, voice: settings.voice }
  audio.applyVolumes()
  bloom.enabled = settings.bloom
}

let W = 1, H = 1
function resize(): void {
  W = window.innerWidth
  H = window.innerHeight
  renderer.setSize(W, H, false)
  composer.setSize(W, H)
  bloom.resolution.set(W, H)
  showcase?.camera && ((showcase.camera.aspect = W / H), showcase.camera.updateProjectionMatrix())
  if (battle) {
    battle.camera.cam.aspect = W / H
    battle.camera.cam.updateProjectionMatrix()
    battle.fx.setViewportHeight(H * renderer.getPixelRatio())
  }
}
window.addEventListener('resize', resize)

// --- helpers ----------------------------------------------------------------------------------------------------
const h = (html: string): HTMLDivElement => {
  const d = document.createElement('div')
  d.innerHTML = html.trim()
  return d.firstElementChild as HTMLDivElement
}
const portrait = (id: string, kind: 'bust' | 'full') => `${import.meta.env.BASE_URL}assets/portraits/${id}-${kind}.webp`
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0')
const glyph = (pad: string, key: string, tap = '') => `<span class="glyph pad">${pad}</span><span class="glyph keys">${key}</span>${tap ? `<span class="glyph touch">${tap}</span>` : ''}`
const isTouch = () => lastDevice === 'touch'
/** A BACK button for touch screens, which have no B button or Esc key. */
function backButton(el: HTMLElement, fn: () => void): void {
  const b = h('<div class="tback touch-only">◀ BACK</div>')
  b.addEventListener('click', (e) => { e.stopPropagation(); audio.sfx('ui_back'); fn() })
  el.appendChild(b)
}
/** Phones: go full screen and hold landscape where the browser allows it. */
function goFullscreen(): void {
  if (!isTouch() || document.fullscreenElement || !document.fullscreenEnabled) return
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
    .then(() => (window.screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => { /* not allowed here; the rotate notice covers portrait */ })
}

interface Screen { el: HTMLElement; update(dt: number, m: MenuInput): void; leave?(): void; showcase?: boolean; match?: boolean }
let screen: Screen | null = null
let showcase: Showcase | null = null
let battle: Battle | null = null
let hud: Hud | null = null

function go(s: Screen): void {
  screen?.leave?.()
  screen?.el.remove()
  screen = s
  ui.appendChild(s.el)
  menu.latch()
}

/** A vertical list of options driven by the d-pad or stick, A to choose, B to go back. */
function listNav(items: HTMLElement[], onPick: (i: number) => void, onBack?: () => void, onSide?: (i: number, d: -1 | 1) => void) {
  let sel = Math.max(0, items.findIndex((e) => !e.classList.contains('disabled')))
  const paint = () => items.forEach((e, i) => e.classList.toggle('sel', i === sel))
  items.forEach((e, i) => {
    e.addEventListener('mouseenter', () => { if (!e.classList.contains('disabled')) { sel = i; paint() } })
    e.addEventListener('click', () => { if (!e.classList.contains('disabled')) { sel = i; paint(); audio.sfx('ui_confirm'); onPick(i) } })
  })
  paint()
  return (m: MenuInput) => {
    const step = (d: number) => {
      for (let k = 0; k < items.length; k++) {
        sel = (sel + d + items.length) % items.length
        if (!items[sel].classList.contains('disabled')) break
      }
      audio.sfx('ui_move', { vol: 0.5 })
      paint()
    }
    if (m.up) step(-1)
    if (m.down) step(1)
    if (onSide && (m.left || m.right)) { onSide(sel, m.left ? -1 : 1); audio.sfx('ui_move', { vol: 0.5 }) }
    if (m.confirm) { audio.sfx('ui_confirm'); onPick(sel) }
    else if (m.back && onBack) { audio.sfx('ui_back'); onBack() }
  }
}

// --- screens ----------------------------------------------------------------------------------------------------

function titleScreen(): Screen {
  const el = h(`<div class="screen title">
    <div class="wordmark"><div class="w1">VIRTUALLY</div><div class="w2">OFF</div><div class="beam"></div></div>
    <div class="sub">ORBITAL PROVING GROUND · ONE ON ONE</div>
    <div class="press"></div>
    <div class="sound-hint no-touch">Click anywhere if you hear no sound — browsers wait for a click before playing audio.</div>
    <div class="legal">Unofficial, non-commercial fan project by evilgouki. Original machines, names, music and art.</div>
  </div>`)
  const press = el.querySelector('.press') as HTMLElement
  const hint = el.querySelector('.sound-hint') as HTMLElement
  el.addEventListener('click', () => { audio.resume(); goFullscreen(); start() })
  let started = false
  const start = () => {
    if (started) return
    started = true
    audio.resume()
    audio.voice('title')
    audio.sfx('ui_confirm')
    setTimeout(() => go(mainMenu()), 250)
  }
  audio.music('title')
  showcase?.show('u07')
  if (showcase) showcase.offset = 2.1
  return {
    el, showcase: true,
    update(_dt, m) {
      press.innerHTML = padConnected() ? 'PRESS <b>A</b>' : isTouch() ? '<b>TAP</b> TO START' : 'PRESS <b>ENTER</b> OR CONNECT A CONTROLLER'
      hint.style.display = audio.suspended ? 'block' : 'none'
      if (m.confirm || m.start || m.any) start()
    },
  }
}

function runLabel(r: ArcadeRun): string {
  const d = new Date(r.savedAt)
  return `${mechById(r.mech).name} · stage ${r.stage + 1} of ${r.ladder.length} · ${DIFFICULTY_NAMES[r.difficulty]} · saved ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

function mainMenu(): Screen {
  const saved = loadRun((id) => ROSTER.some((m) => m.id === id))
  const el = h(`<div class="screen menu">
    <div class="wordmark small"><div class="w1">VIRTUALLY</div><div class="w2">OFF</div></div>
    <div class="list">
      ${saved?.ok ? `<div class="item"><b>CONTINUE</b><span>${runLabel(saved.run)}</span></div>` : ''}
      ${saved && !saved.ok ? `<div class="item warn"><b>SAVED RUN UNREADABLE</b><span>${saved.reason} Choose to discard it.</span></div>` : ''}
      <div class="item"><b>ARCADE</b><span>Six opponents across three arenas${saved?.ok ? ' · replaces your saved run' : ''}</span></div>
      <div class="item"><b>TRAINING</b><span>A free-fire range with a target machine</span></div>
      <div class="item"><b>CONTROLS</b><span>The controller, keyboard and touch layout</span></div>
      <div class="item"><b>SETTINGS</b><span>Control scheme, volume, effects</span></div>
    </div>
    ${storageOk ? '' : '<div class="foot warn">This browser is not letting the game save; progress and settings last until you close the tab.</div>'}
    <div class="foot no-touch">${glyph('A', 'Enter')} select &nbsp; ${glyph('B', 'Esc')} back</div>
  </div>`)
  const items = [...el.querySelectorAll('.item')] as HTMLElement[]
  const actions: (() => void)[] = []
  if (saved?.ok) actions.push(() => continueRun(saved.run))
  if (saved && !saved.ok) actions.push(() => { saveRun(null); go(mainMenu()) })
  actions.push(() => go(difficultyScreen()))
  actions.push(() => go(selectScreen('training')))
  actions.push(() => go(controlsScreen(() => go(mainMenu()))))
  actions.push(() => go(settingsScreen(() => go(mainMenu()))))
  const nav = listNav(items, (i) => actions[i](), () => go(titleScreen()))
  backButton(el, () => go(titleScreen()))
  audio.music('title')
  if (showcase) showcase.offset = -1.6
  return { el, showcase: true, update: (_dt, m) => nav(m) }
}

function difficultyScreen(): Screen {
  const blurbs = ['Slow reactions, rarely dodges. Learn the moves.', 'Dodges about half your shots. The intended challenge.', 'Quick, dodges most fire, guards your melee.', 'Reacts almost instantly. For when you have mastered dash-cancels.']
  const el = h(`<div class="screen menu">
    <div class="heading">ARCADE · <b>OPPONENT SKILL</b></div>
    <div class="list">${DIFFICULTY_NAMES.map((n, i) => `<div class="item"><b>${n.toUpperCase()}</b><span>${blurbs[i]}</span></div>`).join('')}</div>
    <div class="foot">Later opponents in the ladder get one step harder. <span class="no-touch">${glyph('B', 'Esc')} back</span></div>
  </div>`)
  const items = [...el.querySelectorAll('.item')] as HTMLElement[]
  items.forEach((e, i) => e.classList.toggle('default', i === settings.difficulty))
  const nav = listNav(items, (i) => {
    settings.difficulty = i
    saveSettings(settings)
    go(selectScreen('arcade'))
  }, () => go(mainMenu()))
  backButton(el, () => go(mainMenu()))
  // start on the remembered difficulty
  for (let i = 0; i < settings.difficulty; i++) nav({ up: false, down: true, left: false, right: false, confirm: false, back: false, start: false, any: false })
  return { el, showcase: true, update: (_dt, m) => nav(m) }
}

function statBar(label: string, k: number): string {
  return `<div class="stat"><span>${label}</span><i><b style="width:${Math.round(Math.max(0.08, Math.min(1, k)) * 100)}%"></b></i></div>`
}

function selectScreen(mode: 'arcade' | 'training'): Screen {
  let sel = Math.max(0, ROSTER.findIndex((m) => m.id === (localStorage.getItem('voff-last') ?? 'u07')))
  const el = h(`<div class="screen select">
    <div class="heading">${mode === 'arcade' ? 'ARCADE · ' + DIFFICULTY_NAMES[settings.difficulty].toUpperCase() : 'TRAINING'} · <b>SELECT YOUR MACHINE</b></div>
    <div class="grid">${ROSTER.map((m) => `<div class="tile" style="--acc:${hex(m.accent)}"><img src="${portrait(m.id, 'bust')}" alt=""><span>${m.name}</span></div>`).join('')}</div>
    <div class="card"></div>
    <div class="foot"><span class="no-touch">${glyph('D-pad', 'Arrows')} choose &nbsp; ${glyph('A', 'Enter')} launch &nbsp; ${glyph('B', 'Esc')} back</span><span class="touch-only">Tap a machine, then tap it again to launch</span></div>
  </div>`)
  const tiles = [...el.querySelectorAll('.tile')] as HTMLElement[]
  const card = el.querySelector('.card') as HTMLElement
  const paint = () => {
    tiles.forEach((t, i) => t.classList.toggle('sel', i === sel))
    const m = ROSTER[sel]
    showcase?.show(m.id)
    card.style.setProperty('--acc', hex(m.accent))
    card.innerHTML = `<div class="role">${m.role.toUpperCase()}</div><div class="name">${m.name}</div><p>${m.blurb}</p>
      ${statBar('ARMOUR', m.hp / 1200)}${statBar('SPEED', (m.walk - 7) / 5.5)}${statBar('DASH', (m.dash - 22) / 15)}${statBar('WEIGHT', m.weight / 1.4)}
      <div class="wpns">
        <div><kbd>LT</kbd>${m.weapons.L.name}</div>
        <div><kbd>RT</kbd>${m.weapons.R.name}</div>
        <div><kbd>LT+RT</kbd>${m.weapons.C.name}</div>
        <div><kbd>CLOSE</kbd>${m.melee.name}</div>
      </div>`
  }
  tiles.forEach((t, i) => {
    t.addEventListener('mouseenter', () => { if (!isTouch()) { sel = i; paint() } }) // a tap also sends mouseenter
    t.addEventListener('click', () => {
      // on touch the first tap shows the machine and a second tap launches it
      if (isTouch() && i !== sel) { sel = i; paint(); audio.sfx('ui_move', { vol: 0.5 }); return }
      sel = i; paint(); pick()
    })
  })
  const pick = () => {
    const m = ROSTER[sel]
    try { localStorage.setItem('voff-last', m.id) } catch { /* storage refused */ }
    audio.sfx('ui_confirm')
    if (mode === 'training') startTraining(m.id)
    else newRun(m.id)
  }
  paint()
  backButton(el, () => go(mode === 'arcade' ? difficultyScreen() : mainMenu()))
  audio.music('select')
  audio.voice('select')
  if (showcase) showcase.offset = 1.7
  return {
    el, showcase: true,
    update(_dt, m) {
      const cols = 3
      let moved = false
      if (m.left) { sel = (sel + ROSTER.length - 1) % ROSTER.length; moved = true }
      if (m.right) { sel = (sel + 1) % ROSTER.length; moved = true }
      if (m.up) { sel = (sel + ROSTER.length - cols) % ROSTER.length; moved = true }
      if (m.down) { sel = (sel + cols) % ROSTER.length; moved = true }
      if (moved) { audio.sfx('ui_move', { vol: 0.5 }); paint() }
      if (m.confirm) pick()
      else if (m.back) { audio.sfx('ui_back'); go(mode === 'arcade' ? difficultyScreen() : mainMenu()) }
    },
  }
}

function newRun(mech: string): void {
  const others = ROSTER.filter((m) => m.id !== mech).map((m) => m.id)
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]] }
  // the last bout is a mirror match against your own machine
  const ladder = [...others, mech].map((m, i) => ({ mech: m, arena: i % ARENAS.length }))
  const run: ArcadeRun = { v: 1, mech, stage: 0, difficulty: settings.difficulty, ladder, wins: 0, savedAt: Date.now() }
  saveRun(run)
  go(versusScreen(run))
}

function continueRun(run: ArcadeRun): void {
  go(versusScreen(run))
}

function stageDifficulty(run: ArcadeRun): number {
  return Math.min(3, run.difficulty + (run.stage >= 3 ? 1 : 0) + (run.stage >= 5 && run.difficulty >= 2 ? 1 : 0))
}

function versusScreen(run: ArcadeRun): Screen {
  const me = mechById(run.mech)
  const foe = mechById(run.ladder[run.stage].mech)
  const arena = ARENAS[run.ladder[run.stage].arena]
  const el = h(`<div class="screen versus">
    <div class="vs-side l" style="--acc:${hex(me.accent)}"><img src="${portrait(me.id, 'full')}" alt=""><div class="n">${me.name}</div><div class="r">${me.role}</div></div>
    <div class="vs-mid"><div class="stage">STAGE ${run.stage + 1} / ${run.ladder.length}</div><div class="vs">VS</div><div class="arena">${arena.name}</div><div class="tag">${arena.tagline}</div><div class="diff">${DIFFICULTY_NAMES[stageDifficulty(run)]}</div></div>
    <div class="vs-side r" style="--acc:${hex(foe.accent)}"><img src="${portrait(foe.id, 'full')}" alt=""><div class="n">${foe.name}</div><div class="r">${foe.role}</div></div>
  </div>`)
  let t = 0
  let tapped = false
  el.addEventListener('click', () => { tapped = true })
  audio.sfx('power_up', { vol: 0.7 })
  audio.music(null, 0.8)
  return {
    el,
    update(dt, m) {
      t += dt
      if (t > 3 || (t > 0.6 && (m.confirm || m.start || tapped))) startMatch(run)
    },
  }
}

function startBattle(b: Battle): void {
  battle?.dispose()
  hud?.dispose()
  battle = b
  resize()
  renderPass.scene = b.scene
  renderPass.camera = b.camera.cam
  hud = new Hud(app, b)
  // compile every shader now so the first shot does not hitch
  renderer.compile(b.scene, b.camera.cam)
}

function startMatch(run: ArcadeRun): void {
  const stage = run.ladder[run.stage]
  const b = new Battle({ p1: mechById(run.mech), p2: mechById(stage.mech), arena: ARENAS[stage.arena], mode: 'arcade', difficulty: stageDifficulty(run), controls }, W / H)
  b.onOver = (r) => setTimeout(() => go(resultScreen(run, r)), 400)
  startBattle(b)
  go(matchScreen())
}

let trainingDummy: DummyMode = 'walk'
function startTraining(mech: string, foe = 'u14'): void {
  const b = new Battle({ p1: mechById(mech), p2: mechById(foe), arena: TRAINING, mode: 'training', difficulty: 0, controls, dummy: trainingDummy }, W / H)
  startBattle(b)
  go(matchScreen())
}

function endBattle(): void {
  battle?.dispose()
  hud?.dispose()
  battle = null
  hud = null
}

function matchScreen(): Screen {
  const el = h(`<div class="screen match"></div>`)
  return {
    el, match: true,
    update(_dt, m) {
      if (m.start && battle && battle.phase !== 'over') {
        audio.sfx('ui_back')
        battle.paused = true
        go(pauseScreen())
      }
    },
  }
}

function pauseScreen(): Screen {
  const b = battle!
  const training = b.opts.mode === 'training'
  const dummyNames: Record<DummyMode, string> = { walk: 'Strafes side to side', stand: 'Stands still', fight: 'Fights back (Cadet)' }
  const el = h(`<div class="screen pause">
    <div class="heading"><b>PAUSED</b></div>
    <div class="list">
      <div class="item"><b>RESUME</b></div>
      ${training ? `<div class="item"><b>TARGET</b><span class="dummy">◀ ${dummyNames[trainingDummy]} ▶</span></div>` : ''}
      <div class="item"><b>CONTROLS</b></div>
      <div class="item"><b>SETTINGS</b></div>
      <div class="item"><b>${training ? 'LEAVE TRAINING' : 'QUIT TO MENU'}</b><span>${training ? '' : 'Your run stays saved at this stage'}</span></div>
    </div>
  </div>`)
  const items = [...el.querySelectorAll('.item')] as HTMLElement[]
  const resume = () => { b.paused = false; controls.reset(); touch.release(); go(matchScreen()) }
  const cycle = (d: 1 | -1) => {
    const order: DummyMode[] = ['walk', 'stand', 'fight']
    trainingDummy = order[(order.indexOf(trainingDummy) + d + 3) % 3]
    b.brain.dummy = trainingDummy === 'fight' ? null : trainingDummy
    ;(el.querySelector('.dummy') as HTMLElement).textContent = '◀ ' + dummyNames[trainingDummy] + ' ▶'
  }
  const actions: (() => void)[] = [resume]
  if (training) actions.push(() => cycle(1))
  actions.push(() => go(controlsScreen(() => go(pauseScreen()))))
  actions.push(() => go(settingsScreen(() => go(pauseScreen()))))
  actions.push(() => { endBattle(); go(mainMenu()) })
  const nav = listNav(items, (i) => actions[i](), resume, (i, d) => { if (training && i === 1) cycle(d) })
  return { el, update: (_dt, m) => (m.start ? resume() : nav(m)) }
}

function resultScreen(run: ArcadeRun, r: MatchResult): Screen {
  const won = r.winner === 0
  const last = run.stage >= run.ladder.length - 1
  const s = r.stats[0]
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0
  if (won) {
    if (last) saveRun(null)
    else saveRun({ ...run, stage: run.stage + 1, wins: run.wins + 1 })
  }
  audio.music(won ? 'victory' : 'defeat', 0.4)
  setTimeout(() => audio.voice(won ? (r.perfect ? 'perfect' : 'victory') : 'defeat'), 300)
  const el = h(`<div class="screen result ${won ? 'won' : 'lost'}">
    <div class="big">${won ? (last ? 'PROVING COMPLETE' : r.perfect ? 'PERFECT' : 'VICTORY') : 'DEFEAT'}</div>
    <div class="sub">${won ? (last ? 'Every machine on the ladder is down. Certified for deployment.' : 'Next: ' + mechById(run.ladder[run.stage + 1].mech).name + ' on ' + ARENAS[run.ladder[run.stage + 1].arena].name) : 'Rounds ' + r.wins[0] + ' – ' + r.wins[1]}</div>
    <div class="stats">
      <div><b>${r.wins[0]} – ${r.wins[1]}</b><span>rounds</span></div>
      <div><b>${Math.round(s.damage)}</b><span>damage dealt</span></div>
      <div><b>${s.hits}/${s.shots}</b><span>hits / pulls (${acc}%)</span></div>
      <div><b>${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}</b><span>fight time</span></div>
    </div>
    <div class="list">
      ${won && !last ? '<div class="item"><b>NEXT STAGE</b></div>' : ''}
      ${!won ? '<div class="item"><b>CONTINUE</b><span>Retry this stage</span></div>' : ''}
      <div class="item"><b>${won && last ? 'BACK TO TITLE' : 'QUIT TO MENU'}</b><span>${won && !last ? 'Your run is saved at the next stage' : !won ? 'Your run stays saved at this stage' : ''}</span></div>
    </div>
  </div>`)
  if (!won) setTimeout(() => audio.voice('continue'), 2200)
  const items = [...el.querySelectorAll('.item')] as HTMLElement[]
  const actions: (() => void)[] = []
  if (won && !last) actions.push(() => { endBattle(); go(versusScreen({ ...run, stage: run.stage + 1, wins: run.wins + 1 })) })
  if (!won) actions.push(() => { endBattle(); go(versusScreen(run)) })
  actions.push(() => { endBattle(); go(won && last ? titleScreen() : mainMenu()) })
  const nav = listNav(items, (i) => actions[i]())
  return { el, update: (_dt, m) => nav(m) }
}

function controlsScreen(back: () => void): Screen {
  const modern = [
    ['Left stick', 'Move · strafe circles the target'], ['Right stick', 'Look around (springs back)'], ['RB / LB', 'Dash in the stick direction'],
    ['A', 'Jump · hold to rise higher'], ['RB in the air', 'Air dash (one per jump)'], ['A during a dash', 'Dash cancel into a jump'],
    ['B', 'Guard · also stops a dash dead'], ['RT', 'Right weapon'], ['LT', 'Left weapon'], ['LT + RT or Y', 'Centre weapon'],
    ['Fire when close', 'Melee with a homing lunge'], ['X / RS click', 'Snap to face the target'], ['Menu', 'Pause'],
  ]
  const lever = [
    ['Both sticks', 'Each is one lever: both forward walks, both sideways strafes'], ['Sticks apart', 'Jump'], ['Sticks together', 'Guard'],
    ['LB / RB', 'Turbo: dash'], ['LT / RT', 'Left / right weapon'], ['LT + RT', 'Centre weapon'], ['Fire when close', 'Melee'], ['Menu', 'Pause'],
  ]
  const touchRows = [
    ['Left thumb', 'Touch anywhere on the left half and drag to move'], ['DASH', 'Dash in the stick direction'], ['JUMP', 'Jump · hold to rise · DASH in the air air-dashes'],
    ['JUMP in a dash', 'Dash cancel into a jump'], ['GUARD', 'Guard · also stops a dash dead'], ['R / L / C', 'Right, left and centre weapons; the fill is the gauge'],
    ['Slide', 'Slide a thumb from DASH onto a weapon for a dash attack'], ['Fire when close', 'Melee (the buttons glow red)'], ['TURN', 'Snap to face the target'], ['II', 'Pause'],
  ]
  const keys = [['WASD', 'Move'], ['Shift', 'Dash'], ['Space', 'Jump'], ['E / Ctrl', 'Guard'], ['J / K', 'Left / right weapon'], ['L', 'Centre weapon'], ['Q', 'Snap to target'], ['Arrows', 'Look'], ['Esc', 'Pause']]
  const rows = (r: string[][]) => r.map(([a, b]) => `<div><kbd>${a}</kbd><span>${b}</span></div>`).join('')
  const el = h(`<div class="screen controls">
    <div class="heading">CONTROLS · <b>${settings.controls === 'modern' ? 'MODERN' : 'TWIN-LEVER'}</b></div>
    <div class="cols">
      <div class="col">${isTouch() ? `<h4>TOUCH</h4>${rows(touchRows)}` : ''}<h4>XBOX CONTROLLER</h4>${rows(settings.controls === 'modern' ? modern : lever)}</div>
      <div class="col"><h4>KEYBOARD</h4>${rows(keys)}
        <h4>TIPS</h4><p>Shots home in, but much less on a dashing machine — dash across fire to dodge it. Firing during a dash gives a dash attack; firing in the air gives an air attack. Each weapon has its own gauge. Big hits and stacked hits knock you down; you cannot be hit while you recover.</p></div>
    </div>
    <div class="foot">Switch controller schemes in Settings. ${glyph('B', 'Esc', 'Tap')} back</div>
  </div>`)
  el.addEventListener('click', back)
  return { el, showcase: true, update: (_dt, m) => { if (m.back || m.confirm) { audio.sfx('ui_back'); back() } } }
}

function settingsScreen(back: () => void): Screen {
  type Row = { label: string; get: () => string; side: (d: -1 | 1) => void }
  const pct = (k: keyof Settings) => () => Math.round((settings[k] as number) * 100) + '%'
  const vol = (k: 'master' | 'music' | 'sfx' | 'voice') => (d: -1 | 1) => { settings[k] = Math.max(0, Math.min(1, Math.round((settings[k] + d * 0.1) * 10) / 10)); applySettings() }
  const rows: Row[] = [
    { label: 'CONTROL SCHEME', get: () => (settings.controls === 'modern' ? 'Modern' : 'Twin-lever'), side: () => { settings.controls = settings.controls === 'modern' ? 'lever' : 'modern'; applySettings() } },
    { label: 'MASTER VOLUME', get: pct('master'), side: vol('master') },
    { label: 'MUSIC', get: pct('music'), side: vol('music') },
    { label: 'EFFECTS', get: pct('sfx'), side: vol('sfx') },
    { label: 'ANNOUNCER', get: pct('voice'), side: vol('voice') },
    { label: 'BLOOM GLOW', get: () => (settings.bloom ? 'On' : 'Off'), side: () => { settings.bloom = !settings.bloom; applySettings() } },
    { label: 'SCREEN SHAKE', get: () => (settings.shake ? 'On' : 'Off'), side: () => { settings.shake = !settings.shake } },
  ]
  const el = h(`<div class="screen menu settings">
    <div class="heading"><b>SETTINGS</b></div>
    <div class="list">${rows.map((r) => `<div class="item row"><b>${r.label}</b><span class="val"></span></div>`).join('')}<div class="item"><b>DONE</b></div></div>
    <div class="foot">${glyph('◀ ▶', '◀ ▶', 'Tap ◀ ▶')} change &nbsp; <span class="no-touch">${glyph('B', 'Esc')} back</span></div>
  </div>`)
  const items = [...el.querySelectorAll('.item')] as HTMLElement[]
  const paint = () => rows.forEach((r, i) => ((items[i].querySelector('.val') as HTMLElement).innerHTML = `<i data-d="-1">◀</i>${r.get()}<i data-d="1">▶</i>`))
  // the arrows change a value in that direction; a tap elsewhere on the row steps it forward
  el.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('[data-d]') as HTMLElement | null
    const row = a ? items.indexOf(a.closest('.item') as HTMLElement) : -1
    if (!a || row < 0 || row >= rows.length) return
    e.stopPropagation()
    rows[row].side(Number(a.dataset.d) as -1 | 1)
    audio.sfx('ui_move', { vol: 0.5 })
    paint()
  }, { capture: true })
  const done = () => { saveSettings(settings); back() }
  const nav = listNav(items, (i) => { if (i < rows.length) { rows[i].side(1); paint() } else done() }, done, (i, d) => { if (i < rows.length) { rows[i].side(d); paint() } })
  paint()
  return { el, showcase: true, update: (_dt, m) => nav(m) }
}

// --- boot -------------------------------------------------------------------------------------------------------

async function boot(): Promise<void> {
  const loading = h(`<div class="screen loading"><div class="wordmark small"><div class="w1">VIRTUALLY</div><div class="w2">OFF</div></div><div class="bar"><i></i></div><div class="msg">Loading machines</div></div>`)
  ui.appendChild(loading)
  const bar = loading.querySelector('.bar i') as HTMLElement
  const msg = loading.querySelector('.msg') as HTMLElement
  audio.init()
  applySettings()
  const jobs: Promise<unknown>[] = []
  for (const m of ROSTER) jobs.push(assets.loadMech(m.id))
  for (const a of ARENAS) { jobs.push(assets.loadTexture('sky/' + a.sky + '.webp')); jobs.push(assets.loadTexture('textures/' + a.floor + '.webp')) }
  jobs.push(assets.loadTexture('textures/wall1.webp'))
  for (const p of ['pillar', 'bunker', 'gantry', 'pylon']) jobs.push(assets.loadProp(p))
  const tick = setInterval(() => {
    bar.style.width = (assets.total ? (assets.loaded / assets.total) * 100 : 0) + '%'
    msg.textContent = `Loading machines and arenas ${assets.loaded}/${assets.total}`
  }, 100)
  await audio.loadManifest()
  await Promise.all(jobs)
  msg.textContent = 'Loading sound'
  await audio.preloadAll()
  clearInterval(tick)
  loading.remove()
  showcase = new Showcase(W / H)
  resize()

  const q = new URLSearchParams(location.search)
  ;(window as unknown as { __voff: unknown }).__voff = {
    get battle() { return battle }, get screen() { return screen }, settings, controls,
    /** Test hook: run the match for `sec` seconds of game time at 60 Hz, then draw one frame. */
    advance(sec: number) {
      if (!battle) return
      for (let i = 0; i < Math.round(sec * 60); i++) { battle.update(1 / 60); endFrame() }
      hud?.update(1 / 60, battle.camera.cam, W, H)
      syncTouch()
      composer.render(1 / 60)
    },
    /** Test hook: hold keyboard codes for the next calls to advance. */
    autopilot(level: number) { if (battle) battle.autopilot = new Brain(DIFFICULTY[level]) },
    key(code: string, down: boolean) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })) },
  }
  if (q.get('auto') === 'training') startTraining(q.get('mech') ?? 'u07', q.get('foe') ?? 'u14')
  else if (q.get('auto') === 'match') {
    const mech = q.get('mech') ?? 'u07'
    startMatch({ v: 1, mech, stage: 0, difficulty: Number(q.get('d') ?? 1), ladder: [{ mech: q.get('foe') ?? 'u12', arena: Number(q.get('arena') ?? 0) }], wins: 0, savedAt: Date.now() })
  } else if (q.get('auto') === 'select') go(selectScreen('arcade'))
  else go(titleScreen())
}

function syncTouch(): void {
  document.body.classList.toggle('touch', lastDevice === 'touch')
  touch.update(lastDevice === 'touch' && !!screen?.match && !!battle && !battle.paused && battle.phase !== 'over', battle)
}

let last = performance.now()
function frame(now: number): void {
  requestAnimationFrame(frame)
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  const m = menu.read(dt)
  document.body.classList.toggle('keys', lastDevice === 'keys' && !padConnected())
  syncTouch()
  screen?.update(dt, m)
  if (battle && (!screen || !screen.showcase || battle.paused)) {
    if (!settings.shake) battle.fx.shake = 0
    battle.update(dt)
    renderPass.scene = battle.scene
    renderPass.camera = battle.camera.cam
    hud?.update(dt, battle.camera.cam, W, H)
    composer.render(dt)
  } else if (showcase) {
    showcase.update(dt)
    renderPass.scene = showcase.scene
    renderPass.camera = showcase.camera
    composer.render(dt)
  }
  endFrame()
}

// rule 24: no text selection or callouts on a long press
document.addEventListener('selectstart', (e) => { if (!(e.target as HTMLElement).closest?.('input,textarea,select,[contenteditable="true"]')) e.preventDefault() })
document.addEventListener('contextmenu', (e) => e.preventDefault())

resize()
boot().catch((e) => {
  console.error(e)
  ui.innerHTML = `<div class="screen loading"><div class="msg warn">Could not start: ${String(e?.message ?? e)}</div></div>`
})
requestAnimationFrame(frame)
