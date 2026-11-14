# Weaponcraft build roadmap (for Claude Code)

**Deadline: itch.io demo, Sunday Nov 15, 2026.** Paste each milestone's prompt into Claude Code, one at a time. Each milestone ends **playable and packaged** (`npm run package`), so whatever exists at the deadline is demoable.

The order front-loads the most demo-friendly moment: the calm prologue and the rocket only need the meadow, Zeus and fusion. The open world and Cerberus come after.

| When | Milestones | Ship checkpoint |
|---|---|---|
| Sat morning–afternoon | M0 → M4 | Upload #1 to itch.io (looks right, Zeus plays) |
| Sat evening | M5 | **Upload #2: prologue + rocket. This is the minimum demo.** |
| Sun morning | M6 → M7 | Upload #3: open world, soldiers, Cerberus |
| Sun before demo | M8 | Final upload + run the demo checklist |
| If time remains | M9 | Hades, more biomes |

**Every milestone ends with:** `npm test` → `npm run test:e2e` (add Playwright tests for what the milestone built, and show the team any new or changed screenshots to approve) → `npm run package`. Every upload is preceded by `npm run test:ship`.

**Cut line:** if Sunday morning arrives and M7 isn't close, stop. Polish the prologue and rocket, add one biome with soldiers, and demo that.

---

### M0 · Repo prep + itch.io skeleton
> Read `CLAUDE.md`, `docs/SPEC.md` and this roadmap. Make the 3D game the default page in `src/main.ts` and `index.html` (full-window canvas, loading screen, click-to-start title screen "WEAPONCRAFT"). Move the Phaser demo behind `?demo=2d`. Add `@dimforge/rapier3d-compat` and Vitest, and make `npm test` run the existing node tests plus Vitest. Create the folder structure from SPEC §12 with empty registries. Update README "Play the demos" for the new default. **Set up Playwright** per CLAUDE.md: install `@playwright/test` and Chromium (also add `npx playwright install --with-deps chromium` to the devcontainer setup), a `playwright.config.ts` with a SwiftShader Chromium project at 1280×720, the scripts `test:e2e`, `test:visual:update` and `test:ship`, and the `window.wc` test-API stub with `ready()`. Write the smoke suite: no console errors, no off-origin requests, non-blank canvas, click-to-start. Make it pass against both `npm run dev` and the built `dist/`. Run `npm test`, `npm run build`, `npm run test:ship` and `npm run package`, then commit.

### M1 · Sim core (multiplayer-ready skeleton)
> Implement SPEC §13: `WorldState`, a fixed 30 Hz tick with render interpolation, an intent queue, a `spawn()` entity registry with stable IDs, a plain-data event bus, seeded `rng(seed, stream)`, `serialize`/`deserialize` with a namespaced localStorage save and a "New game" reset, a `Transport` interface with `LoopbackTransport`, and `isAuthority`. Add `sim/time.ts` `getWorldTime(nowMs, settings)` (UTC, 4 real hours = 1 day) with the prologue override and the time-of-day lock (Live / Always golden hour / Always night). Add Vitest tests for RNG determinism, the serializer round-trip and world time. Add the dev menu (backtick; production only with `#dev`) showing tick rate, world time and entity count.

### M2 · The look (port the style test)
> Port `docs/reference/style-test.html` into `src/view/`: toon material with rim light, inverted-hull outlines, the shader sky with clouds/stars, fog/haze, the post stack (god rays, bloom, OutputPass, grade), instanced wind grass, flowers, glowing flora and the particle systems. Drive sun, sky and fog from `getWorldTime()` across a full 24 h cycle, extending the golden hour / dusk / night keyframes to dawn and noon. Add a settings store and an Esc settings menu with toggles for every effect, reduce motion, quality presets (auto default) and the time-of-day lock. Show it all on the meadow scene with Olympus intact on the horizon. Implement `wc.freeze`, `setTime`, `snapCam` and `setSeed`. **Visual baselines:** vista at golden hour, dusk and night; the wide shot; one shot with every effect off; and the settings menu. They should match `docs/reference/style-test.html`, so show them to the team for approval. Package and run `npm run test:ship`.

### M3 · Zeus
> Build Zeus from primitives in `content/gods/zeus/` (match the style-test model, with the canvas-face expression system). Rapier kinematic character controller: WASD, pointer-lock orbit camera with drag-to-orbit fallback, sprint/stamina, jump + short hover, dodge roll with i-frames, lock-on. Everything goes through intents and the rebindable input map. Light/heavy attack with a starter spear. Q = Chain Lightning (ability module with `cast`/`update`). Add health/stamina HUD, practice dummies and wildlife (e.g. sheep) to hit in the meadow. **Playwright:** close-up baselines of Zeus with each of the 4 expressions and the HUD; a flow test where W moves the player (position changes in `getState()`), Space leaves the ground, and Q damages a dummy.

