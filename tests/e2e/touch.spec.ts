import { expect, test, type Page } from '@playwright/test'

// A phone held sideways: taps drive the menus and the on-screen controls drive the machine.
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

type Voff = { battle: { phase: string; paused: boolean; human: { state: string; pos: { x: number; z: number }; stats: { shots: number } } } | null; advance(s: number): void }

async function touch(page: Page, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number, id: number): Promise<void> {
  await page.evaluate(([type, x, y, id]) => {
    document.querySelector('.tpad')!.dispatchEvent(new PointerEvent(type as string, { pointerType: 'touch', pointerId: id as number, clientX: x as number, clientY: y as number, bubbles: true, cancelable: true }))
  }, [type, x, y, id] as const)
}
async function centre(page: Page, sel: string): Promise<[number, number]> {
  const b = (await page.locator(sel).boundingBox())!
  return [b.x + b.width / 2, b.y + b.height / 2]
}

test('touch: tap through the menus, play with the on-screen controls, pause and resume', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./')
  await expect(page.locator('.title .press')).toBeVisible({ timeout: 60_000 })
  await page.touchscreen.tap(400, 200)
  await expect(page.locator('.screen.menu .item').first()).toBeVisible()
  await expect(page.locator('.tback')).toBeVisible()
  await page.screenshot({ path: 'e2e-out/touch-menu.png' })
  // settings: the arrows step a value both ways
  await page.locator('.screen.menu .item', { hasText: 'SETTINGS' }).tap()
  const music = page.locator('.settings .item', { hasText: 'MUSIC' }).locator('.val')
  const before = await music.textContent()
  await music.locator('[data-d="-1"]').tap()
  await expect(music).not.toHaveText(before!)
  const lower = await music.textContent()
  await music.locator('[data-d="1"]').tap()
  await expect(music).not.toHaveText(lower!)
  await page.screenshot({ path: 'e2e-out/touch-settings.png' })
  await page.locator('.settings .item', { hasText: 'DONE' }).tap()
  await page.locator('.screen.menu .item', { hasText: 'CONTROLS' }).tap()
  await expect(page.locator('.controls h4').first()).toHaveText('TOUCH')
  await page.screenshot({ path: 'e2e-out/touch-controls.png' })
  await page.locator('.controls').tap()
  await page.locator('.screen.menu .item', { hasText: 'ARCADE' }).tap()
  await expect(page.locator('.heading')).toContainText('OPPONENT SKILL')
  await page.locator('.screen.menu .item').first().tap()
  await expect(page.locator('.select .tile')).toHaveCount(6)
  await page.screenshot({ path: 'e2e-out/touch-select.png' })
  // first tap picks the machine, the second launches it
  const tile = page.locator('.select .tile').nth(2)
  await tile.tap()
  await expect(tile).toHaveClass(/sel/)
  await expect(page.locator('.select')).toBeVisible()
  await tile.tap()
  await expect(page.locator('.versus')).toBeVisible()
  await page.locator('.versus').tap()
  await expect(page.locator('.hud')).toBeAttached({ timeout: 10_000 })
  await expect.poll(() => page.evaluate(() => (window as unknown as { __voff: Voff }).__voff.battle?.phase), { timeout: 15_000 }).toBe('fight')
  await expect(page.locator('.tpad')).toBeVisible()
  await expect(page.locator('.hud-weapons')).toBeHidden()

  // stick: hold right, then dash and slide onto the right weapon
  // sample the machine's state every frame, so a slow runner cannot miss the short dash
  const x0 = await page.evaluate(() => {
    const w = window as unknown as { __voff: Voff; __seen: Set<string> }
    w.__seen = new Set()
    const tick = () => { if (w.__voff.battle) w.__seen.add(w.__voff.battle.human.state); requestAnimationFrame(tick) }
    tick()
    return w.__voff.battle!.human.pos.x
  })
  await touch(page, 'pointerdown', 150, 260, 1)
  await touch(page, 'pointermove', 215, 260, 1)
  const [dx, dy] = await centre(page, '.t-dash')
  await touch(page, 'pointerdown', dx, dy, 2)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __seen: Set<string> }).__seen.has('dash')), { timeout: 3000 }).toBe(true)
  const [rx, ry] = await centre(page, '.t-R')
  await touch(page, 'pointermove', rx, ry, 2)
  await page.waitForTimeout(250)
  await touch(page, 'pointerup', rx, ry, 2)
  await touch(page, 'pointerup', 215, 260, 1)
  // a plain tap on the right weapon
  await page.waitForTimeout(700)
  await touch(page, 'pointerdown', rx, ry, 4)
  await page.waitForTimeout(200)
  await touch(page, 'pointerup', rx, ry, 4)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __voff: Voff }).__voff.battle!.human.stats.shots), { timeout: 3000 }).toBeGreaterThan(0)
  const x1 = await page.evaluate(() => (window as unknown as { __voff: Voff }).__voff.battle!.human.pos.x)
  expect(x1).not.toBeCloseTo(x0, 1)
  await page.screenshot({ path: 'e2e-out/touch-match.png' })

  // pause button, then RESUME
  const [px, py] = await centre(page, '.t-pause')
  await touch(page, 'pointerdown', px, py, 3)
  await expect(page.locator('.screen.pause')).toBeVisible()
  await touch(page, 'pointerup', px, py, 3)
  await expect(page.locator('.tpad')).toBeHidden()
  await page.screenshot({ path: 'e2e-out/touch-pause.png' })
  await page.locator('.screen.pause .item', { hasText: 'RESUME' }).tap()
  await expect(page.locator('.tpad')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __voff: Voff }).__voff.battle!.paused)).toBe(false)
  expect(errors).toEqual([])
})
