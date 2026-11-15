# Weaponcraft build roadmap (for Claude Code)

**Deadline: itch.io demo, Sunday Nov 15, 2026.** Paste each milestone's prompt into Claude Code, one at a time. Each milestone ends **playable and packaged** (`npm run package`), so whatever exists at the deadline is demoable.

The order front-loads the most demo-friendly moment: the calm prologue and the rocket only need the meadow, Zeus and fusion. The open world and Cerberus come after.

| When | Milestones | Ship checkpoint |
|---|---|---|
| Sat morning–afternoon | M0 → M4 | Upload #1 to itch.io (looks right, Zeus plays) |
| Sat evening | M5 | **Upload #2: prologue + rocket. This is the minimum demo.** |
| Sat night | **M5.1** | Upload: Hades's arrival, portal, Outer Grotto, "Find and free Cerberus" |
| Sun morning | **M6** | Upload: playable Hades + switching + companion; the Underworld route with forts and sentries |
| Sun midday | M7 | Upload: Cerberus Mk. II encounter + freeing Cerberus |
| Sun before demo | M8 | Final upload + run the demo checklist |
| After the demo | M9 | The other five biomes, more mechs, base building, dungeon |

**Every milestone ends with:** `npm test` → `npm run test:e2e` (add Playwright tests for what the milestone built, and show the team any new or changed screenshots to approve) → `npm run package`. Every upload is preceded by `npm run test:ship`.

**Cut line:** M6 is built in priority order (Hades playable → switching + companion → the region and route → forts → sentries → caves). If it's Sunday late morning and M6 isn't done, ship what's finished at the last passing step, skip M7, and spend the time on M8. A demo of prologue → rocket → Hades → roaming the Underworld with both gods is a complete story beat.

---

### M0 · Repo prep + itch.io skeleton
> Read `CLAUDE.md`, `docs/SPEC.md` and this roadmap. Make the 3D game the default page in `src/main.ts` and `index.html` (full-window canvas, loading screen, click-to-start title screen "WEAPONCRAFT"). Move the Phaser demo behind `?demo=2d`. Add `@dimforge/rapier3d-compat` and Vitest, and make `npm test` run the existing node tests plus Vitest. Create the folder structure from SPEC §12 with empty registries. Update README "Play the demos" for the new default. **Set up Playwright** per CLAUDE.md: install `@playwright/test` and Chromium (also add `npx playwright install --with-deps chromium` to the devcontainer setup), a `playwright.config.ts` with a SwiftShader Chromium project at 1280×720, the scripts `test:e2e`, `test:visual:update` and `test:ship`, and the `window.wc` test-API stub with `ready()`. Write the smoke suite: no console errors, no off-origin requests, non-blank canvas, click-to-start. Make it pass against both `npm run dev` and the built `dist/`. Run `npm test`, `npm run build`, `npm run test:ship` and `npm run package`, then commit.

### M1 · Sim core (multiplayer-ready skeleton)
> Implement SPEC §13: `WorldState`, a fixed 30 Hz tick with render interpolation, an intent queue, a `spawn()` entity registry with stable IDs, a plain-data event bus, seeded `rng(seed, stream)`, `serialize`/`deserialize` with a namespaced localStorage save and a "New game" reset, a `Transport` interface with `LoopbackTransport`, and `isAuthority`. Add `sim/time.ts` `getWorldTime(nowMs, settings)` (UTC, 4 real hours = 1 day) with the prologue override and the time-of-day lock (Live / Always golden hour / Always night). Add Vitest tests for RNG determinism, the serializer round-trip and world time. Add the dev menu (backtick; production only with `#dev`) showing tick rate, world time and entity count.

### M2 · The look (port the style test)
> Port `docs/reference/style-test.html` into `src/view/`: toon material with rim light, inverted-hull outlines, the shader sky with clouds/stars, fog/haze, the post stack (god rays, bloom, OutputPass, grade), instanced wind grass, flowers, glowing flora and the particle systems. Drive sun, sky and fog from `getWorldTime()` across a full 24 h cycle, extending the golden hour / dusk / night keyframes to dawn and noon. Add a settings store and an Esc settings menu with toggles for every effect, reduce motion, quality presets (auto default) and the time-of-day lock. Show it all on the meadow scene with Olympus intact on the horizon. Implement `wc.freeze`, `setTime`, `snapCam` and `setSeed`. **Visual baselines:** vista at golden hour, dusk and night; the wide shot; one shot with every effect off; and the settings menu. They should match `docs/reference/style-test.html`, so show them to the team for approval. Package and run `npm run test:ship`.

