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
- 2026-11-14 — Team approved bundling the Cinzel font (OFL) via `@fontsource/cinzel`; scheduled for M3.
- 2026-11-14 — Added the fog-of-war minimap + full map (SPEC §4.1), built in M6 with world generation; hidden until after the rocket.
- 2026-11-14 — Day-cycle keyframes (day fraction): night 0.85→0.18, dawn 0.25, noon 0.50, golden 0.70, dusk 0.77. Golden/dusk/night are the style test's exact values; dawn (pink-gold, sun in the east) and noon (high sun, palette haze #C9DCEB) are new and need team sign-off via their baselines.
- 2026-11-14 — The meadow layout uses the style test's RNG (mulberry32, state 1337) with the same draw order, so every rock, tree, grass blade and particle lands where it did in the approved reference. It's hand-tuned, so it does not change with the world seed. Zeus's 60 spear sparks are skipped but their draws are consumed to keep that order.
- 2026-11-14 — Terrain height (`meadowHeightAt`) and noise live in `src/sim/terrain/` because physics (M3) needs the same ground the view draws.
- 2026-11-14 — Left out of M2: placeholder Zeus and spear sparks (M3, `content/gods/zeus`), and the night spirit stag (it's spirit content; it'll go through the registry with `approved: false`).
- 2026-11-14 — Quality presets: Low (pixel ratio ≤1, 1024 shadows, 40% foliage, 32 god-ray samples), Medium (≤1.5, 2048, 75%, 48), High (≤2, 2048, 100%, 64). Auto starts at Medium and, once per session, picks Low below 40 fps / High at 58+ fps from a ~1.5 s probe. Effects are only switched off by the player's toggles, never by a preset.
- 2026-11-14 — With `#test` in the URL, Auto quality is fixed at Medium (no probe) so screenshots are deterministic.
- 2026-11-14 — Reduce motion defaults to the OS "prefers reduced motion" setting; it cuts wind sway and particle drift/twinkle to ~35% and slows falling petals.
- 2026-11-14 — Pause behaviour: Esc, losing pointer lock, or the window losing focus opens the settings menu; clicking Resume or the game recaptures the mouse. This is also the itch.io "click to resume" overlay. "New game" in settings asks for a second click.
- 2026-11-14 — `PCFSoftShadowMap` was removed in three 0.187 (it logs a warning), so shadows use `PCFShadowMap`.
- 2026-11-14 — While the test clock is frozen, the view only re-renders when something changes (time, camera, settings, resize); software WebGL is too slow to redraw every frame for screenshots.
