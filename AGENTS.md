# Codex project instructions

**Weaponcraft** is a 3D browser game (TypeScript + Three.js + Rapier + Vite) for a weekend hackathon. **It must be demoed on itch.io on Sunday, Nov 15, 2026.** A broken itch.io build is the worst possible outcome, so protect the shippable build above everything else.

## Read first
- `docs/SPEC.md` is the source of truth for the game. `docs/ROADMAP.md` is the build order.
- Work **one milestone at a time**, and don't start the next until the current one runs and packages.
- `docs/reference/style-test.html` is the approved visual target. Port its look into `src/view/`; don't copy it wholesale. It uses three r170 via CDN, but this repo uses three 0.187 bundled, so adapt the imports and APIs.
- If a spec detail is missing, choose the simplest option, record it in `docs/DECISIONS.md` and keep going. Ask only when a choice is hard to undo.

## Development
- Install with `npm ci`. Run with `npm run dev` (port 5173).
- After every change: `npm test` and `npm run build`. After every milestone: `npm run package`, which writes `artifacts/game.zip` for itch.io.
- Tests: the existing Node test runner (`tests/*.test.mjs`) stays. Add **Vitest** for TypeScript sim logic (`src/**/*.test.ts`), and have `npm test` run both.
- The 3D game is the default page. The old Phaser demo stays reachable at `?demo=2d` until the team says to delete it.

## Browser & visual testing (Playwright)
Use **Playwright** (`@playwright/test`, Chromium) to test everything visual and interactive. Unit tests stay in Vitest and Node's test runner.
- **Commands:** `npm run test:e2e` (all browser tests), `npm run test:visual:update` (re-record screenshot baselines, but only after the team approves the new look), `npm run test:ship` (build, `vite preview` the `dist/` folder, then run the smoke suite against it, exactly as itch.io will serve it).
- **WebGL in headless:** launch Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. It renders slowly, so never rely on real-time animation in tests.
- **Deterministic test mode:** with `#test` (or in dev builds), expose `window.wc` with `freeze(timeSeconds)` (stop the clock and animation at a fixed time), `step(ticks)`, `setTime(dayFraction)`, `snapCam(presetId)`, `setSeed(n)`, `face(expr)`, `completeTutorialStep(id)`, `getState()` (a serialized copy) and `ready()` (a promise that resolves when the scene is generated and has rendered). Tests wait on `ready()`, freeze, then screenshot. Never use fixed `waitForTimeout` sleeps for rendering.
- **Smoke suite (must pass before every upload):** page loads with no console errors; **all requests stay on the local origin** (block and fail on any other host, which enforces the no-CDN rule); the canvas isn't blank (sample pixels); click-to-start works; resizing works; Esc opens settings.
- **Visual suite:** `expect(page).toHaveScreenshot()` with `maxDiffPixelRatio: 0.02` at a fixed 1280×720 viewport, with the HUD hidden unless the HUD itself is under test. Baselines live in `tests/e2e/__screenshots__/` and are committed. **An approved baseline is how a look gets signed off.** When a change alters a baseline, show the team the diff (`npx playwright show-report`) and update only after they say yes.
- **Flow suite:** scripted gameplay through the test API and real input, e.g. prologue steps → rocket starts → input locked → control returns and `flags.olympusShattered` is set; fusing two weapons adds a codex entry; the save round-trips across a reload.
- **Content previews:** for each registry, a test visits `?preview=<type>` and saves a contact sheet to `artifacts/previews/` for the team to review (`approved: false` items included).
- Keep e2e tests out of plain `npm test` so it stays fast. Run `npm run test:e2e` at the end of every milestone and `npm run test:ship` before every itch.io upload.

## itch.io rules (must hold at every commit)
- Keep `base: './'` in `vite.config.js`. `index.html` must be at the zip root (the packager checks this).
- **No runtime network requests and no CDNs.** Bundle everything. Use `@dimforge/rapier3d-compat`, which inlines its WASM. Load files in `public/` via `import.meta.env.BASE_URL`, never with root paths like `/x.png`.
- Click-to-start screen: the first click unlocks audio and requests pointer lock. Fall back to drag-to-orbit if pointer lock is refused in the itch iframe.
- Loading screen; the starting area must be ready in under ~3 s. Quality presets with an auto default.
- Namespace localStorage keys (`weaponcraft:*`). Provide a "New game" button.
- Hide the dev menu in production unless the URL hash is `#dev`. The test API (`window.wc`) is only exposed with `#test` or in dev builds.

## Architecture rules (non-negotiable)
1. `src/sim` holds all game state as plain serializable objects. `src/view` only reads state to draw it. Nothing gameplay-relevant goes on meshes or `userData`.
2. Input never changes state directly. It emits `Intent`s with a `playerId`, and only the sim applies them.
3. No player singleton: use `state.players[localPlayerId]`.
4. Everything is spawned through `spawn(defId, init)`, which returns a stable ID. Events and messages carry IDs, never object references.
5. Outcomes (damage, drops, fusion results, AI, mech state) run inside `if (isAuthority)`.
6. Sim code uses seeded `rng(seed, stream)` only. Never call `Math.random()` there.
7. The sim runs on a fixed 30 Hz tick. Rendering interpolates.
8. Event payloads are plain data.
9. Saves and future network snapshots use the same `serialize`/`deserialize`.
10. Content lives in `src/content/<type>/` with an `index.ts` registry. New content is a new file plus one registry line, never an engine change.
11. Time of day comes only from `sim/time.ts getWorldTime(nowMs, settings)` (UTC, 4 real hours = 1 game day), with the prologue override and the player's time-of-day lock.
12. Keep the game **client-only**. No backend, servers or runtime AI APIs unless the team explicitly asks.

## Assets
- Every model, texture, sky, icon and sound is generated in code. Don't download assets or add binaries without the team's say-so.
- New visual content is added with `approved: false` and shown on the dev preview page (`?preview=<type>`). The team flips it to `approved: true`, and unapproved content must not spawn in normal play. *Exception for demo speed:* content that's part of the current milestone may ship approved if the team saw it in the running game.
- Record any third-party asset creators, sources and licenses in `public/ASSETS.md`.

## Accessibility
- Every post effect (bloom, god rays, outlines, grade, particles) is toggleable in settings.
- Respect `settings.reduceMotion`: no camera shake, softened flashes, calmer particles.
- Never strobe or flash rapidly, in cinematics or anywhere else.
- Every input action goes through the rebindable input map. Never hard-code keys.
- Every dialogue line and important sound cue has a caption.
- The 3D game targets keyboard + mouse. The Phaser demo keeps its touch support.

## Working style
- Keep changes focused. Make small commits per feature with clear messages, and never leave `main` unbuildable.
- Never commit `node_modules/`, `dist/`, `artifacts/`, credentials, API keys or login codes.
