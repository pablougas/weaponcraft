# Weaponcraft — Project Context for Review

*Exported Saturday, Nov 14, 2026, 10:45 AM PT, from the Claude planning chat. Intended as context for a second AI reviewer that double-checks the work.*

---

## 0. How to use this file (for the reviewing AI)
You are a **second reviewer** on a weekend hackathon game. The design and plan below were made with Claude (planning chat), and the code is written by **Claude Code** in VS Code, one milestone at a time. Your job is to **double-check the work**, not restart it.

When reviewing, please:
1. Treat **Part B (SPEC.md)** as the source of truth. Flag anything in code, plans or answers that contradicts it.
2. Respect the **non-negotiable rules** in Part D (CLAUDE.md), especially the itch.io rules and the multiplayer-ready architecture rules.
3. Remember the **hard deadline: public demo on itch.io on Sunday, Nov 15, 2026**. Prefer advice that protects a shippable build over advice that adds scope.
4. Check against the per-milestone acceptance criteria in Part C (ROADMAP.md), including the required Playwright tests.
5. When you find a problem, say: what's wrong, where (file/section), why it matters for the demo, and the smallest fix.
6. Don't propose switching engines, frameworks or the overall design unless something is actually blocking.

Useful review prompts the team may give you:
- "Here's the diff / file for milestone M_. Check it against SPEC, ROADMAP and CLAUDE.md."
- "Here's a screenshot. Does it match the art direction (SPEC §14)?"
- "Here's an error from `npm run test:ship`. What's the likely cause?"
- "We're behind schedule. What should we cut, given the cut line in ROADMAP?"

---

## 1. The team and situation
- **Team:** solo developer (Pablo) + AI assistants. GitHub repo: `pablougas/weaponcraft`, local at `~/weaponcraft` on a MacBook Pro.
- **Event:** weekend hackathon; demo on **itch.io** on **Sunday, Nov 15, 2026**.
- **Tools:** Claude (planning, specs, art direction, review), **Claude Code** in VS Code (writes all code, mostly in auto permission mode), Playwright (browser/visual tests), itch.io (hosting).
- **Machine:** Node v26.13.1, npm 11.20.0 (project requires Node ≥ 22.12). There's a harmless npm warning `Unknown user config "python"`, most likely a shell env var; the team decided to ignore it.

## 2. The game in one paragraph
**Weaponcraft** is a 3D third-person browser game (TypeScript + Three.js + Rapier + Vite). Humans have had enough of the Greek gods. The game opens with Zeus in a calm, golden-hour meadow on the slopes of Mount Olympus, where the player learns the controls. When the tutorial is done, a **rocket** streaks across the sky and **blows the top off Olympus** in a 15–20 s cinematic during which the player loses control. Humans then occupy the six biomes around the mountain with **soldier patrols, camps and giant animal mechs**. Each mech is powered by a captured **biome spirit creature**. The player explores the open world, gathers, crafts and **fuses weapons** (the core hook), sneaks up on mechs, breaks their rear plating, crawls in through the hatch, beats the pilot and **frees the spirit**, which grants a new ability. It's an open sandbox with no ending; the goals are freeing spirits, filling the Fusion Codex and exploring.

## 3. How the design evolved (decision history)
In order, so a reviewer understands why things are the way they are:

1. **Start (Nov 13):** only the name "Weaponcraft", a hackathon, and a Nano Banana (Gemini image model) art pipeline doc.
2. **First Q&A round:** core loop gather → craft → fight; **full 3D third-person**; elemental realms; hub + 3 zones.
3. **Second round:** low-poly models built from code primitives; zones Light / Shadow / Poison; **freeform weapon combining**; ranged + melee combat.
4. **Third round:** elements have both counters and status effects; fusion takes **existing weapons**; endless sandbox.
5. **Team added the "Olympus Rising" GDD** (a much larger Zelda × Minecraft × mech game with 8 gods, 6 biomes, the rear-hatch mech sequence, co-op, base building). Decision: **merge** the Olympus world with Weaponcraft's fusion hook, built **broad but shallow**, **single-player**, **Zeus first, Hades second**.
6. **Scope decisions:** keep the mech + rear hatch, base building, day/night + beds, one dungeon; all 6 biomes + Olympus, procedural. Elements became **Light > Shadow > Poison > Lightning > Light**. Weapons come from all sources; fusion uses a **discovery table**; first mech **Cerberus Mk. II**.
7. **Tech/feel:** toon-shaded low-poly; WASD + mouse orbit; Vite + three.js + Rapier.
8. **Modular architecture:** engine vs content split with registries, so worlds and characters are easy to add.
9. **No Nano Banana:** all assets are generated in code by Claude and **approved by the team** before they go in the game.
10. **Multiplayer-ready infrastructure** from day one (host-authoritative later), without building networking now.
11. **Art direction from reference images:** BotW-style golden-hour vista, warm anime-style characters, bioluminescent night forest. We take mood, light and color, not characters. "Epic world, warm characters."
12. **Style test built and approved** (a single HTML three.js page; see §5). The team liked that effects are toggleable for accessibility.
13. **New story (Nov 14):** calm tutorial → rocket destroys the Olympus summit (input locked) → humans attack. Then refined:
    - Structure: **open world**. The team explicitly **dropped raids**. Humans have **soldiers and camps in each biome** instead.
    - The rocket triggers **after the tutorial steps are completed**.
    - **Mechs run on captured biome spirit creatures.** Beating a mech frees the spirit and unlocks weapons plus a spirit ability.
    - Olympus after the blast: **shattered summit**.
    - **No ending.**