### M3 · Zeus
> Build Zeus from primitives in `content/gods/zeus/` (match the style-test model, with the canvas-face expression system). Rapier kinematic character controller: WASD, pointer-lock orbit camera with drag-to-orbit fallback, sprint/stamina, jump + short hover, dodge roll with i-frames, lock-on. Everything goes through intents and the rebindable input map. Light/heavy attack with a starter spear. Q = Chain Lightning (ability module with `cast`/`update`). Add health/stamina HUD, practice dummies and wildlife (e.g. sheep) to hit in the meadow. **Title font (team-approved):** bundle Cinzel via the npm package `@fontsource/cinzel` (SIL Open Font License; Vite bundles the font files, so there's no CDN), use it for the title screen, HUD headings and menus with the current serif stack as fallback, credit it in `public/ASSETS.md`, and update the font entry in `docs/DECISIONS.md`. **Playwright:** close-up baselines of Zeus with each of the 4 expressions and the HUD; a flow test where W moves the player (position changes in `getState()`), Space leaves the ground, and Q damages a dummy.

### M3.1 · Fixes + combat & controls update ✅ (done Nov 14, built in the planning chat)
> Read `docs/prompts/M3.1-fixes.md` and do all of it. (Boundary stuck-in-hill bug, sheep through rocks, hold-to-fire Chain Lightning, Sky Strike, Punch, Lightning Fist, faster roll, arrow-key movement with letter actions and camera auto-follow.)

### M4 · Weapons, elements, fusion (minimal but real)
> Implement SPEC §7–8: the element wheel and status effects in one damage pipeline; weapon defs built from parts × material × element; inventory (I); a Fusion Altar in the meadow (F to use) with a discovery table (sorted-pair keys + fallback rule); a Fusion Codex screen (C); and SVG icons generated per weapon. Weapon element boosts the matching ability. Add Vitest tests for the wheel and the fusion table. Seed about 8 base weapons and 6 named legendaries; place 2–3 weapons in the meadow to find. **Playwright:** a weapon contact sheet via `?preview=weapons`; baselines of the inventory, Fusion Altar and Codex screens; a flow test that fusing a known pair creates the named legendary and a codex entry. **Package and upload to itch.io (checkpoint #1).**

### M5 · Prologue + Rocket cinematic → minimum demo
> Implement SPEC §3.1–3.3: the frozen-golden-hour meadow prologue with tutorial prompts (move/look, sprint, jump, attack, ability, pick up a weapon, fuse). When all steps are done, play the 15–20 s rocket timeline with input locked and the HUD hidden: rocket streak, impact, summit collapse into floating debris, dust wall, pan to human columns climbing from each biome. Set `flags.olympusShattered`, unfreeze the world clock and turn the meadow into the Refuge (Forge, Fusion Altar, bed) with the objective "Find the others. Survive." Unskippable first time, skippable after. No strobing; respect reduce motion. Captions for all text and audio cues, plus a cinematic sting via Web Audio. **Playwright:** a flow test that completes the tutorial steps through `wc.completeTutorialStep` → the cinematic starts → keyboard input is ignored → control returns → `flags.olympusShattered` is true; screenshots frozen at 3 points of the cinematic (rocket, impact, pan) and of the shattered summit; and a test that the reduce-motion setting removes camera shake (camera transform stable across frames). **Package and upload (checkpoint #2, minimum demo).**

### M5.1 · Hades's arrival and the descent (story)
> Read `docs/prompts/m5.1-m6-hades-claude-brief.md` (the team's answers are recorded at its end) and SPEC §3.3. After the rocket cinematic, Hades steps out of a shadow portal and (captioned) tells Zeus they must regroup underground and find Cerberus; he opens a portal and takes Zeus to the **Outer Grotto** (short calm transition, input locked only for the scene, reduce motion respected). In the grotto, show that the humans got there first: an energy conduit leading deeper, and a dispatch or Styx vision showing Cerberus chained to power the Cerberus Mk. II. Objective: **"Find and free Cerberus."** The grotto becomes the Refuge (Fusion Altar, bed/respawn). Control returns as Zeus; Hades stands in the grotto as a story character (no combat or switching yet). Save the story state. Hades's model already exists (`src/content/gods/hades/`, from the approved concept; review on `?preview=characters`): use it as is and flip `hadesLook.approved` to true once the team signs off. **Playwright:** flow test rocket → Hades scene → grotto → objective shown → reload keeps it; frozen screenshots of Hades's arrival, the portal and the grotto discovery. **Package and upload.**

### M6 · Playable Hades + the Underworld route
> Build in this priority order, committing and packaging after each step that passes (see the cut line): **(1) Hades playable** — `content/gods/hades/` with the full SPEC §5 kit on the same keys as Zeus (Shadow bident on the weapon system; Shadow Step with decoy and ambush bonus; Soul Bolts hold-to-fire with lifesteal; Grasp of the Dead charge with root and pull; Skull Cage ultimate with a 1.5 s red warning ring; Lord of the Dead passive), all as deterministic sim modules through the existing ability, damage and status pipeline. **(2) Switching + companion** — a rebindable `switchCharacter` intent on V; the inactive god is an AI companion per SPEC §5 (follow, catch-up teleport, help in fights, down-and-recover). HUD shows the active god's ability bar and a small portrait/health for the other. **(3) The region** — seeded chunked terrain streamed with simple LOD for the Underworld region (SPEC §3.5), much larger than the meadow: Outer Grotto → Asphodel Fields → the Gates with Cerberus Mk. II visible (inactive set piece) and the conduits; the Underworld's fixed lighting; minimap + full map with fog of war (SPEC §4.1). Start area ready in under 3 s. **(4) Forts** — soldiers (spear, archer, shield) with patrol → suspicious → alert → attack → search AI; 3 small forts on the route with loot chests. **(5) Sentries** — lookouts with visible sight cones that raise the alarm. **(6) Caves** — 1–2 side caves (stretch). Save/restore both gods, the active one, the reveal map and cleared forts. **Playwright:** V switches control and the other god follows; each Hades move works (W decoy, Q drains health back, D roots, R warns ≥1.5 s before trapping); fort soldiers notice and attack; a sentry raises the alarm; reveal persists across reload; baselines of Hades close-ups (4 expressions), the Asphodel Fields vista, a fort and a sentry cone. **Package and upload.**

### M7 · Cerberus Mk. II and freeing Cerberus (demo climax)
> The encounter at the Gates (SPEC §10), playable with either god active and the other helping: patrol route, visible sensor cone, detection, rear plating durability, hatch prompt and crawl, a 2–3 room interior with power cores and shaking, the pilot duel "The Warden", powering down, loot, and the spirit-freed cutscene where the conduits break and Cerberus is released. Freeing him unlocks Three-Fold Howl on E for both gods (`content/spirits/cerberus.ts`). **Playwright:** baselines of the mech outside, the sensor cone, the interior and Cerberus freed; a flow test via the test API from the hatch prompt → interior → pilot defeated → Cerberus freed → ability unlocked, once as Zeus and once as Hades. **Package and upload.**

### M8 · Demo hardening (do this before the demo, even if M7 is unfinished)
> Run the itch.io demo checklist below and fix anything that fails. Add synthesized SFX for attacks, hits, fusion and footsteps, plus ambient music for the meadow and Underworld. Add beds (respawn + heal; the global clock is not skipped) and save/load of everything in SPEC §11. Remove or hide anything half-finished. Final package and upload.

### M9 · After the demo
> The other five surface biomes and returning to the surface, the next mechs and spirits (Bronze Bull → Cretan Bull, Stag Walker → Golden Hind), more Hades weapons and Hades fusion discoveries, companion commands, snap-to-grid base building, and the small dungeon. Each one is content files plus registry lines where possible.

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
