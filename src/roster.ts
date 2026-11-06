// The six playable machines and their weapons. Every name here is this project's own (the machines come from the
// owner's Assembly Forge roster). Numbers are tuning, not a port: change them freely.

export type ProjKind =
  | 'bolt' // fast energy bolt, light homing
  | 'heavy' // large slow energy ball, knocks down
  | 'rail' // hitscan beam after a short aim, knocks down
  | 'rapid' // small fast rounds in bursts
  | 'missile' // homing, explodes
  | 'shell' // ballistic arc, explodes
  | 'wave' // crescent that slides along the floor
  | 'drone' // slow, very homing blade or bird
  | 'claw' // fast straight grab that stuns

export type Slot = 'L' | 'R' | 'C'
export type Stance = 'stand' | 'dash' | 'air'

export interface ShotParams {
  kind: ProjKind
  damage: number
  speed: number // units per second (rail: ignored)
  count: number // projectiles per trigger pull
  spread: number // radians between projectiles of one pull (fanned)
  interval: number // seconds between projectiles of one pull (burst)
  homing: number // radians per second the projectile may turn toward its target
  homingTime: number // seconds homing stays active
  radius: number // hit radius
  life: number // seconds
  impact: number // stagger build-up per hit; 100 knocks down
  blast?: number // explosion radius
  arc?: number // shell: launch angle bias (0..1)
  charge?: number // seconds of aim before release (rail, heavy)
  color: number
  sfx: string
}

export interface WeaponDef {
  name: string
  cost: number // gauge per pull (gauge is 100)
  regen: number // gauge per second
  cooldown: number // seconds between pulls
  stand: ShotParams
  dash?: Partial<ShotParams>
  air?: Partial<ShotParams>
}

export interface MeleeDef {
  name: string
  damage: number
  range: number // engage distance
  lunge: number // units per second while closing
  impact: number
}

export interface MechDef {
  id: string
  name: string
  role: string
  blurb: string
  hp: number
  walk: number
  dash: number
  dashTime: number
  airDash: number
  jump: number
  weight: number // multiplies stagger resistance
  accent: number // HUD and thruster colour
  weapons: Record<Slot, WeaponDef>
  melee: MeleeDef
}

const base = (p: Partial<ShotParams> & Pick<ShotParams, 'kind' | 'damage' | 'speed' | 'color' | 'sfx'>): ShotParams => ({
  count: 1,
  spread: 0,
  interval: 0,
  homing: 0,
  homingTime: 0.6,
  radius: 0.5,
  life: 3,
  impact: 25,
  ...p,
})

