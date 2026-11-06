# Status

## 2026-11-06 (overnight build)
- **Playable** at https://dragoonant.github.io/virtually-off/: title, menu, difficulty, select, versus, the match,
  pause, result, settings and controls screens, all controller-navigable (D-pad or stick, A, B, Menu). Mouse and
  keyboard also work.
- Six machines, three arenas, the arcade ladder with Continue, and the training range (the target strafes, stands
  still or fights back; set it from Pause).
- Art: the machines and portraits come from Assembly Forge. Skies, floor and wall textures were made with Flux klein,
  and the cover props with Hunyuan3D, all on this PC (`tools/gen/`).
- Audio: music, effects and the announcer come from the local Audio Studio (`public/assets/audio/manifest.json`). They
  are **not verified by ear**; listen on `sounds.html`.
- Gates: `npm run typecheck`, `npm run build`, `npm run e2e` (4 Playwright tests at first, now 5 with touch: screens, a CPU vs CPU match to a
  result, keyboard moves in training, the arcade flow with pause, quit and Continue).
- The controller mapping was verified with a simulated standard-mapping pad (RT, LT, LT+RT chord, RB dash, A dash
  cancel, air dash, B guard). **No real Xbox controller has been tried yet.**

## 2026-11-06 (touch controls)
- Phones and tablets get on-screen controls (`src/touch.ts`): a floating stick on the left half, and R, L, C, DASH,
  JUMP, GUARD, TURN and pause on the right. The weapon buttons fill with their gauges and glow red in melee range. A
  thumb can slide from DASH onto a weapon. They appear after the first touch and hide when a pad or key is used.
- Menus work by tap: BACK buttons, tap a machine then tap again to launch, tap the arrows in Settings, tap to skip the
  versus screen. Short landscape screens get a compact layout; portrait shows a "turn your phone" notice. The title
  tap asks for full screen and a landscape lock where the browser allows it (Android Chrome; not iPhone Safari).
- Phones render at a pixel ratio of at most 1.25.
- A fifth e2e test plays through the menus and a match on an emulated 844x390 touch phone. **Not tried on a real
  phone yet.**

## Known rough edges
- Browsers only start audio after a click or key press. A controller press alone may not unlock it, so the title says
  so.
- The camera can sit close behind your machine when the opponent is right on top of you.
- Balance is first-pass: rounds between two Veteran CPUs last about 20 seconds.
