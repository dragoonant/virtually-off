# Virtually Off — plan

An original one-on-one 3D arena mech fighter in the browser, played on an Xbox Series X controller. It is a spiritual
successor to the late-1990s twin-stick arena mech fighters. Kickoff 2026-11-05; the owner wanted a playable prototype
by the morning of 2026-11-06.

## Decisions (owner, 2026-11-05)
| Id | Decision |
| --- | --- |
| D1 | Controls: a **modern** single-pad layout by default, plus a **twin-lever** emulation toggle in Settings (each stick is one lever). |
| D2 | Roster: **6 tuned machines** reused from Assembly Forge (u07 Halo Sovereign, u11 Night Shrike, u12 Grim Fencer, u14 Ember Gunner, u15 Dune Bombard, u02 Comet Raider). |
| D3 | Modes: a **vs-CPU arcade ladder** (six stages, the last a mirror match) plus a **training range**. No local two-player yet. |
| D4 | Hosting: public repo `dragoonant/virtually-off`, GitHub Pages. |
| D5 | Title: keep **Virtually Off** (the owner chose it knowing it is a pun). Nothing else references the source game. |
| D6 | Presentation concept: **orbital proving ground**. Floating test decks above planets, range-control telemetry HUD in amber and cyan, electronic-orchestral music. It must not look like Assembly Forge (hex board, warm workshop) or Three Kingdoms Tactics (sand table). |
| D7 | Overnight GPU approved: Flux arena art, Hunyuan cover props, Audio Studio music and SFX, and a Qwen voice-design announcer. |
| D8 | **3 arenas**: Sunward Deck (open, low cover), Ring Spire (a pillar ring, round), Ember Foundry (raised decks). |
| D10 | Mobile (owner, 2026-11-06): **on-screen touch controls** for phones and tablets, landscape. A floating left stick and a right-hand button cluster (`src/touch.ts`) feed the same Intent as the pad. |
| D9 | Saves: settings and the arcade run (between matches). Nothing is saved mid-round. This is KB rule 22 adapted for a fighter; Continue names the machine, stage, difficulty and time. |

## How it plays
- Fixed 60 Hz simulation (`src/battle.ts`) with hit-stop on big hits and 0.25x slow motion on a knockout.
- Movement: walk (strafing circles the target), dash (the stick bends it; firing during it gives a dash attack), jump
  (hold to rise), one air dash per jump, a dash cancel into a jump (A) or a dead stop (B), and guard (B) against the
  front.
- Weapons: L, R and C (an LT+RT chord within 83 ms, or Y). Each has its own gauge, cooldown and stance variants (stand,
  dash, air). Shots home, but at 30% strength against a dashing machine, so dashing across fire is the dodge.
- Melee: firing inside the machine's melee range lunges and strikes; guard blocks it and staggers the attacker.
- Hits build up impact; 100 knocks the machine down (a back-flip, invulnerable until it is back on its feet).
- CPU (`src/ai.ts`): preferred range per machine, strafing, dodging by threat time-to-impact, gauge use, and melee for
  close-range machines. Four skill levels (Cadet, Pilot, Veteran, Ace); the ladder steps up one level after stage 3.

## Next (not done)
- Local two-player split screen; more machines (the other nine Assembly Forge GLBs are already in `public/assets/models`).
- Hand-tuned balance from the owner's play; a proper hit-confirm combo system; afterimages on dashes.
- Online versus (WebRTC with rollback) only after the feel is right.
