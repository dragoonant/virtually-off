// Settings and arcade progress, kept in this browser. A round of a fighting game is too short to save mid-round, so
// the arcade run is saved between matches: Continue reopens the ladder at the next opponent (KB rule 22, adapted).
// Keys carry a per-game prefix because every Pages game shares one origin.
import type { ControlMode } from './input'

const SETTINGS_KEY = 'voff-settings'
const RUN_KEY = 'voff-run'

export interface Settings {
  controls: ControlMode
  difficulty: number
  master: number
  music: number
  sfx: number
  voice: number
  bloom: boolean
  shake: boolean
}

export interface ArcadeRun {
  v: 1
  mech: string
  stage: number // index into the ladder of the next fight
  difficulty: number
  ladder: { mech: string; arena: number }[]
  wins: number
  savedAt: number
}

export const defaultSettings = (): Settings => ({ controls: 'modern', difficulty: 1, master: 0.8, music: 0.55, sfx: 0.8, voice: 0.9, bloom: true, shake: true })

export let storageOk = true

function read<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : null
  } catch {
    storageOk = false
    return null
  }
}

function write(key: string, v: unknown): void {
  try {
    if (v === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(v))
  } catch {
    storageOk = false
  }
}

export function loadSettings(): Settings {
  return { ...defaultSettings(), ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) }
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s)
}

export type RunRead = { ok: true; run: ArcadeRun } | { ok: false; reason: string } | null

export function loadRun(validMech: (id: string) => boolean): RunRead {
  let raw: unknown
  try {
    const s = localStorage.getItem(RUN_KEY)
    if (!s) return null
    raw = JSON.parse(s)
  } catch {
    return { ok: false, reason: 'The saved run could not be read.' }
  }
  const r = raw as Partial<ArcadeRun>
  if (!r || r.v !== 1 || !Array.isArray(r.ladder) || typeof r.stage !== 'number') return { ok: false, reason: 'The saved run is from an older version.' }
  if (!validMech(r.mech ?? '') || r.ladder.some((x) => !validMech(x.mech))) return { ok: false, reason: 'The saved run uses a machine that is no longer in the game.' }
  return { ok: true, run: r as ArcadeRun }
}

export function saveRun(r: ArcadeRun | null): void {
  write(RUN_KEY, r ? { ...r, savedAt: Date.now() } : null)
}