export const ROSTER: MechDef[] = [
  {
    id: 'u07',
    name: 'Halo Sovereign',
    role: 'Ace',
    blurb: 'Balanced in every range. A lance rifle that tracks, a blade wave that cuts through cover lines, and an overdrive burst.',
    hp: 1000,
    walk: 10,
    dash: 30,
    dashTime: 0.75,
    airDash: 26,
    jump: 15,
    weight: 1,
    accent: 0x5ff2ff,
    weapons: {
      R: {
        name: 'Heavy lance rifle',
        cost: 22,
        regen: 30,
        cooldown: 0.32,
        stand: base({ kind: 'bolt', damage: 70, speed: 80, homing: 1.6, homingTime: 0.5, color: 0x6ff6ff, sfx: 'beam_shot' }),
        dash: { count: 2, interval: 0.09, damage: 55 },
        air: { homing: 2.4, damage: 60 },
      },
      L: {
        name: 'Lumen blade wave',
        cost: 40,
        regen: 22,
        cooldown: 0.6,
        stand: base({ kind: 'wave', damage: 110, speed: 48, radius: 1.3, impact: 60, life: 1.6, homing: 0.6, color: 0x9ffcff, sfx: 'sword_swing' }),
        dash: { count: 3, spread: 0.22, damage: 80 },
      },
      C: {
        name: 'Overdrive lance',
        cost: 100,
        regen: 14,
        cooldown: 1.2,
        stand: base({ kind: 'heavy', damage: 220, speed: 42, radius: 1.6, impact: 120, life: 3, charge: 0.35, homing: 0.5, color: 0x5ff2ff, sfx: 'heavy_beam' }),
        air: { homing: 0.9 },
      },
    },
    melee: { name: 'Lumen blade', damage: 190, range: 7, lunge: 30, impact: 120 },
  },
  {
    id: 'u11',
    name: 'Night Shrike',
    role: 'Sniper',
    blurb: 'Light and quick. A needle rifle that hits instantly at any range, and a recon bird that hunts on its own.',
    hp: 880,
    walk: 11,
    dash: 31,
    dashTime: 0.7,
    airDash: 28,
    jump: 16,
    weight: 0.8,
    accent: 0xc8a8ff,
    weapons: {
      R: {
        name: 'Needle rifle',
        cost: 50,
        regen: 20,
        cooldown: 0.9,
        stand: base({ kind: 'rail', damage: 150, speed: 0, radius: 0.6, impact: 110, life: 0.3, charge: 0.45, color: 0xd6b8ff, sfx: 'sniper_shot' }),
        dash: { charge: 0.25, damage: 110, impact: 70 },
        air: { charge: 0.3 },
      },
      L: {
        name: 'Raven drone',
        cost: 45,
        regen: 18,
        cooldown: 0.8,
        stand: base({ kind: 'drone', damage: 90, speed: 24, homing: 3.2, homingTime: 3, radius: 0.8, life: 4.5, impact: 50, color: 0xb894ff, sfx: 'drone_deploy' }),
        dash: { count: 2, spread: 0.6 },
      },
      C: {
        name: 'Needle volley',
        cost: 60,
        regen: 16,
        cooldown: 0.8,
        stand: base({ kind: 'bolt', damage: 45, speed: 95, count: 4, interval: 0.07, homing: 1.2, color: 0xe2cfff, sfx: 'vulcan' }),
        air: { count: 5, homing: 1.8 },
      },
    },
    melee: { name: 'Talon kick', damage: 150, range: 6, lunge: 32, impact: 110 },
  },
  {
    id: 'u12',
    name: 'Grim Fencer',
    role: 'Duelist',
    blurb: 'Wants to be close. A saber wave to herd you, a chain claw that stops you cold, and four blade drones.',
    hp: 950,
    walk: 10.5,
    dash: 33,
    dashTime: 0.7,
    airDash: 29,
    jump: 15,
    weight: 0.95,
    accent: 0xff4a4a,
    weapons: {
      R: {
        name: 'Red saber wave',
        cost: 30,
        regen: 28,
        cooldown: 0.45,
        stand: base({ kind: 'wave', damage: 85, speed: 55, radius: 1.2, impact: 45, life: 1.3, homing: 0.8, color: 0xff3b3b, sfx: 'sword_swing' }),
        dash: { count: 2, spread: 0.3 },
      },
      L: {
        name: 'Chain claw',
        cost: 40,
        regen: 20,
        cooldown: 0.7,
        stand: base({ kind: 'claw', damage: 70, speed: 70, radius: 0.9, impact: 100, life: 0.45, color: 0xffb04a, sfx: 'grenade_launch' }),
      },
      C: {
        name: 'Blade drones',
        cost: 80,
        regen: 14,
        cooldown: 1,
        stand: base({ kind: 'drone', damage: 55, speed: 30, count: 4, spread: 0.5, homing: 3.6, homingTime: 2.2, radius: 0.7, life: 3.5, impact: 35, color: 0xff5a5a, sfx: 'drone_deploy' }),
      },
    },
    melee: { name: 'Red saber', damage: 230, range: 8, lunge: 34, impact: 130 },
  },
  {
    id: 'u14',
    name: 'Ember Gunner',
    role: 'Gunner',
    blurb: 'A walking battery. A spread rifle that fills the air, and two shoulder cannons that knock anything flat.',
    hp: 1050,
    walk: 9.5,
    dash: 28,
    dashTime: 0.8,
    airDash: 24,
    jump: 14,
    weight: 1.15,
    accent: 0xff8a3d,
    weapons: {
      R: {
        name: 'Spread rifle',
        cost: 26,
        regen: 32,
        cooldown: 0.4,
        stand: base({ kind: 'rapid', damage: 26, speed: 85, count: 5, spread: 0.08, radius: 0.45, impact: 14, life: 1.6, color: 0xffb36b, sfx: 'vulcan' }),
        dash: { count: 7, spread: 0.11 },
      },
      L: {
        name: 'Shoulder cannons',
        cost: 45,
        regen: 20,
        cooldown: 0.75,
        stand: base({ kind: 'heavy', damage: 120, speed: 60, count: 2, spread: 0.06, radius: 1.0, impact: 80, life: 2.2, homing: 0.4, color: 0xff7a2a, sfx: 'heavy_beam' }),
        air: { homing: 0.7 },
      },
      C: {
        name: 'Overheat salvo',
        cost: 100,
        regen: 13,
        cooldown: 1.4,
        stand: base({ kind: 'heavy', damage: 75, speed: 55, count: 6, interval: 0.12, spread: 0.12, radius: 1.1, impact: 50, life: 2.4, homing: 0.6, color: 0xff6a1a, sfx: 'heavy_beam' }),
      },
    },
    melee: { name: 'Cannon bash', damage: 150, range: 5.5, lunge: 24, impact: 120 },
  },
  {
    id: 'u15',
    name: 'Dune Bombard',
    role: 'Bombard',
    blurb: 'Slow and enormous. Howitzer shells that drop behind cover, and a missile box that never stops chasing.',
    hp: 1200,
    walk: 8.5,
    dash: 25,
    dashTime: 0.85,
    airDash: 21,
    jump: 13,
    weight: 1.4,
    accent: 0xe8c66a,
    weapons: {
      L: {
        name: 'Twin howitzers',
        cost: 35,
        regen: 24,
        cooldown: 0.6,
        stand: base({ kind: 'shell', damage: 95, speed: 34, count: 2, interval: 0.15, radius: 0.7, blast: 4.2, impact: 70, life: 5, arc: 0.6, color: 0xffd27a, sfx: 'grenade_launch' }),
      },
      R: {
        name: 'Missile box',
        cost: 50,
        regen: 20,
        cooldown: 0.9,
        stand: base({ kind: 'missile', damage: 45, speed: 30, count: 6, interval: 0.07, spread: 0.5, homing: 2.6, homingTime: 2.2, radius: 0.6, blast: 2.5, impact: 30, life: 4, color: 0xfff0c0, sfx: 'missile_launch' }),
        dash: { count: 4 },
      },
      C: {
        name: 'Carpet barrage',
        cost: 100,
        regen: 12,
        cooldown: 1.5,
        stand: base({ kind: 'shell', damage: 70, speed: 38, count: 10, interval: 0.09, spread: 0.35, radius: 0.7, blast: 4.5, impact: 60, life: 5, arc: 0.8, color: 0xffc04a, sfx: 'grenade_launch' }),
      },
    },
    melee: { name: 'Tread ram', damage: 170, range: 5, lunge: 20, impact: 140 },
  },
  {
    id: 'u02',
    name: 'Comet Raider',
    role: 'Skirmisher',
    blurb: 'The fastest machine. Homing darts to keep you busy, a spinning glaive throw, and a comet rush across the deck.',
    hp: 900,
    walk: 12,
    dash: 36,
    dashTime: 0.65,
    airDash: 32,
    jump: 17,
    weight: 0.85,
    accent: 0x7affd0,
    weapons: {
      L: {
        name: 'Dart pod',
        cost: 28,
        regen: 30,
        cooldown: 0.45,
        stand: base({ kind: 'missile', damage: 32, speed: 46, count: 3, interval: 0.06, spread: 0.3, homing: 3, homingTime: 1.2, radius: 0.45, blast: 1.6, impact: 18, life: 2.5, color: 0x9affe0, sfx: 'missile_launch' }),
      },
      R: {
        name: 'Glaive throw',
        cost: 36,
        regen: 24,
        cooldown: 0.55,
        stand: base({ kind: 'wave', damage: 95, speed: 50, radius: 1.3, impact: 55, life: 1.5, homing: 1.1, color: 0xb5fff0, sfx: 'sword_swing' }),
        dash: { count: 2, spread: 0.18 },
      },
      C: {
        name: 'Comet bolts',
        cost: 70,
        regen: 16,
        cooldown: 0.9,
        stand: base({ kind: 'bolt', damage: 60, speed: 90, count: 3, spread: 0.12, homing: 1.4, color: 0x7affd0, sfx: 'beam_shot' }),
        dash: { count: 5, spread: 0.18 },
      },
    },
    melee: { name: 'Beam glaive', damage: 200, range: 8, lunge: 38, impact: 120 },
  },
]

export const mechById = (id: string): MechDef => ROSTER.find((m) => m.id === id) ?? ROSTER[0]

/** The parameters of one pull, resolved for the stance it is fired from. */
export function shotFor(w: WeaponDef, stance: Stance): ShotParams {
  const over = stance === 'dash' ? w.dash : stance === 'air' ? w.air : undefined
  return over ? { ...w.stand, ...over } : w.stand
}
