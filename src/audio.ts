// Web Audio: music with cross-fades, one-shot effects with distance falloff and stereo pan, the announcer (which ducks
// the music), and a thruster loop per machine. Files come from public/assets/audio/manifest.json; anything missing is
// skipped with one console warning, so the game still runs before the audio has been generated.

type Manifest = { music: Record<string, string>; sfx: Record<string, string>; voice: Record<string, string> }

export interface Volumes { master: number; music: number; sfx: number; voice: number }

class AudioManager {
  ctx: AudioContext | null = null
  private master!: GainNode
  private musicBus!: GainNode
  private sfxBus!: GainNode
  private voiceBus!: GainNode
  private duck!: GainNode
  private buffers = new Map<string, AudioBuffer>()
  private loading = new Map<string, Promise<AudioBuffer | null>>()
  private manifest: Manifest | null = null
  private musicNow: { name: string; src: AudioBufferSourceNode; gain: GainNode } | null = null
  private lastPlayed = new Map<string, number>()
  private warned = new Set<string>()
  vol: Volumes = { master: 0.8, music: 0.55, sfx: 0.8, voice: 0.9 }
  listener = { x: 0, z: 0, yaw: 0 }

  init(): void {
    if (this.ctx) return
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!C) return
    this.ctx = new C()
    this.master = this.ctx.createGain()
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    this.master.connect(comp).connect(this.ctx.destination)
    this.duck = this.ctx.createGain()
    this.musicBus = this.ctx.createGain()
    this.musicBus.connect(this.duck).connect(this.master)
    this.sfxBus = this.ctx.createGain()
    this.sfxBus.connect(this.master)
    this.voiceBus = this.ctx.createGain()
    this.voiceBus.connect(this.master)
    this.applyVolumes()
    const unlock = () => this.resume()
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { passive: true })
  }

  get suspended(): boolean {
    return !this.ctx || this.ctx.state !== 'running'
  }

  resume(): void {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {})
  }

  applyVolumes(): void {
    if (!this.ctx) return
    this.master.gain.value = this.vol.master
    this.musicBus.gain.value = this.vol.music
    this.sfxBus.gain.value = this.vol.sfx
    this.voiceBus.gain.value = this.vol.voice
  }

  async loadManifest(): Promise<void> {
    try {
      const r = await fetch(import.meta.env.BASE_URL + 'assets/audio/manifest.json', { cache: 'no-cache' })
      if (!r.ok) throw new Error(String(r.status))
      const m = (await r.json()) as Partial<Manifest>
      this.manifest = { music: m.music ?? {}, sfx: m.sfx ?? {}, voice: m.voice ?? {} }
    } catch {
      console.warn('[audio] no manifest yet; the game runs silent')
      this.manifest = { music: {}, sfx: {}, voice: {} }
    }
  }

  get names(): Manifest {
    return this.manifest ?? { music: {}, sfx: {}, voice: {} }
  }

  private url(group: keyof Manifest, name: string): string | null {
    const rel = this.manifest?.[group]?.[name]
    if (!rel) return null
    const path = typeof rel === 'string' ? rel : (rel as { file?: string }).file
    return path ? import.meta.env.BASE_URL + 'assets/audio/' + path : null
  }

  load(group: keyof Manifest, name: string): Promise<AudioBuffer | null> {
    const key = group + ':' + name
    const have = this.buffers.get(key)
    if (have) return Promise.resolve(have)
    const pending = this.loading.get(key)
    if (pending) return pending
    const u = this.url(group, name)
    if (!u || !this.ctx) {
      if (!this.warned.has(key) && this.manifest) {
        this.warned.add(key)
        if (!u) console.warn('[audio] missing', key)
      }
      return Promise.resolve(null)
    }
    const ctx = this.ctx
    const p = fetch(u)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        this.buffers.set(key, buf)
        return buf
      })
      .catch(() => {
        console.warn('[audio] failed', key)
        return null
      })
    this.loading.set(key, p)
    return p
  }

  /** Decode every sound effect and announcer line up front so the first shot is not late. */
  async preloadAll(): Promise<void> {
    if (!this.ctx || !this.manifest) return
    const jobs: Promise<unknown>[] = []
    for (const n of Object.keys(this.manifest.sfx)) jobs.push(this.load('sfx', n))
    for (const n of Object.keys(this.manifest.voice)) jobs.push(this.load('voice', n))
    await Promise.all(jobs)
  }

  /** One-shot effect. `at` positions it in the world (distance falloff and pan from the listener). */
  sfx(name: string, opts: { at?: { x: number; z: number }; vol?: number; rate?: number; minGap?: number } = {}): void {
    if (!this.ctx || this.ctx.state !== 'running') return
    const now = this.ctx.currentTime
    const gap = opts.minGap ?? 0.03
    if (now - (this.lastPlayed.get(name) ?? -1) < gap) return
    this.lastPlayed.set(name, now)
    const buf = this.buffers.get('sfx:' + name)
    if (!buf) {
      void this.load('sfx', name)
      return
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = (opts.rate ?? 1) * (0.96 + Math.random() * 0.08)
    const g = this.ctx.createGain()
    let vol = opts.vol ?? 1
    let pan = 0
    if (opts.at) {
      const dx = opts.at.x - this.listener.x
      const dz = opts.at.z - this.listener.z
      const d = Math.hypot(dx, dz)
      vol *= 1 / (1 + Math.max(0, d - 6) / 22)
      // the listener faces along yaw; positive pan is to its right
      const right = { x: -Math.cos(this.listener.yaw), z: Math.sin(this.listener.yaw) }
      pan = d > 0.01 ? Math.max(-0.8, Math.min(0.8, (dx * right.x + dz * right.z) / d)) : 0
    }
    g.gain.value = vol
    const p = this.ctx.createStereoPanner()
    p.pan.value = pan
    src.connect(g).connect(p).connect(this.sfxBus)
    src.start()
  }

  voice(name: string): void {
    if (!this.ctx || this.ctx.state !== 'running') return
    const buf = this.buffers.get('voice:' + name)
    if (!buf) {
      void this.load('voice', name)
      return
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.voiceBus)
    const t = this.ctx.currentTime
    this.duck.gain.cancelScheduledValues(t)
    this.duck.gain.setTargetAtTime(0.45, t, 0.05)
    this.duck.gain.setTargetAtTime(1, t + buf.duration, 0.3)
    src.start()
  }

  async music(name: string | null, fade = 1.2): Promise<void> {
    if (!this.ctx) return
    if (this.musicNow?.name === name) return
    const old = this.musicNow
    this.musicNow = null
    const t = this.ctx.currentTime
    if (old) {
      old.gain.gain.cancelScheduledValues(t)
      old.gain.gain.setValueAtTime(old.gain.gain.value, t)
      old.gain.gain.linearRampToValueAtTime(0, t + fade)
      old.src.stop(t + fade + 0.05)
    }
    if (!name) return
    const want = name
    const buf = await this.load('music', name)
    if (!buf || !this.ctx) return
    if (this.musicNow) return // something else started while loading
    const loop = !['victory', 'defeat'].includes(want)
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.loop = loop
    const g = this.ctx.createGain()
    const t2 = this.ctx.currentTime
    g.gain.setValueAtTime(0, t2)
    g.gain.linearRampToValueAtTime(1, t2 + Math.min(fade, 0.8))
    src.connect(g).connect(this.musicBus)
    src.start()
    this.musicNow = { name: want, src, gain: g }
  }

  /** A looping effect whose volume and pitch are set every frame (thrusters). */
  loop(name: string): { set: (vol: number, rate: number) => void; stop: () => void } {
    const none = { set: () => {}, stop: () => {} }
    if (!this.ctx) return none
    const buf = this.buffers.get('sfx:' + name)
    if (!buf) {
      void this.load('sfx', name)
      return none
    }
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(g).connect(this.sfxBus)
    src.start()
    return {
      set: (vol, rate) => {
        g.gain.setTargetAtTime(vol, ctx.currentTime, 0.06)
        src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.1)
      },
      stop: () => {
        try { src.stop() } catch { /* already stopped */ }
      },
    }
  }
}

export const audio = new AudioManager()
