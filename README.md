# Virtually Off

An original one-on-one 3D arena mech fighter for the browser, made to be played with a controller. Two machines, one
floating proving-ground arena, best of three rounds. You dash, jump, air-dash and cancel your way around incoming fire,
and you fight back with three weapons and a homing melee lunge.

**Unofficial, non-commercial fan project by evilgouki.** It is a spiritual successor to the twin-stick arena mech fighters
of the late 1990s. Every machine, name, arena, piece of music and line of dialogue here is original to this project or
generated for it. The machines come from the same author's Assembly Forge.

Play it: https://dragoonant.github.io/virtually-off/ · Sounds: https://dragoonant.github.io/virtually-off/sounds.html

## Controls (Xbox controller, Modern scheme)
| Input | Action |
| --- | --- |
| Left stick | Move. Strafing circles the target |
| Right stick | Look around (springs back) |
| RB / LB | Dash in the stick direction |
| A | Jump; hold it to rise higher |
| RB in the air | Air dash (one per jump) |
| A during a dash | Dash cancel into a jump |
| B | Guard. It also stops a dash dead |
| RT / LT | Right / left weapon |
| LT + RT (or Y) | Centre weapon |
| Fire at close range | Melee |
| X | Snap to face the target |
| Menu | Pause |

Settings also has a **twin-lever** scheme where each stick acts as one arcade lever: both forward walks, apart jumps,
together guards, and the bumpers are the turbo (dash) buttons.

On a keyboard: WASD move, Shift dash, Space jump, E guard, J/K left/right weapon, L centre weapon, Q snap, Esc pause.

On a phone or tablet (held sideways) the game shows on-screen controls: touch anywhere on the left half and drag to
move, and use the right-hand cluster for R, L and C (each button fills with its gauge), DASH, JUMP, GUARD and TURN.
Slide a thumb from DASH onto a weapon for a dash attack. II pauses. Menus are tapped, with a BACK button top right.

## Develop
```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
npm run e2e        # Playwright smoke test
```
Test URLs: `?auto=training&mech=u07`, `?auto=match&mech=u11&foe=u14&arena=0&d=1`, `?auto=select`.

Saves (settings and the arcade run) live in this browser's local storage under `voff-*` keys. `localhost` and the
Pages site keep separate saves.