14. **Real-time day clock:** 1 real hour = ¼ game day (a 4-hour day), tied to **UTC wall-clock time**, not session time.
15. **Cinematic rules:** unskippable the first time, photosensitivity-safe, ~15–20 s.
16. **Accessibility:** effect toggles, reduce motion & flashes, remappable keys + subtitles.
17. **Handoff to Claude Code** as a repo starter pack (CLAUDE.md + docs/SPEC.md + docs/ROADMAP.md + docs/DECISIONS.md + docs/reference/style-test.html).
18. **itch.io deadline adjustments:** roadmap reordered so the prologue + rocket (the strongest demo moment) come before the open world; ship checkpoints; a time-of-day lock setting so the demo isn't stuck at night.
19. **Playwright** added for smoke, visual-baseline, flow and content-preview tests, via a deterministic test API (`window.wc`, `#test`).
20. **Cinzel title font** approved, to be bundled via `@fontsource/cinzel` in M3.
21. **Fog-of-war minimap** (top-right, reveals as you explore) plus full map on M, added as SPEC §4.1 and built in M6.

## 4. Current build status (as of 10:45 AM Saturday)
Git history:
```
2d320ae Record team approval of the M2 visual baselines
faef503 M2: the look — style-test meadow, day cycle, post stack, settings
e10c4b1 M1: sim core — world state, 30 Hz tick, intents, saves, world clock
b360741 M0: 3D game skeleton, Playwright smoke suite, itch.io packaging
2e604f7 Add Weaponcraft spec, roadmap and Claude Code rules
```
- **Done:** M0 (3D skeleton, title screen, loading, Rapier loading, packaging, smoke tests), M1 (sim core), M2 (meadow look, day cycle, post-processing, settings; visual baselines approved by the team).
- **In progress:** M3 (Zeus: controller, camera, attacks, Chain Lightning, Cinzel font).
- **Not started:** M4 fusion, M5 prologue + rocket (minimum demo, target Saturday night), M6 world gen + map, M7 humans + Cerberus, M8 demo hardening, M9 extras.
- **Not yet done:** first itch.io upload (recommended right after M0/M2 to prove the pipeline).
- **Process advice given:** batch milestones in auto mode with gates (tests + package + commit + tag after each; never self-approve screenshot baselines; stop after two failed fix attempts). Commit before each milestone. Play-test each tagged milestone.

## 5. Art reference: the approved style test
A single-file three.js r170 page (in the repo at `docs/reference/style-test.html`) showing:
- Golden-hour hilltop at the foot of Olympus; shader sky with clouds/stars; blue distance haze; Olympus on the horizon with a golden temple and floating islands.
- Instanced wind-swept grass that glows when backlit; flowers; cherry-blossom trees; rocks; lake.
- Placeholder Zeus built from primitives: white chiton, gold trim, blue cape, silver hair and beard, laurel, lightning spear; **canvas-drawn face** with 4 expressions (neutral / determined / happy / hurt).
- Post stack: screen-space god rays, bloom, ACES tone mapping, color grade + vignette; toon shading with rim light and inverted-hull outlines.
- Night: fireflies, glowing flora, a glowing **spirit stag** in the blossom glade, stars, moon.
- Toggles for bloom, god rays, outlines and grade (seen as an accessibility feature).
- Known weakness: Zeus's body reads as a toy figure; the faces work.

