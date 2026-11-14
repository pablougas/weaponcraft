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
