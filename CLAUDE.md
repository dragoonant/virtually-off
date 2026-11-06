# Virtually Off — agent orientation

An original 1v1 3D arena mech fighter (browser, three.js, TypeScript, Vite), played on an Xbox controller. Owner credit:
**evilgouki**. Never write the owner's real name, email or home path into this repo, a commit, or anything published.

- **Read first:** `PLAN.md` (decisions and what is next), `STATUS.md` (what exists now), `NOTICE.md` (the IP posture).
  The shared knowledge base is the private repo `dragoonant/tabletop-kb` (owner rules in `rules.md`).
- **IP:** no name, machine design, stage, music or interface art from any published game. Names live in `src/roster.ts`
  and `src/arena.ts`.
- **Image prompts:** the owner's banned-word list (tabletop-kb `rules.md` rule 23) applies to every prompt and brief.
- **Code map:** `src/battle.ts` (match flow, fixed 60 Hz step, hit-stop, slow motion), `src/mech.ts` (movement, weapons,
  melee, hits, model and thrusters), `src/projectiles.ts`, `src/ai.ts`, `src/camera.ts`, `src/fx.ts` (pooled effects),
  `src/arena.ts` (three arenas, box collision), `src/hud.ts`, `src/main.ts` (renderer, bloom, screens), `src/input.ts`
  (gamepad and keyboard to an Intent), `src/audio.ts`, `src/save.ts`.
- **Assets:** `public/assets/models/u*.glb` are rigged machines copied from Assembly Forge (clips idle, walk, jump, fly,
  melee, shoot, hit, destroyed; 1 unit tall, facing +z). Generated skies, textures, props and audio come from
  `tools/gen/` (the local studios; see tabletop-kb `local-ai-studios.md`).
- **Test hooks:** `window.__voff.advance(sec)` runs the match deterministically (the Browser pane throttles rendering
  when hidden), `__voff.autopilot(level)` makes it CPU vs CPU, `__voff.key(code, down)` holds a key.
- **Git:** `main` deploys to GitHub Pages on push. Gate it with `npm run typecheck && npm run build && npm run e2e`.
