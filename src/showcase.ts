// The 3D backdrop of the menus: one machine on a turntable pad over the first arena's sky.
import {
  AdditiveBlending, AmbientLight, AnimationMixer, CircleGeometry, Color, DirectionalLight, EquirectangularReflectionMapping, Group,
  HemisphereLight, LoopRepeat, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, RingGeometry, Scene,
  SRGBColorSpace, type Object3D,
} from 'three'
import { assets } from './assets'
import { SCALE } from './mech'
import { mechById } from './roster'

export class Showcase {
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  private turntable = new Group()
  private model: Object3D | null = null
  private mixer: AnimationMixer | null = null
  private id = ''
  private t = 0
  private ring: Mesh
  /** Where the machine sits on screen: 0 centre, positive pushes it right. */
  offset = 0
  private glow: MeshBasicMaterial

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(36, aspect, 0.1, 1000)
    const sky = assets.texture('sky/arena1.webp')
    if (sky) {
      sky.mapping = EquirectangularReflectionMapping
      sky.colorSpace = SRGBColorSpace
      this.scene.background = sky
      this.scene.backgroundBlurriness = 0.15
      this.scene.backgroundIntensity = 0.7
      this.scene.environment = assets.envFor(sky)
      this.scene.environmentIntensity = 0.6
    } else this.scene.background = new Color(0x05070d)
    const key = new DirectionalLight(0xfff2e0, 3.2)
    key.position.set(4, 8, 6)
    const rim = new DirectionalLight(0x5ff2ff, 2.4)
    rim.position.set(-6, 4, -6)
    this.scene.add(key, rim, new HemisphereLight(0x9fc4ff, 0x20242c, 0.8), new AmbientLight(0xffffff, 0.15))
    const pad = new Mesh(new CircleGeometry(2.4, 64), new MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.85, roughness: 0.35 }))
    pad.rotation.x = -Math.PI / 2
    this.glow = new MeshBasicMaterial({ color: new Color(0x5ff2ff).multiplyScalar(2), transparent: true, blending: AdditiveBlending, depthWrite: false })
    this.ring = new Mesh(new RingGeometry(2.25, 2.4, 64), this.glow)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.01
    this.turntable.add(pad, this.ring)
    this.scene.add(this.turntable)
  }

  show(id: string): void {
    if (id === this.id) return
    this.id = id
    if (this.model) this.turntable.remove(this.model)
    this.mixer?.stopAllAction()
    if (!assets.hasMech(id)) return
    const m = assets.mech(id)
    m.scene.scale.setScalar(SCALE)
    this.model = m.scene
    this.turntable.add(m.scene)
    this.mixer = new AnimationMixer(m.scene)
    const idle = m.clips.find((c) => c.name === 'idle')
    if (idle) this.mixer.clipAction(idle).setLoop(LoopRepeat, Infinity).play()
    this.glow.color.set(mechById(id).accent).multiplyScalar(2)
  }

  update(dt: number): void {
    this.t += dt
    this.mixer?.update(dt)
    this.turntable.rotation.y = this.t * 0.35
    const r = 7.2
    const a = 0.5
    this.camera.position.set(Math.sin(a) * r - this.offset, 2.2, Math.cos(a) * r)
    this.camera.lookAt(-this.offset, 1.15, 0)
  }
}
