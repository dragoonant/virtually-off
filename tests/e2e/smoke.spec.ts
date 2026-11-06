import { expect, test, type Page } from '@playwright/test'

type Voff = { battle: { phase: string; human: { state: string; hp: number; stats: { shots: number } }; cpu: { hp: number } } | null; advance(s: number): void; autopilot(l: number): void; key(c: string, d: boolean): void }
const voff = (page: Page) => page.evaluate(() => !!(window as unknown as { __voff?: Voff }).__voff?.battle)

test('title, menu and select screens render without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./')
  await expect(page.locator('.title .press')).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: 'e2e-out/title.png' })
  await page.keyboard.press('Enter')
  await expect(page.locator('.screen.menu .item').first()).toBeVisible()
  await page.screenshot({ path: 'e2e-out/menu.png' })
  await page.goto('./?auto=select')
  await expect(page.locator('.select .tile')).toHaveCount(6, { timeout: 60_000 })
  await page.screenshot({ path: 'e2e-out/select.png' })
  expect(errors).toEqual([])
  // rule 24: no text selection on a long press
  expect(await page.evaluate(() => getComputedStyle(document.body).userSelect)).toBe('none')
})

test('a CPU vs CPU match plays to a result', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./?auto=match&mech=u07&foe=u12&arena=2&d=2')
  await expect.poll(() => voff(page), { timeout: 60_000 }).toBe(true)
  const r = await page.evaluate(() => {
    const v = (window as unknown as { __voff: Voff }).__voff
    v.autopilot(2)
    let over = null as unknown
    ;(v.battle as unknown as { onOver: (x: unknown) => void }).onOver = (x) => { over = x }
    for (let s = 0; s < 400 && !over; s++) v.advance(1)
    return over as { winner: number; wins: number[] } | null
  })
  expect(r).not.toBeNull()
  expect(Math.max(...r!.wins)).toBe(2)
  expect(errors).toEqual([])
})

test('training: keyboard moves, dashes and fires', async ({ page }) => {
  await page.goto('./?auto=training&mech=u11')
  await expect.poll(() => voff(page), { timeout: 60_000 }).toBe(true)
  const r = await page.evaluate(() => {
    const v = (window as unknown as { __voff: Voff }).__voff
    v.advance(1.5)
    v.key('KeyD', true); v.key('ShiftLeft', true); v.advance(0.1)
    const dash = v.battle!.human.state
    v.key('ShiftLeft', false); v.key('KeyD', false); v.advance(1.5)
    v.key('KeyK', true); v.advance(0.2); v.key('KeyK', false); v.advance(1)
    return { dash, shots: v.battle!.human.stats.shots }
  })
  expect(r.dash).toBe('dash')
  expect(r.shots).toBeGreaterThan(0)
  await page.screenshot({ path: 'e2e-out/training.png' })
})
