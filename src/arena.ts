// The three proving-ground arenas: a floating deck, its energy fence, cover blocks and props, the sky and the light.
// Collision is axis-aligned boxes (machines stand on their tops, shots stop on their faces) inside a round or square
// boundary.
import {
  AdditiveBlending, AmbientLight, BackSide, BoxGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry,
  DirectionalLight, EquirectangularReflectionMapping, Fog, Group, HemisphereLight, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, MirroredRepeatWrapping, PlaneGeometry, RepeatWrapping, SRGBColorSpace, SphereGeometry,
  Vector3, type Object3D, type Scene, type Texture,
} from 'three'
import { assets } from './assets'

export interface Block { x: number; z: number; w: number; d: number; h: number; y0?: number; prop?: string; accent?: number }

export interface ArenaDef {
  id: string
  name: string
  tagline: string
  shape: 'circle' | 'square'
  size: number // radius or half-width
  sky: string // assets/sky/<sky>.webp
  floor: string // assets/textures/<floor>.webp
  floorTint: number
  sun: { dir: [number, number, number]; color: number; intensity: number }
  hemi: { sky: number; ground: number; intensity: number }
  fence: number
  fog: number
  music: string
  blocks: Block[]
}

const ring = (n: number, r: number, make: (x: number, z: number, i: number) => Block): Block[] =>
  Array.from({ length: n }, (_, i) => make(Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r, i))

export const ARENAS: ArenaDef[] = [
  {
    id: 'a1',
    name: 'Sunward Deck',
    tagline: 'Open deck · low cover · high orbit',
    shape: 'square',
    size: 48,
    sky: 'arena1',
    floor: 'floor1',
    floorTint: 0xffffff,
    sun: { dir: [0.4, 1, 0.25], color: 0xfff4e6, intensity: 3.2 },
    hemi: { sky: 0x9fc4ff, ground: 0x3a3f4a, intensity: 1.1 },
    fence: 0x5ff2ff,
    fog: 0x8fb4e8,
    music: 'battle1',
    blocks: [
      { x: 0, z: 0, w: 4, d: 4, h: 5.5, prop: 'pylon', accent: 0x5ff2ff },
      { x: -18, z: 14, w: 9, d: 2.6, h: 2.4, prop: 'bunker' },
      { x: 18, z: -14, w: 9, d: 2.6, h: 2.4, prop: 'bunker' },
      { x: 16, z: 18, w: 2.6, d: 9, h: 2.4, prop: 'bunker' },
      { x: -16, z: -18, w: 2.6, d: 9, h: 2.4, prop: 'bunker' },
      { x: -32, z: -30, w: 5, d: 5, h: 7, prop: 'gantry' },
      { x: 32, z: 30, w: 5, d: 5, h: 7, prop: 'gantry' },
      { x: 34, z: -32, w: 4, d: 4, h: 3.2, accent: 0xffb547 },
      { x: -34, z: 32, w: 4, d: 4, h: 3.2, accent: 0xffb547 },
    ],
  },
  {
    id: 'a2',
    name: 'Ring Spire',
    tagline: 'Pillar ring · break line of sight',
    shape: 'circle',
    size: 50,
    sky: 'arena2',
    floor: 'floor2',
    floorTint: 0xffffff,
    sun: { dir: [-0.7, 0.55, -0.4], color: 0xffc58a, intensity: 3.0 },
    hemi: { sky: 0xffb070, ground: 0x2a2440, intensity: 1.0 },
    fence: 0xffb547,
    fog: 0x6a4a5a,
    music: 'battle2',
    blocks: [
      ...ring(8, 22, (x, z) => ({ x, z, w: 3.4, d: 3.4, h: 10, prop: 'pillar', accent: 0x5ff2ff })),
      ...ring(4, 38, (x, z) => ({ x, z, w: 3, d: 3, h: 6, prop: 'pylon', accent: 0xffb547 })),
      { x: 0, z: 0, w: 7, d: 7, h: 2.2, accent: 0xffb547 },
    ],
  },
  {
    id: 'a3',
    name: 'Ember Foundry',
    tagline: 'Raised decks · fight for the high ground',
    shape: 'square',
    size: 46,
    sky: 'arena3',
    floor: 'floor3',
    floorTint: 0xffffff,
    sun: { dir: [0.3, 0.6, -0.8], color: 0xff9a6a, intensity: 2.6 },
    hemi: { sky: 0xff7a4a, ground: 0x1a1214, intensity: 0.9 },
    fence: 0xff5a2a,
    fog: 0x3a1a14,
    music: 'battle3',
    blocks: [
      { x: -20, z: -20, w: 14, d: 14, h: 3, accent: 0xff7a2a },
      { x: 20, z: 20, w: 14, d: 14, h: 3, accent: 0xff7a2a },
      { x: 20, z: -20, w: 10, d: 10, h: 5.5, accent: 0xff7a2a },
      { x: -20, z: 20, w: 10, d: 10, h: 5.5, accent: 0xff7a2a },
      { x: 0, z: 0, w: 3.4, d: 3.4, h: 9, prop: 'pillar', accent: 0xff7a2a },
      { x: 0, z: -26, w: 8, d: 2.6, h: 2.4, prop: 'bunker' },
      { x: 0, z: 26, w: 8, d: 2.6, h: 2.4, prop: 'bunker' },
      { x: -30, z: 0, w: 4.5, d: 4.5, h: 7, prop: 'gantry' },
      { x: 30, z: 0, w: 4.5, d: 4.5, h: 7, prop: 'gantry' },
    ],
  },
]

