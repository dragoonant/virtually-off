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
- Gates: `npm run typecheck`, `npm run build`, `npm run e2e` (4 Playwright tests: screens, a CPU vs CPU match to a
  result, keyboard moves in training, the arcade flow with pause, quit and Continue).
- The controller mapping was verified with a simulated standard-mapping pad (RT, LT, LT+RT chord, RB dash, A dash
  cancel, air dash, B guard). **No real Xbox controller has been tried yet.**

## Known rough edges
- Browsers only start audio after a click or key press. A controller press alone may not unlock it, so the title says
  so.
- The camera can sit close behind your machine when the opponent is right on top of you.
- Balance is first-pass: rounds between two Veteran CPUs last about 20 seconds.
