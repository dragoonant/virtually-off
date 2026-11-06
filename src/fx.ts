// Visual effects: pooled particles (additive glow and soft smoke), flashes, shockwave rings, explosion lights and
// beam lines. Everything is pre-allocated so a big exchange of fire never allocates or compiles a shader mid-fight.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  NormalBlending, PointLight, Points, RingGeometry, ShaderMaterial, SphereGeometry, Vector3, type Scene,
} from 'three'

const VERT = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  varying float vAlpha;
  varying vec3 vTint;
  uniform float scale;
  void main() {
    vAlpha = alpha;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const FRAG_GLOW = /* glsl */ `
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    a = a * a;
    float core = smoothstep(0.35, 0.0, d);
    gl_FragColor = vec4(vTint * (a + core * 1.5), a * vAlpha);
    gl_FragColor.rgb *= vAlpha;
  }
`
const FRAG_SMOKE = /* glsl */ `
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float a = smoothstep(1.0, 0.2, d);
    gl_FragColor = vec4(vTint, a * vAlpha * 0.55);
  }
`

class ParticlePool {
  readonly points: Points
  private n: number
  private pos: Float32Array
  private vel: Float32Array
  private tint: Float32Array
  private base: Float32Array // r g b at birth
  private size: Float32Array
  private size0: Float32Array
  private grow: Float32Array
  private alpha: Float32Array
  private life: Float32Array
  private max: Float32Array
  private drag: Float32Array
  private grav: Float32Array
  private next = 0
  private geo: BufferGeometry

  constructor(n: number, smoke: boolean) {
    this.n = n
    this.pos = new Float32Array(n * 3)
    this.vel = new Float32Array(n * 3)
    this.tint = new Float32Array(n * 3)
    this.base = new Float32Array(n * 3)
    this.size = new Float32Array(n)
    this.size0 = new Float32Array(n)
    this.grow = new Float32Array(n)
    this.alpha = new Float32Array(n)
    this.life = new Float32Array(n)
    this.max = new Float32Array(n).fill(1)
    this.drag = new Float32Array(n)
    this.grav = new Float32Array(n)
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -9999
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(this.pos, 3))
    g.setAttribute('tint', new BufferAttribute(this.tint, 3))
    g.setAttribute('size', new BufferAttribute(this.size, 1))
    g.setAttribute('alpha', new BufferAttribute(this.alpha, 1))
    this.geo = g
    const m = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: smoke ? FRAG_SMOKE : FRAG_GLOW,
      uniforms: { scale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: smoke ? NormalBlending : AdditiveBlending,
    })
    this.points = new Points(g, m)
    this.points.frustumCulled = false
    this.points.renderOrder = smoke ? 1 : 2
  }

  setScale(px: number): void {
    ;(this.points.material as ShaderMaterial).uniforms.scale.value = px
  }

  emit(p: Vector3, v: Vector3, color: Color, size: number, life: number, opts: { grow?: number; drag?: number; grav?: number } = {}): void {
    const i = this.next
    this.next = (this.next + 1) % this.n
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z
    this.base[i * 3] = color.r; this.base[i * 3 + 1] = color.g; this.base[i * 3 + 2] = color.b
    this.size0[i] = size
    this.grow[i] = opts.grow ?? 0
    this.drag[i] = opts.drag ?? 1.5
    this.grav[i] = opts.grav ?? 0
    this.life[i] = life
    this.max[i] = life
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.pos[i * 3 + 1] = -9999 }
        continue
      }
      this.life[i] -= dt
      const k = Math.max(0, this.life[i] / this.max[i])
      const d = Math.exp(-this.drag[i] * dt)
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      this.size[i] = this.size0[i] * (1 + this.grow[i] * (1 - k))
      this.alpha[i] = Math.min(1, k * 1.6)
      // glow cools from white-hot toward its colour, then fades
      const hot = Math.max(0, (k - 0.7) / 0.3)
      this.tint[i * 3] = this.base[i * 3] + (1 - this.base[i * 3]) * hot
      this.tint[i * 3 + 1] = this.base[i * 3 + 1] + (1 - this.base[i * 3 + 1]) * hot
      this.tint[i * 3 + 2] = this.base[i * 3 + 2] + (1 - this.base[i * 3 + 2]) * hot
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.size.needsUpdate = true
    this.geo.attributes.alpha.needsUpdate = true
    this.geo.attributes.tint.needsUpdate = true
  }
}

interface Timed { obj: Mesh; t: number; max: number; kind: 'flash' | 'ring' | 'beam'; s0: number; s1: number }

const tmpV = new Vector3()
const tmpV2 = new Vector3()
const tmpC = new Color()
const rnd = (a: number) => (Math.random() * 2 - 1) * a

export class Fx {
  readonly root = new Group()
  readonly glow = new ParticlePool(9000, false)
  readonly smoke = new ParticlePool(2500, true)
  private flashes: Timed[] = []
  private rings: Timed[] = []
  private beams: Timed[] = []
  private lights: { l: PointLight; t: number; max: number; i0: number }[] = []
  shake = 0 // camera trauma 0..1, decays
  slowmo = 0 // seconds of slow motion left
  slowScale = 1

