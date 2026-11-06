// Loads everything a match needs before it starts (KB rule 26: a model is never drawn as a stand-in while it loads).
// Optional files (generated skies, textures, props) are tried once; a missing one falls back to a procedural look.
import { Box3, Group, PMREMGenerator, SRGBColorSpace, TextureLoader, Vector3, type AnimationClip, type Object3D, type Texture, type WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { smoothNormals } from './smoothNormals'

const BASE = import.meta.env.BASE_URL + 'assets/'

interface Model { scene: Object3D; clips: AnimationClip[] }

class Assets {
  private gltf = new GLTFLoader()
  private tex = new TextureLoader()
  private models = new Map<string, Model>()
  private props = new Map<string, Model | null>()
  private textures = new Map<string, Texture | null>()
  private envs = new Map<Texture, Texture>()
  private pmrem: PMREMGenerator | null = null
  loaded = 0
  total = 0

  setRenderer(r: WebGLRenderer): void {
    this.pmrem = new PMREMGenerator(r)
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.total++
    return p.finally(() => this.loaded++)
  }

  loadMech(id: string): Promise<void> {
    if (this.models.has(id)) return Promise.resolve()
    return this.track(
      this.gltf.loadAsync(BASE + 'models/' + id + '.glb').then((g) => {
        smoothNormals(g.scene)
        g.scene.traverse((o) => {
          const m = (o as { material?: { metalness?: number; roughness?: number; envMapIntensity?: number } }).material
          if (m) { m.metalness = 0.35; m.roughness = 0.42; m.envMapIntensity = 1 }
        })
        this.models.set(id, { scene: g.scene, clips: g.animations })
      }),
    )
  }

  loadProp(name: string): Promise<void> {
    if (this.props.has(name)) return Promise.resolve()
    return this.track(
      this.gltf.loadAsync(BASE + 'props/' + name + '.glb').then(
        (g) => {
          smoothNormals(g.scene, 40)
          this.props.set(name, { scene: g.scene, clips: [] })
        },
        () => { this.props.set(name, null) },
      ),
    )
  }

  loadTexture(path: string): Promise<void> {
    if (this.textures.has(path)) return Promise.resolve()
    return this.track(
      this.tex.loadAsync(BASE + path).then(
        (t) => { t.colorSpace = SRGBColorSpace; this.textures.set(path, t) },
        () => { this.textures.set(path, null) },
      ),
    )
  }

  texture(path: string): Texture | null {
    return this.textures.get(path) ?? null
  }

  /** A fresh, independently animated copy of a machine. */
  mech(id: string): Model {
    const m = this.models.get(id)
    if (!m) throw new Error('model not loaded: ' + id)
    const scene = cloneSkinned(m.scene)
    scene.traverse((o) => {
      o.castShadow = true
      o.receiveShadow = true
      o.frustumCulled = false
    })
    return { scene, clips: m.clips }
  }

  hasMech(id: string): boolean {
    return this.models.has(id)
  }

  /** A copy of a prop, its feet on y = 0, centred, with its size. */
  prop(name: string): { obj: Object3D; size: Vector3 } | null {
    const p = this.props.get(name)
    if (!p) return null
    const obj = p.scene.clone(true)
    obj.traverse((o) => { o.castShadow = true; o.receiveShadow = true })
    const box = new Box3().setFromObject(obj)
    const size = box.getSize(new Vector3())
    const c = box.getCenter(new Vector3())
    obj.position.set(-c.x, -box.min.y, -c.z)
    const wrap = new Group()
    wrap.add(obj)
    return { obj: wrap, size }
  }

  envFor(t: Texture): Texture | null {
    if (!this.pmrem) return null
    let e = this.envs.get(t)
    if (!e) {
      e = this.pmrem.fromEquirectangular(t).texture
      this.envs.set(t, e)
    }
    return e
  }
}

export const assets = new Assets()