## 6. Open items and things a reviewer should watch
- **Proposed (changeable) content:** the six spirit creatures and their abilities (SPEC §3.4), reveal radius and map grid size, the camp respawn rule.
- **Risks to watch:**
  - Scope vs one solo weekend: the cut line is in ROADMAP.
  - Screenshot baselines must be approved by a human, never by the coding agent.
  - Performance on the actual demo laptop (Playwright uses software WebGL, so it can't measure fps).
  - itch.io iframe specifics: pointer lock, audio unlock, fullscreen.
  - The UTC clock could make the live demo dark: use the time-of-day lock.
- **Deferred:** networked co-op (needs a server, and the "client-only" rule forbids one until asked), Hades (M9), other mechs and biomes, the dungeon, base building (M9).

---

The full current project documents follow, exactly as they exist in the repo:

- **Part B:** `docs/SPEC.md`, the game spec (source of truth)
- **Part C:** `docs/ROADMAP.md`, milestone prompts, schedule and the itch.io checklist
- **Part D:** `CLAUDE.md`, the rules Claude Code follows
- **Part E:** `docs/DECISIONS.md`, the running log of decisions Claude Code and the team made


---

# Part B — docs/SPEC.md

## Weaponcraft — Game Spec

Single source of truth for the hackathon build. Merges the **Olympus Rising GDD** (world, gods, mechs) with Weaponcraft's **weapon-fusion** hook and the decisions made Nov 13–14, 2026. Where this file and the GDD disagree, **this file wins**. Items marked *(proposed)* are defaults the team can change freely.

---

### 1. Pitch
Humans have had enough of the gods. They fire a rocket that shatters the summit of Mount Olympus, then march into every biome around it with soldiers, camps and giant animal mechs. Those mechs are powered by the captured **spirit creatures** of each biome. You play a fallen god. Explore the occupied world, forge and **fuse** weapons, tear down mechs through their rear hatch, and free the spirits to gain their powers.

**Tone:** epic world, warm characters. The world and music are serious and mythic. Characters are expressive and likeable. The rear-hatch entry stays the one played-straight joke.

### 2. Scope and constraints
- **Solo dev + Claude**, one weekend, **single-player**, built **multiplayer-ready** (§13).
- **Broad but shallow:** every system exists in a minimum form.
- **No ending:** open sandbox. The goals are to free spirits, fill the Fusion Codex and explore.
- **First cut if behind:** drop to 3 biomes + Olympus.
- **Demo path (2–3 min):** calm prologue → rocket cinematic → travel to the Underworld → fuse a Light weapon → sneak up on **Cerberus Mk. II** → break the plating → hatch → beat the pilot → free the Cerberus spirit and gain its ability.
- **Hard deadline: public demo on itch.io on Sunday, Nov 15, 2026.** A working build must be uploaded to itch.io by **Saturday night**, and every milestone after that ships as a new upload. See §16 for itch.io requirements.

### 3. Story and flow

#### 3.1 Prologue: "The Last Calm Day" (tutorial)
- Zeus stands on a rock in a peaceful meadow on the lower slopes of Olympus at golden hour, with the summit and its golden temple on the horizon. This is the style-test scene (`docs/reference/style-test.html`).
- **Time is frozen at golden hour** during the prologue. The real-time clock (§6) takes over after the cinematic.
- Soft on-screen prompts teach, in order: move/look → sprint → jump → light/heavy attack (on practice dummies or wildlife) → god ability (Chain Lightning) → pick up a second weapon → **fuse** two weapons at the altar in the meadow.
- **When every tutorial step is done, the rocket sequence triggers.**

#### 3.2 The Rocket (cinematic, ~15–20 s, input locked)
1. Camera eases to a wide shot of Olympus. The player loses control and the HUD fades out.
2. A rocket streaks across the sky with a smoke trail and a rising sound.
3. Impact on the summit, then a shockwave, a dust wall rolling down the slopes, and the temple and top of the mountain breaking apart and falling. Floating debris remains.
4. Pan down: human columns with torches and banners climb from every side, one per biome, with mech silhouettes among them.
5. Control returns. HUD back, objective: *"Find the others. Survive."*

Rules:
- **Unskippable the first time** on a save. Skippable on later playthroughs and new saves.
- **Photosensitivity safe:** no rapid flashing. The impact uses one slow bloom swell, never strobing. If *Reduce motion & flashes* is on, the flash and shake are softened further.
- It runs as a scripted timeline (`src/sim/cutscenes/rocket.ts`) that sets `state.flags.olympusShattered = true` at impact. The input layer ignores intents while `state.cutscene` is active.

#### 3.3 After the blast (main game)
- **Olympus = shattered summit.** The top is blown off, the temple is ruined, debris floats, and smoke rises during the first in-game day. The meadow becomes **the Refuge**: Forge, Fusion Altar, bed/respawn, and later the base-building zone.
- The six biomes around Olympus are **occupied by humans**. There are no raids. Humans hold their own territory with **soldier patrols, camps and a mech lair** in each biome.
- Difficulty scales with distance from Olympus.

#### 3.4 Spirit creatures and mechs (core progression)
Each mech imprisons its biome's spirit creature and runs on its energy. The mech is a mechanical imitation of that creature. Defeating a mech:
1. Drops **mech weapons and parts** (fusion and crafting inputs).
2. **Frees the spirit.** It appears glowing (like the stag in the style test), bonds with the gods and grants a **spirit ability** that any god can equip in a spirit slot.

| Biome | Mech | Spirit (proposed) | Element | Spirit ability (proposed) |
|---|---|---|---|---|
| Underworld Caverns | **Cerberus Mk. II** (first) | Cerberus, Hound of the Gate | Shadow | **Three-Fold Howl**: AoE fear + lifesteal for 6 s |
| Marble Highlands | Bronze Bull | The Cretan Bull | Light | **Dawn Charge**: armored dash that knocks enemies aside |
| Storm Peaks | Thunder Eagle | The Storm Eagle | Lightning | **Sky Dive**: leap, glide, crash down in a lightning burst |
| Drowned Coast | Kraken Crab | Karkinos the Tide Crab | Poison | **Venom Tide**: wave that poisons and slows |
| Sun-Scorched Plains | Lion Colossus | The Nemean Lion | Light | **Golden Hide**: 3 s invulnerability + reflect |
| Whispering Forest | Stag Walker | The Golden Hind | Poison | **Wild Hunt**: speed burst leaving a poison thorn trail |

The GDD's per-god Divine Beasts are **replaced** by spirits for this build.

### 4. World
- **Seeded procedural** landmass ringed by sea, with **Mount Olympus at the center** and six biome wedges around it: Marble Highlands, Storm Peaks, Drowned Coast, Underworld Caverns, Sun-Scorched Plains, Whispering Forest.
- Each biome is a registry entry (§12): palette, terrain params, resources, props, enemy table, camp layouts, mech lair, hazard, music.
- Placement rules: each biome gets ≥2 human camps, 1 mech lair (far edge), resource clusters, chests at ruins/shrines. The Refuge is always at the meadow below the summit.
- **Terrain:** chunked heightfield (e.g. 64 m chunks), generated from the seed (in a Web Worker if needed) and streamed around the player, with simple LODs. Smooth terrain; no carving.
- **Dungeon:** one small hand-built dungeon (proposed: a ruined shrine in Marble Highlands) with one puzzle.

#### 4.1 Map and fog of war
- **Minimap, top-right corner.** A round, north-up map centered on the player. It **starts dark** and reveals the area around the player as they explore (proposed: 60 m reveal radius, larger from high ground). Explored terrain is drawn from the heightfield and biome colors; unexplored stays dark.
- **Full map** on **M** (rebindable): pan and zoom over the whole revealed world.
- **Markers:** the player (arrow), the Refuge, Olympus, human camps once seen (shown as cleared after clearing), mech lairs once scouted, freed spirits, chests, and custom pins (click on the full map).
- **Fog of war is game state:** a coarse grid (proposed: 16 m cells) stored as a bitset in `WorldState`, included in saves. It's ready to share in co-op later, since every player's reveals can merge into one map.
- **Prologue:** the minimap is hidden during the tutorial and appears when control returns after the rocket, with the meadow and the view toward Olympus already revealed.
- **Accessibility:** minimap toggle, size (small/medium/large) and rotation (north-up / player-up) in settings.

### 5. Player
- **Zeus first:** passive charge build-up, **Chain Lightning** (Q), short hover jump. **Hades second**, after Zeus is fully working: Shadow Step, Skull Cage (with the fair-warning rules from the GDD).
- **Controls (rebindable):** WASD move, mouse orbit (pointer lock), LMB light / RMB heavy, Shift sprint, Space jump, Ctrl dodge roll, Q god ability, **E spirit ability**, F interact, Tab lock-on, I inventory, C codex, Esc settings.
- Health + stamina (sprint, dodge, climb). Death respawns at the last bed.
- Combat is a **ranged + melee mix**: the weapon archetype decides the moveset (sword, spear, axe, bow, staff…).

### 6. Time of day: real-time world clock
- **1 real hour = ¼ game day**, so a full game day lasts **4 real hours**.
- Driven by **UTC wall-clock time**, not session time. Every player sees the same time of day:
  `dayFraction = (Date.now() / 1000 % 14400) / 14400` (0 = midnight; choose phase offsets so 0.25 ≈ dawn, 0.5 = noon, 0.75 ≈ dusk).
- One function: `sim/time.ts → getWorldTime(nowMs)`. The sim stores `nowMs` per tick (so it can be synced or overridden later). The view derives sun/moon, sky, fog and lighting from the style-test keyframes (golden hour / dusk / night), extended to a full cycle.
- **Prologue override:** clock frozen at golden hour until the cinematic ends.
- **Player setting "Time of day":** *Live (UTC)* (default) / *Always golden hour* / *Always night*. This is also an accessibility option for players who find dark scenes hard to see, and it guarantees the itch.io demo looks right whatever the real time is.
- **Dev only:** a time-scrub slider in the dev menu.
- Night: darker, fireflies and glowing flora, stronger human patrols. Beds let you rest. Because time is global, sleeping **does not skip** the clock: it restores health and sets respawn.

### 7. Elements
Counter wheel **Light > Shadow > Poison > Lightning > Light**. Hitting the element you beat does 2× damage. Each element also applies a status effect.

| Element | Status | Beats | Weak to | Accent color |
|---|---|---|---|---|
| Light | Blind | Shadow | Lightning | `#FFE08A` |
| Shadow | Lifesteal | Poison | Light | `#5B3A8C` |
| Poison | Damage over time | Lightning | Shadow | `#7BC043` |
| Lightning | Chain / stun | Light | Poison | `#6EC6FF` |

### 8. Weapons, crafting and fusion (core hook)
- **Sources:** starter kit; Forge crafting from gathered materials (wood → bronze → storm iron → mech parts → divine ore); soldier and camp drops; mech drops; chests.
- **Weapons are built from parts** (handle / blade or head / guard) × material × element, assembled from primitives so fused weapons visibly combine parts.
- **Fusion Altar:** combine two weapons.
  - **Discovery table:** specific pairs make named legendaries. Unknown pairs make a generic fused weapon (fallback rule: shape of A, element of B, stats averaged + 10%).
  - Table is data, keyed by the **sorted pair of weapon IDs**.
- **Fusion Codex:** records every discovery. This is the main sandbox goal.
- **Both roles:** the weapon drives basic attacks, and its element boosts the matching god or spirit ability.
- **Single damage pipeline:** base → element wheel → status → ability boosts.

### 9. Humans (enemies)
- **Soldiers:** spear, archer, shield-bearer; later an engineer who repairs mechs. AI states: patrol → suspicious → alert (calls others) → attack → search → return.
- **Camps:** tents, palisade, watchtower, campfire, loot chest. Clearing a camp marks it on the map. Camps respawn slowly (proposed: each new game day).
- **Mech drones:** sentry / crawler near lairs.
- Patrols are stronger at night and farther from Olympus.

### 10. Mech encounter: Cerberus Mk. II (first)
Scout → sneak (stay out of the visible **sensor cone**, use cover and shadow) → damage **rear plating** (durability bar, noisy) → **hatch** prompt → slow, dramatic crawl → small **interior** (2–3 rooms, power cores, shaking while the mech moves) → **pilot duel** ("The Warden") → mech powers down → loot + **spirit freed** cutscene (short, skippable).

### 11. Other systems (minimum versions)
- **Base building** at the Refuge: snap-to-grid walls, floors, roofs.
- **Save:** localStorage. Seed, inventory, codex, freed spirits, flags (`prologueDone`, `olympusShattered`), base pieces, cleared camps. Stores IDs only.
- **Audio:** synthesized SFX and procedural ambient music (Web Audio), one mood per biome plus a cinematic sting.
- **Settings and accessibility** (Esc menu, saved per browser):
  - Effect toggles: bloom, god rays, outlines, color grade, particles.
  - **Reduce motion & flashes:** no camera shake, softened explosions and flashes, calmer particles.
  - **Remap keys**, **subtitles/captions** for all dialogue and important sound cues.
  - Also: mouse sensitivity, invert Y, master/music/SFX volume.

### 12. Architecture
Builds on the existing repo (Vite + TypeScript + Three.js, packaged for itch.io).

```
src/
  main.ts            entry; 3D game is the default (Phaser demo stays behind ?demo=2d until removed)
  engine/            renderer, Rapier physics, input → intents, camera, save, event bus, net (Transport)
  sim/               WorldState + systems: combat, elements, fusion, worldgen, time, AI, building, cutscenes
  view/              three.js meshes, materials (toon + rim + outline), sky, fog, post-processing, foliage, particles, faces, audio
  content/           registries: biomes/, gods/, spirits/, weapons/, enemies/, mechs/, structures/   (each with index.ts)
  ui/                HUD, inventory, fusion altar, codex, settings, subtitles, prompts
```

- **Registries:** worldgen and spawners iterate `content/*/index.ts`. Adding content means adding a file and one line.
- **Typed defs + hooks:** `BiomeDef`, `GodDef`, `SpiritDef`, `WeaponDef`, `EnemyDef`, `MechDef`… with small behavior modules (`cast()`, `update()`).
- **Event bus** with plain-data payloads (`fusion:created`, `hatch:entered`, `spirit:freed`, `cutscene:start`…).
- **Dev menu** (backtick key): spawn anything from any registry, scrub time, teleport to biome, toggle god mode.

### 13. Multiplayer-ready rules (from line one)
Host-authoritative co-op later. Single-player = host + one local player + loopback transport.
1. **Sim/view split.** All game state is plain serializable data in `sim/`. Nothing gameplay-relevant lives on meshes.
2. **Input → intents** tagged with `playerId`. Only the sim changes state.
3. **No player singleton:** `state.players` is a map. Camera, HUD and input bind to `localPlayerId`.
4. **Stable entity IDs** via one `spawn(defId, init)`.
5. **Authority checks:** outcomes run under `isAuthority` (always true for now).
6. **Seeded RNG only** in sim code. No `Math.random()`. World = seed + edits.
7. **Fixed-timestep sim** (30 Hz); rendering interpolates; Rapier steps with the sim.
8. **Serializable events.**
9. **One serializer** for saves and future network snapshots.
10. **Transport interface** with a `LoopbackTransport` now.
The world clock is already global (UTC), so co-op players share day/night for free.

### 14. Art direction
Target: **BotW-like light and atmosphere** with warm, expressive characters (team references: golden-hour vista, warm anime-style characters, bioluminescent night forest). Use the mood, not anyone's characters or designs.
- Toon shading (3–4-tone ramp), soft outlines (inverted hull), rim light, bloom, god rays, ACES tone mapping, color grade, distance haze (blue aerial perspective), painted shader sky with clouds, instanced wind-blown grass that glows when backlit, fireflies, petals and glowing flora at night.
- Characters built from primitives, with **canvas-drawn faces** and swappable expressions (neutral / determined / happy / hurt).
- Palette: sun gold `#FFC870`, sky blue `#7FB2E5`, haze `#C9DCEB`, shadow blue `#3A4E7A`, night `#0E1A3A`, spirit cyan `#4FF0E0`. Materials: marble, bronze `#B87333`, storm iron, rusted mech brass.
- **All assets are generated in code by Claude and approved by the team** before they're registered (`approved: true` on the def). No external downloads. Any third-party files the team adds get credited in `public/ASSETS.md`.
- **Reference implementation:** `docs/reference/style-test.html` (three r170 via CDN). Port its shaders and look into `view/`; don't copy the file wholesale.

### 15. Out of scope this weekend
Networked co-op itself (architecture is ready; it would need a server, which the client-only rule forbids until the team asks), gods beyond Zeus + Hades, skins, carveable terrain, raids, a story ending, PvP, touch/mobile controls for the 3D game.

### 16. itch.io demo requirements
- **Packaging:** `npm run package` → `artifacts/game.zip` with `index.html` at the zip root (the existing script enforces this). Upload as an **HTML** project, *playable in the browser*.
- **Embed settings on itch.io:** 1280×720 viewport, **fullscreen button on**, "mobile friendly" off.
- **Self-contained:** no CDN or runtime network requests. three.js and Rapier are bundled by Vite. Use `@dimforge/rapier3d-compat`, which inlines its WASM. Any file in `public/` is loaded via `import.meta.env.BASE_URL`.
- **Click-to-start title screen.** The first click unlocks audio (browsers block it before a user gesture) and requests pointer lock. If pointer lock is refused inside the itch iframe, fall back to drag-to-orbit. Show a "click to resume" overlay when the iframe loses focus.
- **Fast first load:** show a loading screen; world generation for the starting area must finish in under ~3 s on a laptop. Generate distant chunks progressively.
- **Performance:** quality presets *Low / Medium / High* (shadow size, grass density, pixel ratio, post effects), with an auto default from a quick FPS probe. Target 60 fps at Medium on an integrated-GPU laptop.
- **Saves:** localStorage keys are namespaced (`weaponcraft:save:v1`) because itch.io serves many games from one domain. Add a "New game" button that clears the save, so judges can replay the prologue.
- **Testing:** Playwright drives Chromium (SwiftShader WebGL) through a deterministic test API (`window.wc`, enabled with `#test`) for smoke, visual-baseline and gameplay-flow tests. `npm run test:ship` runs the smoke suite against the built `dist/` before every upload. Approved screenshot baselines double as the art sign-off record. Details in `CLAUDE.md`.
- **Demo safety:** the dev menu is hidden in production builds unless the URL hash is `#dev`. Time-of-day lock (§6) and the prologue skip on replays are the demo's safety nets.

---

# Part C — docs/ROADMAP.md

## Weaponcraft build roadmap (for Claude Code)

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

#### M0 · Repo prep + itch.io skeleton
> Read `CLAUDE.md`, `docs/SPEC.md` and this roadmap. Make the 3D game the default page in `src/main.ts` and `index.html` (full-window canvas, loading screen, click-to-start title screen "WEAPONCRAFT"). Move the Phaser demo behind `?demo=2d`. Add `@dimforge/rapier3d-compat` and Vitest, and make `npm test` run the existing node tests plus Vitest. Create the folder structure from SPEC §12 with empty registries. Update README "Play the demos" for the new default. **Set up Playwright** per CLAUDE.md: install `@playwright/test` and Chromium (also add `npx playwright install --with-deps chromium` to the devcontainer setup), a `playwright.config.ts` with a SwiftShader Chromium project at 1280×720, the scripts `test:e2e`, `test:visual:update` and `test:ship`, and the `window.wc` test-API stub with `ready()`. Write the smoke suite: no console errors, no off-origin requests, non-blank canvas, click-to-start. Make it pass against both `npm run dev` and the built `dist/`. Run `npm test`, `npm run build`, `npm run test:ship` and `npm run package`, then commit.

#### M1 · Sim core (multiplayer-ready skeleton)
> Implement SPEC §13: `WorldState`, a fixed 30 Hz tick with render interpolation, an intent queue, a `spawn()` entity registry with stable IDs, a plain-data event bus, seeded `rng(seed, stream)`, `serialize`/`deserialize` with a namespaced localStorage save and a "New game" reset, a `Transport` interface with `LoopbackTransport`, and `isAuthority`. Add `sim/time.ts` `getWorldTime(nowMs, settings)` (UTC, 4 real hours = 1 day) with the prologue override and the time-of-day lock (Live / Always golden hour / Always night). Add Vitest tests for RNG determinism, the serializer round-trip and world time. Add the dev menu (backtick; production only with `#dev`) showing tick rate, world time and entity count.

#### M2 · The look (port the style test)
> Port `docs/reference/style-test.html` into `src/view/`: toon material with rim light, inverted-hull outlines, the shader sky with clouds/stars, fog/haze, the post stack (god rays, bloom, OutputPass, grade), instanced wind grass, flowers, glowing flora and the particle systems. Drive sun, sky and fog from `getWorldTime()` across a full 24 h cycle, extending the golden hour / dusk / night keyframes to dawn and noon. Add a settings store and an Esc settings menu with toggles for every effect, reduce motion, quality presets (auto default) and the time-of-day lock. Show it all on the meadow scene with Olympus intact on the horizon. Implement `wc.freeze`, `setTime`, `snapCam` and `setSeed`. **Visual baselines:** vista at golden hour, dusk and night; the wide shot; one shot with every effect off; and the settings menu. They should match `docs/reference/style-test.html`, so show them to the team for approval. Package and run `npm run test:ship`.

#### M3 · Zeus
> Build Zeus from primitives in `content/gods/zeus/` (match the style-test model, with the canvas-face expression system). Rapier kinematic character controller: WASD, pointer-lock orbit camera with drag-to-orbit fallback, sprint/stamina, jump + short hover, dodge roll with i-frames, lock-on. Everything goes through intents and the rebindable input map. Light/heavy attack with a starter spear. Q = Chain Lightning (ability module with `cast`/`update`). Add health/stamina HUD, practice dummies and wildlife (e.g. sheep) to hit in the meadow. **Title font (team-approved):** bundle Cinzel via the npm package `@fontsource/cinzel` (SIL Open Font License; Vite bundles the font files, so there's no CDN), use it for the title screen, HUD headings and menus with the current serif stack as fallback, credit it in `public/ASSETS.md`, and update the font entry in `docs/DECISIONS.md`. **Playwright:** close-up baselines of Zeus with each of the 4 expressions and the HUD; a flow test where W moves the player (position changes in `getState()`), Space leaves the ground, and Q damages a dummy.

#### M4 · Weapons, elements, fusion (minimal but real)
> Implement SPEC §7–8: the element wheel and status effects in one damage pipeline; weapon defs built from parts × material × element; inventory (I); a Fusion Altar in the meadow (F to use) with a discovery table (sorted-pair keys + fallback rule); a Fusion Codex screen (C); and SVG icons generated per weapon. Weapon element boosts the matching ability. Add Vitest tests for the wheel and the fusion table. Seed about 8 base weapons and 6 named legendaries; place 2–3 weapons in the meadow to find. **Playwright:** a weapon contact sheet via `?preview=weapons`; baselines of the inventory, Fusion Altar and Codex screens; a flow test that fusing a known pair creates the named legendary and a codex entry. **Package and upload to itch.io (checkpoint #1).**

#### M5 · Prologue + Rocket cinematic → minimum demo
> Implement SPEC §3.1–3.3: the frozen-golden-hour meadow prologue with tutorial prompts (move/look, sprint, jump, attack, ability, pick up a weapon, fuse). When all steps are done, play the 15–20 s rocket timeline with input locked and the HUD hidden: rocket streak, impact, summit collapse into floating debris, dust wall, pan to human columns climbing from each biome. Set `flags.olympusShattered`, unfreeze the world clock and turn the meadow into the Refuge (Forge, Fusion Altar, bed) with the objective "Find the others. Survive." Unskippable first time, skippable after. No strobing; respect reduce motion. Captions for all text and audio cues, plus a cinematic sting via Web Audio. **Playwright:** a flow test that completes the tutorial steps through `wc.completeTutorialStep` → the cinematic starts → keyboard input is ignored → control returns → `flags.olympusShattered` is true; screenshots frozen at 3 points of the cinematic (rocket, impact, pan) and of the shattered summit; and a test that the reduce-motion setting removes camera shake (camera transform stable across frames). **Package and upload (checkpoint #2, minimum demo).**

#### M6 · World generation
> Implement seeded chunked terrain (SPEC §4) streamed around the player with simple LOD: Olympus at the center (shattered-summit variant), six biome wedges from `content/biomes/`, the sea ring, and the Refuge meadow kept as the hand-tuned spawn area. Fully define Underworld Caverns (needed for Cerberus) and Marble Highlands; register the other four with placeholder params. Add biome props, resource nodes, gathering and the Forge crafting UI. The starting area must be ready in under 3 s. Dev menu: teleport to biome. **Map (SPEC §4.1):** fog-of-war reveal grid in `WorldState` (saved), the round top-right minimap that starts dark and reveals as you explore, the full map on M with markers and custom pins, and minimap settings. **Playwright:** a flow test that walking reveals new cells and the reveal survives a save/reload; baselines of the minimap (partly revealed) and the full map.

#### M7 · Humans + Cerberus Mk. II (demo climax)
> Implement soldiers (spear, archer, shield) with patrol → suspicious → alert → attack → search AI, plus 2 camps with loot chests in each defined biome. Then Cerberus Mk. II in the Underworld (SPEC §10): patrol route, visible sensor cone, detection, rear plating durability, hatch prompt and crawl, a 2–3 room interior with power cores and shaking, the pilot duel "The Warden", powering down, loot, and the spirit-freed cutscene. Freeing the spirit unlocks Three-Fold Howl on E (`content/spirits/cerberus.ts`). **Playwright:** baselines of a soldier camp, Cerberus outside, the sensor cone, the interior and the spirit-freed moment; a flow test via the test API from the hatch prompt → interior → pilot defeated → spirit ability unlocked. **Package and upload (checkpoint #3).**

#### M8 · Demo hardening (do this before the demo, even if M7 is unfinished)
> Run the itch.io demo checklist below and fix anything that fails. Add synthesized SFX for attacks, hits, fusion and footsteps, plus ambient music for the meadow and Underworld. Add beds (respawn + heal; the global clock is not skipped) and save/load of everything in SPEC §11. Remove or hide anything half-finished. Final package and upload.

#### M9 · If time remains
> Hades (Shadow Step, Skull Cage with fair warning), snap-to-grid base building at the Refuge, the next mechs and spirits (Bronze Bull → Cretan Bull, Stag Walker → Golden Hind), the remaining biomes, and the small dungeon. Each one is content files plus registry lines only.

---

### itch.io demo checklist
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

---

# Part D — CLAUDE.md

## Claude Code project instructions

**Weaponcraft** is a 3D browser game (TypeScript + Three.js + Rapier + Vite) for a weekend hackathon. **It must be demoed on itch.io on Sunday, Nov 15, 2026.** A broken itch.io build is the worst possible outcome, so protect the shippable build above everything else.

### Read first
- `docs/SPEC.md` is the source of truth for the game. `docs/ROADMAP.md` is the build order.
- Work **one milestone at a time**, and don't start the next until the current one runs and packages.
- `docs/reference/style-test.html` is the approved visual target. Port its look into `src/view/`; don't copy it wholesale. It uses three r170 via CDN, but this repo uses three 0.187 bundled, so adapt the imports and APIs.
- If a spec detail is missing, choose the simplest option, record it in `docs/DECISIONS.md` and keep going. Ask only when a choice is hard to undo.

### Development
- Install with `npm ci`. Run with `npm run dev` (port 5173).
- After every change: `npm test` and `npm run build`. After every milestone: `npm run package`, which writes `artifacts/game.zip` for itch.io.
- Tests: the existing Node test runner (`tests/*.test.mjs`) stays. Add **Vitest** for TypeScript sim logic (`src/**/*.test.ts`), and have `npm test` run both.
- The 3D game is the default page. The old Phaser demo stays reachable at `?demo=2d` until the team says to delete it.

### Browser & visual testing (Playwright)
Use **Playwright** (`@playwright/test`, Chromium) to test everything visual and interactive. Unit tests stay in Vitest and Node's test runner.
- **Commands:** `npm run test:e2e` (all browser tests), `npm run test:visual:update` (re-record screenshot baselines, but only after the team approves the new look), `npm run test:ship` (build, `vite preview` the `dist/` folder, then run the smoke suite against it, exactly as itch.io will serve it).
- **WebGL in headless:** launch Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. It renders slowly, so never rely on real-time animation in tests.
- **Deterministic test mode:** with `#test` (or in dev builds), expose `window.wc` with `freeze(timeSeconds)` (stop the clock and animation at a fixed time), `step(ticks)`, `setTime(dayFraction)`, `snapCam(presetId)`, `setSeed(n)`, `face(expr)`, `completeTutorialStep(id)`, `getState()` (a serialized copy) and `ready()` (a promise that resolves when the scene is generated and has rendered). Tests wait on `ready()`, freeze, then screenshot. Never use fixed `waitForTimeout` sleeps for rendering.
- **Smoke suite (must pass before every upload):** page loads with no console errors; **all requests stay on the local origin** (block and fail on any other host, which enforces the no-CDN rule); the canvas isn't blank (sample pixels); click-to-start works; resizing works; Esc opens settings.
- **Visual suite:** `expect(page).toHaveScreenshot()` with `maxDiffPixelRatio: 0.02` at a fixed 1280×720 viewport, with the HUD hidden unless the HUD itself is under test. Baselines live in `tests/e2e/__screenshots__/` and are committed. **An approved baseline is how a look gets signed off.** When a change alters a baseline, show the team the diff (`npx playwright show-report`) and update only after they say yes.
- **Flow suite:** scripted gameplay through the test API and real input, e.g. prologue steps → rocket starts → input locked → control returns and `flags.olympusShattered` is set; fusing two weapons adds a codex entry; the save round-trips across a reload.
- **Content previews:** for each registry, a test visits `?preview=<type>` and saves a contact sheet to `artifacts/previews/` for the team to review (`approved: false` items included).
- Keep e2e tests out of plain `npm test` so it stays fast. Run `npm run test:e2e` at the end of every milestone and `npm run test:ship` before every itch.io upload.

### itch.io rules (must hold at every commit)
- Keep `base: './'` in `vite.config.js`. `index.html` must be at the zip root (the packager checks this).
- **No runtime network requests and no CDNs.** Bundle everything. Use `@dimforge/rapier3d-compat`, which inlines its WASM. Load files in `public/` via `import.meta.env.BASE_URL`, never with root paths like `/x.png`.
- Click-to-start screen: the first click unlocks audio and requests pointer lock. Fall back to drag-to-orbit if pointer lock is refused in the itch iframe.
- Loading screen; the starting area must be ready in under ~3 s. Quality presets with an auto default.
- Namespace localStorage keys (`weaponcraft:*`). Provide a "New game" button.
- Hide the dev menu in production unless the URL hash is `#dev`. The test API (`window.wc`) is only exposed with `#test` or in dev builds.

### Architecture rules (non-negotiable)
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

### Assets
- Every model, texture, sky, icon and sound is generated in code. Don't download assets or add binaries without the team's say-so.
- New visual content is added with `approved: false` and shown on the dev preview page (`?preview=<type>`). The team flips it to `approved: true`, and unapproved content must not spawn in normal play. *Exception for demo speed:* content that's part of the current milestone may ship approved if the team saw it in the running game.
- Record any third-party asset creators, sources and licenses in `public/ASSETS.md`.

### Accessibility
- Every post effect (bloom, god rays, outlines, grade, particles) is toggleable in settings.
- Respect `settings.reduceMotion`: no camera shake, softened flashes, calmer particles.
- Never strobe or flash rapidly, in cinematics or anywhere else.
- Every input action goes through the rebindable input map. Never hard-code keys.
- Every dialogue line and important sound cue has a caption.
- The 3D game targets keyboard + mouse. The Phaser demo keeps its touch support.

### Working style
- Keep changes focused. Make small commits per feature with clear messages, and never leave `main` unbuildable.
- Never commit `node_modules/`, `dist/`, `artifacts/`, credentials, API keys or login codes.

---

# Part E — docs/DECISIONS.md

## Decisions log

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
- 2026-11-14 — Team approved the M2 visual baselines (vista at golden/dusk/night/dawn/noon, wide, effects off, settings menu), including the new dawn and noon looks.