  constructor(scene: Scene) {
    scene.add(this.root)
    this.root.add(this.smoke.points, this.glow.points)
    const sph = new SphereGeometry(1, 16, 12)
    for (let i = 0; i < 24; i++) {
      const m = new Mesh(sph, new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }))
      m.visible = false
      this.root.add(m)
      this.flashes.push({ obj: m, t: 0, max: 1, kind: 'flash', s0: 1, s1: 1 })
    }
    const ring = new RingGeometry(0.85, 1, 48)
    ring.rotateX(-Math.PI / 2)
    for (let i = 0; i < 12; i++) {
      const m = new Mesh(ring, new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }))
      m.visible = false
      this.root.add(m)
      this.rings.push({ obj: m, t: 0, max: 1, kind: 'ring', s0: 1, s1: 1 })
    }
    const cyl = new CylinderGeometry(1, 1, 1, 10, 1, true)
    cyl.translate(0, 0.5, 0)
    cyl.rotateX(Math.PI / 2) // along +z, from 0 to 1
    for (let i = 0; i < 12; i++) {
      const m = new Mesh(cyl, new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }))
      m.visible = false
      this.root.add(m)
      this.beams.push({ obj: m, t: 0, max: 1, kind: 'beam', s0: 1, s1: 1 })
    }
    for (let i = 0; i < 6; i++) {
      const l = new PointLight(0xffaa55, 0, 30, 1.6)
      l.position.y = -999
      this.root.add(l)
      this.lights.push({ l, t: 0, max: 1, i0: 0 })
    }
  }

  setViewportHeight(px: number): void {
    this.glow.setScale(px * 0.9)
    this.smoke.setScale(px * 0.9)
  }

  private take<T extends { t: number }>(pool: T[]): T {
    let best = pool[0]
    for (const p of pool) if (p.t <= 0) return p; else if (p.t < best.t) best = p
    return best
  }

  flash(at: Vector3, color: number, size: number, time = 0.12): void {
    const f = this.take(this.flashes)
    f.obj.position.copy(at)
    ;(f.obj.material as MeshBasicMaterial).color.set(color).multiplyScalar(2.5)
    f.s0 = size * 0.6
    f.s1 = size
    f.t = f.max = time
    f.obj.visible = true
  }

  ring(at: Vector3, color: number, radius: number, time = 0.45): void {
    const r = this.take(this.rings)
    r.obj.position.copy(at)
    r.obj.position.y = Math.max(0.05, at.y)
    ;(r.obj.material as MeshBasicMaterial).color.set(color).multiplyScalar(2)
    r.s0 = radius * 0.15
    r.s1 = radius
    r.t = r.max = time
    r.obj.visible = true
  }

  light(at: Vector3, color: number, intensity: number, time = 0.25): void {
    const l = this.take(this.lights)
    l.l.position.copy(at)
    l.l.color.set(color)
    l.i0 = intensity
    l.l.intensity = intensity
    l.t = l.max = time
  }

  /** A straight beam from a to b (rail shots, heavy charge lines). */
  beam(a: Vector3, b: Vector3, color: number, width: number, time = 0.3): void {
    const m = this.take(this.beams)
    m.obj.position.copy(a)
    m.obj.lookAt(b)
    const len = a.distanceTo(b)
    m.obj.scale.set(width, width, len)
    ;(m.obj.material as MeshBasicMaterial).color.set(color).multiplyScalar(3)
    m.s0 = width
    m.s1 = 0
    m.t = m.max = time
    m.obj.visible = true
    // sparkle along the beam
    tmpC.set(color)
    for (let i = 0; i < 40; i++) {
      tmpV.lerpVectors(a, b, Math.random())
      tmpV2.set(rnd(2), rnd(2), rnd(2))
      this.glow.emit(tmpV, tmpV2, tmpC, 0.5 + Math.random() * 0.6, 0.3 + Math.random() * 0.3, { drag: 3 })
    }
  }

  sparks(at: Vector3, color: number, n: number, speed: number, size = 0.35): void {
    tmpC.set(color)
    for (let i = 0; i < n; i++) {
      tmpV2.set(rnd(1), rnd(1) + 0.3, rnd(1)).normalize().multiplyScalar(speed * (0.3 + Math.random()))
      this.glow.emit(at, tmpV2, tmpC, size * (0.6 + Math.random() * 0.8), 0.25 + Math.random() * 0.35, { drag: 2.5, grav: 12 })
    }
  }

  muzzle(at: Vector3, dir: Vector3, color: number, scale = 1): void {
    this.flash(at, color, 1.1 * scale, 0.08)
    tmpC.set(color)
    for (let i = 0; i < 10; i++) {
      tmpV2.copy(dir).multiplyScalar(8 + Math.random() * 10).add(tmpV.set(rnd(3), rnd(3), rnd(3)))
      this.glow.emit(at, tmpV2, tmpC, 0.5 * scale, 0.15 + Math.random() * 0.1, { drag: 6 })
    }
    this.light(at, color, 30 * scale, 0.1)
  }

  explosion(at: Vector3, radius: number, color = 0xff8a3d): void {
    this.flash(at, 0xfff2d0, radius * 1.1, 0.16)
    this.flash(at, color, radius * 0.8, 0.35)
    this.ring(tmpV.set(at.x, Math.max(0.08, at.y - radius * 0.3), at.z), color, radius * 2.4, 0.5)
    this.light(at, color, 80 * radius, 0.35)
    tmpC.set(color)
    const fire = Math.round(30 + radius * 18)
    for (let i = 0; i < fire; i++) {
      tmpV2.set(rnd(1), rnd(1) + 0.4, rnd(1)).normalize().multiplyScalar(radius * (2 + Math.random() * 5))
      this.glow.emit(at, tmpV2, tmpC, radius * (0.6 + Math.random() * 0.8), 0.35 + Math.random() * 0.45, { drag: 3.5, grow: 1.2, grav: -1 })
    }
    this.sparks(at, 0xffd28a, Math.round(20 + radius * 6), radius * 9, 0.3)
    tmpC.set(0x2a2622)
    for (let i = 0; i < 16; i++) {
      tmpV2.set(rnd(1), Math.random() + 0.3, rnd(1)).multiplyScalar(radius * 2)
      tmpV.copy(at).add(tmpV2.clone().multiplyScalar(0.2))
      this.smoke.emit(tmpV, tmpV2, tmpC, radius * (1.5 + Math.random()), 1.2 + Math.random() * 0.8, { drag: 1.8, grow: 1.8, grav: -1.5 })
    }
    this.shake = Math.min(1, this.shake + radius * 0.07)
  }

  /** Engine glow and exhaust from a thruster. */
  exhaust(at: Vector3, dir: Vector3, color: number, power: number): void {
    tmpC.set(color)
    const n = Math.ceil(power * 3)
    for (let i = 0; i < n; i++) {
      tmpV2.copy(dir).multiplyScalar(10 + Math.random() * 8).add(tmpV.set(rnd(1.2), rnd(1.2), rnd(1.2)))
      this.glow.emit(at, tmpV2, tmpC, 0.55 + Math.random() * 0.4 * power, 0.12 + Math.random() * 0.12, { drag: 4, grow: 0.5 })
    }
  }

  dust(at: Vector3, n: number, spread: number): void {
    tmpC.set(0x8a8f99)
    for (let i = 0; i < n; i++) {
      tmpV2.set(rnd(1), Math.random() * 0.4, rnd(1)).normalize().multiplyScalar(spread * (0.5 + Math.random()))
      this.smoke.emit(at, tmpV2, tmpC, 1 + Math.random(), 0.6 + Math.random() * 0.5, { drag: 3, grow: 1.5 })
    }
  }

  trail(at: Vector3, color: number, size: number, life = 0.25): void {
    tmpC.set(color)
    tmpV2.set(rnd(0.4), rnd(0.4), rnd(0.4))
    this.glow.emit(at, tmpV2, tmpC, size, life, { drag: 2 })
  }

  smokeTrail(at: Vector3): void {
    tmpC.set(0x9a9aa0)
    tmpV2.set(rnd(0.5), 0.4 + Math.random() * 0.4, rnd(0.5))
    this.smoke.emit(at, tmpV2, tmpC, 0.7, 0.9, { drag: 1, grow: 2.5 })
  }

  update(dt: number): void {
    this.glow.update(dt)
    this.smoke.update(dt)
    for (const f of this.flashes) {
      if (f.t <= 0) { f.obj.visible = false; continue }
      f.t -= dt
      const k = Math.max(0, f.t / f.max)
      f.obj.scale.setScalar(f.s0 + (f.s1 - f.s0) * (1 - k))
      ;(f.obj.material as MeshBasicMaterial).opacity = k
    }
    for (const r of this.rings) {
      if (r.t <= 0) { r.obj.visible = false; continue }
      r.t -= dt
      const k = Math.max(0, r.t / r.max)
      const e = 1 - k * k
      r.obj.scale.setScalar(r.s0 + (r.s1 - r.s0) * e)
      ;(r.obj.material as MeshBasicMaterial).opacity = k
    }
    for (const b of this.beams) {
      if (b.t <= 0) { b.obj.visible = false; continue }
      b.t -= dt
      const k = Math.max(0, b.t / b.max)
      b.obj.scale.x = b.obj.scale.y = b.s0 * (0.2 + 0.8 * k)
      ;(b.obj.material as MeshBasicMaterial).opacity = k
    }
    for (const l of this.lights) {
      if (l.t <= 0) { l.l.intensity = 0; continue }
      l.t -= dt
      l.l.intensity = l.i0 * Math.max(0, l.t / l.max)
    }
    this.shake = Math.max(0, this.shake - dt * 1.6)
  }
}
