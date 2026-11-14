# Decisions log

Choices made where the spec was silent. Newest at the bottom. Format: date — decision — why.

- 2026-11-14 — Prologue freezes time at golden hour; the UTC clock starts after the rocket — keeps the opening consistent and matches the approved style test.
- 2026-11-14 — Beds heal and set respawn but don't skip night — the day is tied to the global UTC clock.
- 2026-11-14 — Player-facing time-of-day lock (Live / Golden hour / Night) — accessibility, plus it guarantees the itch.io demo looks right at any hour.
- 2026-11-14 — Spirit creatures replace the GDD's per-god Divine Beasts for this build.
- 2026-11-14 — Roadmap builds prologue + rocket before the open world — it's the strongest demo moment and needs only the meadow.
- 2026-11-14 — No web fonts: titles use Cinzel only if installed, otherwise a classical serif stack (Trajan Pro / Palatino / Georgia) — the style test loads Cinzel from Google Fonts, which the no-CDN rule forbids; bundling a font file needs the team's OK.
- 2026-11-14 — Rapier is loaded during the loading screen (dynamic import, own ~1.6 MB gzipped chunk) even before M3 uses it — proves the inlined WASM works on itch.io early, and the start screen waits for it.
- 2026-11-14 — The M0 backdrop is the old Three.js demo (crystal + ring) recoloured to the spec palette, in `src/view/placeholder-scene.ts` — M2 replaces it with the meadow.
- 2026-11-14 — Pointer-lock refusal is handled silently in M0; drag-to-orbit fallback and the "click to resume" overlay come with the camera in M3.
- 2026-11-14 — Pinned dependency versions at least two weeks old: Rapier compat 0.21.0, Vitest 4.1.12, Playwright 1.64.1.
- 2026-11-14 — `npm run test:ship` serves `dist/` on port 4174 (not 4173) so it never reuses a stale `npm run preview` server.
- 2026-11-14 — Golden hour = day fraction 0.70 (16:48 game time), "Always night" = 0.92 (22:05); phases: night < 0.2 ≤ dawn < 0.3 ≤ day < 0.65 ≤ golden < 0.74 ≤ dusk < 0.8 ≤ night — the spec fixes only 0.25 dawn / 0.5 noon / 0.75 dusk. M2 can retune these when it fits the sky keyframes.
- 2026-11-14 — Time precedence: dev/test override > prologue freeze > player lock > live UTC — tests and the dev scrub slider must be able to show night even during the prologue.
- 2026-11-14 — Entity IDs are `e<n>` from a per-world counter that is saved and never reused — stable across save/load and simple to send over a network later.
- 2026-11-14 — RNG: mulberry32 per named stream, seeded from hash(seed, stream); stream positions live in `world.rngStreams` so draws continue identically after a load.
- 2026-11-14 — The sim keeps ticking on the title screen (nothing happens yet, but the world clock stays current). Catch-up is capped at 5 ticks per frame, so below ~6 fps the sim runs slower than real time instead of freezing.
- 2026-11-14 — Autosave every 10 s while playing and whenever the page is hidden or closed. A corrupt or unreadable save is ignored with a console warning and a new game starts. "Continue" / "New game" appear on the title screen when a save exists.
- 2026-11-14 — The only intents so far are `dev:spawn` / `dev:despawn` (dev menu); gameplay intents arrive with M3. While `state.cutscene` is set, intents are rejected with an `intent:rejected` event.
- 2026-11-14 — The time-of-day lock lives on the session (in memory) until M2 adds the settings store; the dev menu can change it.