export const TRAINING: ArenaDef = { ...ARENAS[0], id: 'train', name: 'Training Range', tagline: 'Free fire · nothing counts', music: 'select' }

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/** Fallback sky when the generated panorama is not there: deep space with stars over a planet glow. */
function fallbackSky(def: ArenaDef): Texture {
  const t = canvasTex(2048, 1024, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 1024)
    const fog = new Color(def.fog)
    grad.addColorStop(0, '#020308')
    grad.addColorStop(0.45, '#0a1022')
    grad.addColorStop(0.52, '#' + fog.clone().multiplyScalar(0.8).getHexString())
    grad.addColorStop(1, '#' + fog.clone().multiplyScalar(0.25).getHexString())
    g.fillStyle = grad
    g.fillRect(0, 0, 2048, 1024)
    for (let i = 0; i < 1400; i++) {
      const y = Math.random() * 480
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.9})`
      g.fillRect(Math.random() * 2048, y, Math.random() < 0.05 ? 2 : 1, 1)
    }
  })
  t.mapping = EquirectangularReflectionMapping
  return t
}

function gridTex(color: number): CanvasTexture {
  const c = new Color(color)
  const t = canvasTex(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512)
    g.strokeStyle = `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},0.55)`
    g.lineWidth = 3
    g.strokeRect(0, 0, 512, 512)
    g.lineWidth = 1
    g.strokeStyle = `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},0.18)`
    for (let i = 1; i < 4; i++) {
      g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke()
      g.beginPath(); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke()
    }
  })
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

function fenceTex(): CanvasTexture {
  const t = canvasTex(64, 256, (g) => {
    const grad = g.createLinearGradient(0, 256, 0, 0)
    grad.addColorStop(0, 'rgba(255,255,255,0.9)')
    grad.addColorStop(0.15, 'rgba(255,255,255,0.35)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 256)
    g.fillStyle = 'rgba(255,255,255,0.35)'
    for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 64, 2)
  })
  t.wrapS = RepeatWrapping
  return t
}

function panelTex(): CanvasTexture {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#5a5f68'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`
      g.fillRect(Math.random() * 256, Math.random() * 256, 40 + Math.random() * 120, 30 + Math.random() * 80)
    }
    g.strokeStyle = 'rgba(0,0,0,0.5)'
    g.lineWidth = 3
    g.strokeRect(4, 4, 248, 248)
    g.strokeRect(4, 128, 248, 1)
    g.fillStyle = '#ffb547'
    for (let x = -256; x < 256; x += 40) {
      g.beginPath(); g.moveTo(x, 240); g.lineTo(x + 20, 240); g.lineTo(x + 36, 256); g.lineTo(x + 16, 256); g.fill()
    }
  })
  return t
}

export class Arena {
  readonly def: ArenaDef
  readonly group = new Group()
  readonly blocks: Block[]
  private fenceMat: MeshBasicMaterial | null = null
  private t = 0
  sunLight!: DirectionalLight