### M4 · Weapons, elements, fusion (minimal but real)
> Implement SPEC §7–8: the element wheel and status effects in one damage pipeline; weapon defs built from parts × material × element; inventory (I); a Fusion Altar in the meadow (F to use) with a discovery table (sorted-pair keys + fallback rule); a Fusion Codex screen (C); and SVG icons generated per weapon. Weapon element boosts the matching ability. Add Vitest tests for the wheel and the fusion table. Seed about 8 base weapons and 6 named legendaries; place 2–3 weapons in the meadow to find. **Playwright:** a weapon contact sheet via `?preview=weapons`; baselines of the inventory, Fusion Altar and Codex screens; a flow test that fusing a known pair creates the named legendary and a codex entry. **Package and upload to itch.io (checkpoint #1).**

### M5 · Prologue + Rocket cinematic → minimum demo
> Implement SPEC §3.1–3.3: the frozen-golden-hour meadow prologue with tutorial prompts (move/look, sprint, jump, attack, ability, pick up a weapon, fuse). When all steps are done, play the 15–20 s rocket timeline with input locked and the HUD hidden: rocket streak, impact, summit collapse into floating debris, dust wall, pan to human columns climbing from each biome. Set `flags.olympusShattered`, unfreeze the world clock and turn the meadow into the Refuge (Forge, Fusion Altar, bed) with the objective "Find the others. Survive." Unskippable first time, skippable after. No strobing; respect reduce motion. Captions for all text and audio cues, plus a cinematic sting via Web Audio. **Playwright:** a flow test that completes the tutorial steps through `wc.completeTutorialStep` → the cinematic starts → keyboard input is ignored → control returns → `flags.olympusShattered` is true; screenshots frozen at 3 points of the cinematic (rocket, impact, pan) and of the shattered summit; and a test that the reduce-motion setting removes camera shake (camera transform stable across frames). **Package and upload (checkpoint #2, minimum demo).**

### M6 · World generation
> Implement seeded chunked terrain (SPEC §4) streamed around the player with simple LOD: Olympus at the center (shattered-summit variant), six biome wedges from `content/biomes/`, the sea ring, and the Refuge meadow kept as the hand-tuned spawn area. Fully define Underworld Caverns (needed for Cerberus) and Marble Highlands; register the other four with placeholder params. Add biome props, resource nodes, gathering and the Forge crafting UI. The starting area must be ready in under 3 s. Dev menu: teleport to biome.

### M7 · Humans + Cerberus Mk. II (demo climax)
> Implement soldiers (spear, archer, shield) with patrol → suspicious → alert → attack → search AI, plus 2 camps with loot chests in each defined biome. Then Cerberus Mk. II in the Underworld (SPEC §10): patrol route, visible sensor cone, detection, rear plating durability, hatch prompt and crawl, a 2–3 room interior with power cores and shaking, the pilot duel "The Warden", powering down, loot, and the spirit-freed cutscene. Freeing the spirit unlocks Three-Fold Howl on E (`content/spirits/cerberus.ts`). **Playwright:** baselines of a soldier camp, Cerberus outside, the sensor cone, the interior and the spirit-freed moment; a flow test via the test API from the hatch prompt → interior → pilot defeated → spirit ability unlocked. **Package and upload (checkpoint #3).**

### M8 · Demo hardening (do this before the demo, even if M7 is unfinished)
> Run the itch.io demo checklist below and fix anything that fails. Add synthesized SFX for attacks, hits, fusion and footsteps, plus ambient music for the meadow and Underworld. Add beds (respawn + heal; the global clock is not skipped) and save/load of everything in SPEC §11. Remove or hide anything half-finished. Final package and upload.

### M9 · If time remains
> Hades (Shadow Step, Skull Cage with fair warning), snap-to-grid base building at the Refuge, the next mechs and spirits (Bronze Bull → Cretan Bull, Stag Walker → Golden Hind), the remaining biomes, and the small dungeon. Each one is content files plus registry lines only.

---

## itch.io demo checklist
- [ ] `npm test`, `npm run test:e2e`, `npm run test:ship` and `npm run package` all pass; `artifacts/game.zip` has `index.html` at its root.
- [ ] All screenshot baselines are approved and current (no pending diffs).
- [ ] Uploaded as HTML, *playable in browser*, 1280×720, fullscreen button on.
- [ ] Open the **published** itch.io page in a fresh incognito window: no console errors and no failed network requests.
- [ ] Click-to-start works; audio plays after the click; mouse look works (pointer lock or drag fallback); Esc opens settings.
- [ ] Fullscreen works and the canvas resizes correctly.
- [ ] "New game" replays the prologue; the rocket triggers; control returns afterward.
- [ ] Time-of-day lock set to *Always golden hour* for the live demo (unless you want night).
- [ ] Holds ~60 fps at Medium on the demo laptop; Low preset available as a backup.
- [ ] Test in Chrome **and** one other browser (Safari or Firefox).
- [ ] Dev menu hidden (only with `#dev`).
- [ ] Have a backup: `npm run preview` running locally on the demo laptop in case the venue Wi-Fi fails.