  constructor(def: ArenaDef) {
    this.def = def
    this.blocks = def.blocks
  }

  build(scene: Scene): void {
    const def = this.def
    // sky and image-based light
    const sky = assets.texture('sky/' + def.sky + '.webp')
    const skyTex = sky ?? fallbackSky(def)
    skyTex.mapping = EquirectangularReflectionMapping
    skyTex.colorSpace = SRGBColorSpace
    scene.background = skyTex
    scene.backgroundIntensity = 1
    scene.environment = assets.envFor(skyTex)
    scene.environmentIntensity = 0.55
    scene.fog = new Fog(def.fog, 120, 420)

    const sun = new DirectionalLight(def.sun.color, def.sun.intensity)
    sun.position.set(...def.sun.dir).normalize().multiplyScalar(80)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const sc = sun.shadow.camera
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 220
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.04
    this.sunLight = sun
    this.group.add(sun, sun.target)
    this.group.add(new HemisphereLight(def.hemi.sky, def.hemi.ground, def.hemi.intensity))
    this.group.add(new AmbientLight(0xffffff, 0.12))

    // deck
    const floorTex = assets.texture('textures/' + def.floor + '.webp')
    const span = def.size * 2 + 8
    const floorMat = new MeshStandardMaterial({ color: def.floorTint, metalness: 0.55, roughness: 0.55 })
    if (floorTex) {
      const ft = floorTex.clone()
      ft.wrapS = ft.wrapT = MirroredRepeatWrapping
      ft.repeat.set(span / 12, span / 12)
      ft.colorSpace = SRGBColorSpace
      ft.anisotropy = 8
      ft.needsUpdate = true
      floorMat.map = ft
    } else floorMat.color.set(0x4a505a)
    const floorGeo = def.shape === 'circle' ? new CircleGeometry(def.size + 4, 96) : new PlaneGeometry(span, span)
    floorGeo.rotateX(-Math.PI / 2)
    if (def.shape === 'circle') {
      // planar UVs for the circle so the texture tiles like the square deck
      const uv = floorGeo.attributes.uv
      const pos = floorGeo.attributes.position
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + span / 2) / span, (pos.getZ(i) + span / 2) / span)
    }
    const floor = new Mesh(floorGeo, floorMat)
    floor.receiveShadow = true
    this.group.add(floor)
    const grid = new Mesh(floorGeo.clone(), new MeshBasicMaterial({ map: gridTex(def.fence), transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.35, fog: false }))
    const gm = (grid.material as MeshBasicMaterial).map!
    gm.repeat.set(span / 8, span / 8)
    if (def.shape === 'circle') gm.repeat.set(span / 8, span / 8)
    grid.position.y = 0.02
    this.group.add(grid)

    // the platform's thick rim and underside, so the deck reads as floating
    const rimMat = new MeshStandardMaterial({ color: 0x2c3038, metalness: 0.8, roughness: 0.4 })
    const under = def.shape === 'circle'
      ? new Mesh(new CylinderGeometry(def.size + 4, def.size * 0.6, 14, 64, 1), rimMat)
      : new Mesh(new BoxGeometry(span, 14, span), rimMat)
    under.position.y = -7.02
    this.group.add(under)

    // energy fence
    const ft = fenceTex()
    this.fenceMat = new MeshBasicMaterial({ map: ft, color: new Color(def.fence).multiplyScalar(0.55), transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: 2, fog: false })
    const fenceH = 7
    if (def.shape === 'circle') {
      const f = new Mesh(new CylinderGeometry(def.size + 1, def.size + 1, fenceH, 96, 1, true), this.fenceMat)
      ft.repeat.set(24, 1)
      f.position.y = fenceH / 2
      this.group.add(f)
      const lip = new Mesh(new CylinderGeometry(def.size + 2.2, def.size + 2.2, 0.8, 96, 1, true), new MeshStandardMaterial({ color: 0x1c2026, metalness: 0.9, roughness: 0.3, emissive: new Color(def.fence), emissiveIntensity: 0.4, side: 2 }))
      lip.position.y = 0.4
      this.group.add(lip)
    } else {
      ft.repeat.set(10, 1)
      const s = def.size + 1
      for (let i = 0; i < 4; i++) {
        const f = new Mesh(new PlaneGeometry(s * 2, fenceH), this.fenceMat)
        const a = (i * Math.PI) / 2
        f.position.set(Math.sin(a) * s, fenceH / 2, Math.cos(a) * s)
        f.rotation.y = a
        this.group.add(f)
        const lip = new Mesh(new BoxGeometry(s * 2 + 2, 0.8, 1.2), new MeshStandardMaterial({ color: 0x1c2026, metalness: 0.9, roughness: 0.3, emissive: new Color(def.fence), emissiveIntensity: 0.4 }))
        lip.position.set(Math.sin(a) * (s + 0.6), 0.4, Math.cos(a) * (s + 0.6))
        lip.rotation.y = a
        this.group.add(lip)
      }
    }
    // corner beacons
    const beaconGeo = new SphereGeometry(0.6, 12, 8)
    const beaconMat = new MeshBasicMaterial({ color: new Color(def.fence).multiplyScalar(3) })
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const r = def.shape === 'circle' ? def.size + 1.5 : (def.size + 1.5) / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)))
      const b = new Mesh(beaconGeo, beaconMat)
      b.position.set(Math.cos(a) * r, 7.4, Math.sin(a) * r)
      this.group.add(b)
    }

    // cover
    const wallTex = assets.texture('textures/wall1.webp') ?? panelTex()
    for (const b of this.blocks) this.group.add(this.blockMesh(b, wallTex))

    // a slow-turning distant station far below, for parallax
    const station = new Mesh(new CylinderGeometry(30, 30, 3, 48, 1, true), new MeshStandardMaterial({ color: 0x30343c, metalness: 0.9, roughness: 0.5, emissive: new Color(def.fence), emissiveIntensity: 0.15, side: BackSide }))
    station.position.set(160, -90, -220)
    station.rotation.x = 0.6
    station.name = 'station'
    this.group.add(station)

    scene.add(this.group)
  }

  private blockMesh(b: Block, wallTex: Texture): Object3D {
    const g = new Group()
    g.position.set(b.x, b.y0 ?? 0, b.z)
    const prop = b.prop ? assets.prop(b.prop) : null
    if (prop) {
      // turn a long prop to lie along the box's long side, then fit it to the box; the collision is the box
      let sx = prop.size.x, sz = prop.size.z
      if (Math.abs(b.w - b.d) > 0.5 && (b.w > b.d) !== (sx > sz)) {
        prop.obj.children[0].rotation.y = Math.PI / 2
        prop.obj.children[0].position.set(prop.obj.children[0].position.z, prop.obj.children[0].position.y, -prop.obj.children[0].position.x)
        ;[sx, sz] = [sz, sx]
      }
      const k = Math.min(b.w / sx, b.h / prop.size.y, b.d / sz)
      const kx = b.w / sx, ky = b.h / prop.size.y, kz = b.d / sz
      // keep proportions close to the model while filling the box
      prop.obj.scale.set(Math.min(kx, k * 1.4), ky, Math.min(kz, k * 1.4))
      g.add(prop.obj)
      return g
    }
    const t = wallTex.clone()
    t.wrapS = t.wrapT = MirroredRepeatWrapping
    t.repeat.set(Math.max(1, Math.round(Math.max(b.w, b.d) / 4)), Math.max(1, Math.round(b.h / 4)))
    t.needsUpdate = true
    const m = new Mesh(new BoxGeometry(b.w, b.h, b.d), new MeshStandardMaterial({ map: t, color: 0xb8bcc6, metalness: 0.6, roughness: 0.45 }))
    m.position.y = b.h / 2
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
    const accent = new Color(b.accent ?? 0x5ff2ff).multiplyScalar(2.2)
    const stripMat = new MeshBasicMaterial({ color: accent })
    for (const [w, d, x, z] of [[b.w + 0.1, 0.18, 0, b.d / 2], [b.w + 0.1, 0.18, 0, -b.d / 2], [0.18, b.d + 0.1, b.w / 2, 0], [0.18, b.d + 0.1, -b.w / 2, 0]] as const) {
      const s = new Mesh(new BoxGeometry(w, 0.14, d), stripMat)
      s.position.set(x, b.h - 0.35, z)
      g.add(s)
    }
    return g
  }

  update(dt: number): void {
    this.t += dt
    if (this.fenceMat?.map) this.fenceMat.map.offset.y = (this.t * 0.15) % 1
    const st = this.group.getObjectByName('station')
    if (st) st.rotation.y += dt * 0.02
  }

  /** Keep the shadow camera on the fight. */
  focus(p: Vector3): void {
    const s = this.sunLight
    const d = new Vector3(...this.def.sun.dir).normalize().multiplyScalar(80)
    s.target.position.copy(p)
    s.position.copy(p).add(d)
  }

  // --- collision -------------------------------------------------------------------------------------------------

  /** Keep a circle of radius r inside the fence. */
  clampBounds(p: Vector3, r: number): boolean {
    const lim = this.def.size - r
    if (this.def.shape === 'circle') {
      const d = Math.hypot(p.x, p.z)
      if (d > lim) { p.x *= lim / d; p.z *= lim / d; return true }
      return false
    }
    let hit = false
    if (p.x > lim) { p.x = lim; hit = true }
    if (p.x < -lim) { p.x = -lim; hit = true }
    if (p.z > lim) { p.z = lim; hit = true }
    if (p.z < -lim) { p.z = -lim; hit = true }
    return hit
  }

  /** Height of the highest surface under a circle at p whose top is at or below the feet (plus a step). */
  groundAt(p: Vector3, r: number, feet: number): number {
    let g = 0
    for (const b of this.blocks) {
      const top = (b.y0 ?? 0) + b.h
      if (top > feet + 0.35) continue
      if (Math.abs(p.x - b.x) < b.w / 2 + r * 0.5 && Math.abs(p.z - b.z) < b.d / 2 + r * 0.5) g = Math.max(g, top)
    }
    return g
  }

  /** Push a standing circle (feet at p.y, height h) out of every box it overlaps from the side. */
  pushOut(p: Vector3, r: number, h: number): boolean {
    let hit = false
    for (const b of this.blocks) {
      const y0 = b.y0 ?? 0
      const top = y0 + b.h
      if (p.y >= top - 0.3 || p.y + h <= y0) continue
      const hx = b.w / 2 + r, hz = b.d / 2 + r
      const dx = p.x - b.x, dz = p.z - b.z
      if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue
      const ox = hx - Math.abs(dx), oz = hz - Math.abs(dz)
      if (ox < oz) p.x += Math.sign(dx || 1) * ox
      else p.z += Math.sign(dz || 1) * oz
      hit = true
    }
    return hit
  }

  /** First hit of a moving sphere from a to b against the boxes and the deck: the fraction 0..1 along it, or -1. */
  sweep(a: Vector3, b: Vector3, r: number): number {
    let best = -1
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
    if (b.y < r * 0.5 && a.y >= r * 0.5) best = (a.y - r * 0.5) / Math.max(1e-6, a.y - b.y)
    for (const bl of this.blocks) {
      const y0 = bl.y0 ?? 0
      const mins = [bl.x - bl.w / 2 - r, y0 - r, bl.z - bl.d / 2 - r]
      const maxs = [bl.x + bl.w / 2 + r, y0 + bl.h + r, bl.z + bl.d / 2 + r]
      const o = [a.x, a.y, a.z], d = [dx, dy, dz]
      let t0 = 0, t1 = 1, ok = true
      for (let i = 0; i < 3 && ok; i++) {
        if (Math.abs(d[i]) < 1e-8) { if (o[i] < mins[i] || o[i] > maxs[i]) ok = false; continue }
        let ta = (mins[i] - o[i]) / d[i], tb = (maxs[i] - o[i]) / d[i]
        if (ta > tb) [ta, tb] = [tb, ta]
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb)
        if (t0 > t1) ok = false
      }
      if (ok && (best < 0 || t0 < best)) best = t0
    }
    return best
  }

  /** Whether a straight line from a to b is clear of cover. */
  clear(a: Vector3, b: Vector3): boolean {
    return this.sweep(a, b, 0.05) < 0
  }

  /** Whether p (at the fence) is outside; used to pop shots that leave the arena. */
  outside(p: Vector3): boolean {
    const lim = this.def.size + 1
    return this.def.shape === 'circle' ? Math.hypot(p.x, p.z) > lim : Math.abs(p.x) > lim || Math.abs(p.z) > lim
  }
}
