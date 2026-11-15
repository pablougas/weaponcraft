# Weaponcraft — Game Spec

Single source of truth for the hackathon build. Merges the **Olympus Rising GDD** (world, gods, mechs) with Weaponcraft's **weapon-fusion** hook and the decisions made Nov 13–14, 2026. Where this file and the GDD disagree, **this file wins**. Items marked *(proposed)* are defaults the team can change freely.

---

## 1. Pitch
Humans have had enough of the gods. They fire a rocket that shatters the summit of Mount Olympus, then march into every biome around it with soldiers, camps and giant animal mechs. Those mechs are powered by the captured **spirit creatures** of each biome. You play a fallen god. Explore the occupied world, forge and **fuse** weapons, tear down mechs through their rear hatch, and free the spirits to gain their powers.

**Tone:** epic world, warm characters. The world and music are serious and mythic. Characters are expressive and likeable. The rear-hatch entry stays the one played-straight joke.

## 2. Scope and constraints
- **Solo dev + Claude**, one weekend, **single-player**, built **multiplayer-ready** (§13).
- **Broad but shallow:** every system exists in a minimum form.
- **No ending:** open sandbox. The goals are to free spirits, fill the Fusion Codex and explore.
- **First cut if behind:** drop to 3 biomes + Olympus.
- **Demo path (3–5 min):** calm prologue → rocket cinematic → Hades arrives and portals Zeus to the Outer Grotto → "Find and free Cerberus" → cross the Asphodel Fields past human forts and sentries, switching between Zeus and Hades → sneak up on **Cerberus Mk. II** → break the plating → hatch → beat the pilot → free Cerberus and gain his ability.
- **Hard deadline: public demo on itch.io on Sunday, Nov 15, 2026.** A working build must be uploaded to itch.io by **Saturday night**, and every milestone after that ships as a new upload. See §16 for itch.io requirements.

## 3. Story and flow

### 3.1 Prologue: "The Last Calm Day" (tutorial)
- Zeus stands on a rock in a peaceful meadow on the lower slopes of Olympus at golden hour, with the summit and its golden temple on the horizon. This is the style-test scene (`docs/reference/style-test.html`).
- **Time is frozen at golden hour** during the prologue. The real-time clock (§6) takes over after the cinematic.
- Soft on-screen prompts teach, in order: move/look → sprint → jump → light/heavy attack (on practice dummies or wildlife) → god ability (Chain Lightning) → pick up a second weapon → **fuse** two weapons at the altar in the meadow.
- **When every tutorial step is done, the rocket sequence triggers.**

### 3.2 The Rocket (cinematic, ~15–20 s, input locked)
1. Camera eases to a wide shot of Olympus. The player loses control and the HUD fades out.
2. A rocket streaks across the sky with a smoke trail and a rising sound.
3. Impact on the summit, then a shockwave, a dust wall rolling down the slopes, and the temple and top of the mountain breaking apart and falling. Floating debris remains.
4. Pan down: human columns with torches and banners climb from every side, one per biome, with mech silhouettes among them.
5. Hades's arrival follows straight on (§3.3); control returns in the Outer Grotto with the objective *"Find and free Cerberus."*

Rules:
- **Unskippable the first time** on a save. Skippable on later playthroughs and new saves.
- **Photosensitivity safe:** no rapid flashing. The impact uses one slow bloom swell, never strobing. If *Reduce motion & flashes* is on, the flash and shake are softened further.
- It runs as a scripted timeline (`src/sim/cutscenes/rocket.ts`) that sets `state.flags.olympusShattered = true` at impact. The input layer ignores intents while `state.cutscene` is active.

### 3.3 After the blast: Hades and the descent (M5.1)
- **Olympus = shattered summit.** The top is blown off, the temple is ruined, debris floats and smoke rises. The surface is no longer safe.
- **Hades arrives.** As the dust settles, Hades steps out of a shadow portal in the meadow. Short captioned exchange: the surface belongs to the humans now; the gods must regroup **underground** and find **Cerberus**, the Hound of the Gate.
- **Portal to the Outer Grotto.** Hades opens a portal and takes Zeus with him: a short, calm transition (input locked only for the scene, no flashing, reduce motion respected, all lines captioned).
- **The discovery.** In the Outer Grotto they find the humans got there first: a glowing **energy conduit** runs from the grotto deeper into the Underworld, and a captured soldier's dispatch / a vision in the Styx shows **Cerberus chained and drained to power the Cerberus Mk. II**. New objective: **"Find and free Cerberus."**
- **Outer Grotto = the new Refuge** (first Underworld safe area): Fusion Altar, a bed / respawn point and the start of the route. Control returns as **Zeus**; in M5.1 Hades is a story character standing in the grotto (no combat, no switching yet).
- The other five biomes stay occupied by humans (soldier patrols, forts/camps, a mech lair each) and come after the demo. Difficulty scales with distance from the Refuge.

### 3.4 Spirit creatures and mechs (core progression)
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

### 3.5 The Underworld route (M6 demo region)
A region **much larger than the training meadow** that you roam freely, built so that reaching the mech is a **trial**:
- **Outer Grotto (safe start)** → **the Asphodel Fields**: a vast open cavern you can roam in any direction (grey asphodel meadows, the Styx and its tributaries, bone-white rock spires, a ceiling lost in violet haze lit by drifting soul-motes and glowing crystal veins) → **the Gates** where **Cerberus Mk. II** stands, visibly wired to the chained Cerberus by pulsing conduits.
- **Small human forts along the way** (3 on the main path, proposed): palisade, watchtower, tents, a campfire, 3–6 soldiers and a loot chest each. Clearing one marks it on the map.
- **Sentries:** lone lookouts and watch-posts covering the approaches with visible **sight cones**; seen = alarm, and nearby soldiers come running. Sneaking past (shadows, rock cover, Hades's Shadow Step decoy) or taking them out first are both valid.
- **Open-world roaming:** side areas off the main path with chests, ruins and weapons to find; the conduit and the Gates' glow are always visible as a landmark.
- **Caves (stretch goal):** 1–2 enclosed side caves with a chest or a shortcut, if time allows.
- **Lighting:** the Underworld has its own fixed "eternal dusk" look (violet/teal, soul-motes, glowing flora) and ignores the surface clock; the time-of-day setting only affects the surface.
- The actual mech fight (sensor cone, rear plating, hatch, interior, pilot) and freeing Cerberus are **M7**.

## 4. World
- **Seeded procedural** landmass ringed by sea, with **Mount Olympus at the center** and six biome wedges around it: Marble Highlands, Storm Peaks, Drowned Coast, Underworld Caverns, Sun-Scorched Plains, Whispering Forest.
- Each biome is a registry entry (§12): palette, terrain params, resources, props, enemy table, camp layouts, mech lair, hazard, music.
- Placement rules: each biome gets ≥2 human camps, 1 mech lair (far edge), resource clusters, chests at ruins/shrines. The Refuge is always at the meadow below the summit.
- **Terrain:** chunked heightfield (e.g. 64 m chunks), generated from the seed (in a Web Worker if needed) and streamed around the player, with simple LODs. Smooth terrain; no carving.
- **Dungeon:** one small hand-built dungeon (proposed: a ruined shrine in Marble Highlands) with one puzzle.

### 4.1 Map and fog of war
- **Minimap, top-right corner.** A round, north-up map centered on the player. It **starts dark** and reveals the area around the player as they explore (proposed: 60 m reveal radius, larger from high ground). Explored terrain is drawn from the heightfield and biome colors; unexplored stays dark.
- **Full map** on **M** (rebindable): pan and zoom over the whole revealed world.
- **Markers:** the player (arrow), the Refuge, Olympus, human camps once seen (shown as cleared after clearing), mech lairs once scouted, freed spirits, chests, and custom pins (click on the full map).
- **Fog of war is game state:** a coarse grid (proposed: 16 m cells) stored as a bitset in `WorldState`, included in saves. It's ready to share in co-op later, since every player's reveals can merge into one map.
- **Prologue:** the minimap is hidden during the tutorial and appears when control returns after the rocket, with the meadow and the view toward Olympus already revealed.
- **Accessibility:** minimap toggle, size (small/medium/large) and rotation (north-up / player-up) in settings.

## 5. Player
- **Zeus first:** passive charge build-up, **Chain Lightning** (Q), short hover jump. **Hades** has a story cameo in M5.1 and becomes playable in M6 (below).
- **Controls (rebindable):** **arrow keys move**; letters are actions. Space jump/hover, Shift sprint, **X dodge roll** (also Alt), **A punch** (also left mouse), **S weapon strike** (tap light / hold heavy; right mouse = heavy), **D Lightning Fist** (hold to charge), **Q Chain Lightning** (tap or hold to keep firing), **R Sky Strike**, **W Bolt Step** (lightning teleport), E spirit ability, F interact, Tab lock-on, mouse or Comma/Period to turn the camera (it auto-follows when not turned), I inventory, C codex, M map, Esc settings. The game must be fully playable without the mouse.
- **Zeus's lightning kit:** Chain Lightning (hold to fire every 0.3 s until stamina runs out; fires forward even with no target), **Sky Strike** (needs ≥50% stamina, drains all of it, huge AoE bolt from the sky after a 0.6 s marker, 12 s cooldown), **Lightning Fist** (charged electrified punch with a short lunge), **Bolt Step** (W: flash up to 8 m, or to the lock-on target, briefly untouchable, landing with a small lightning burst), plus a plain 3-hit **punch** combo. Details and numbers: `docs/prompts/M3.1-fixes.md`.
- **Dodge roll:** fast (≈0.26 s, ≈4.4 m), early i-frames, input buffer, cancels attack recovery.
- **Two playable gods, switchable (M6).** **Zeus** and **Hades** are both in the world; **V** (rebindable) switches which one you control, with the camera easing across. The other is an **AI companion**: follows 3–6 m behind, catches up with his own teleport (Bolt Step / Shadow Step) if he falls more than 25 m behind or is stuck for 2 s, and fights threats near you (basic attacks plus his Q now and then; never his ultimate). Each god keeps his own health, stamina, weapon and cooldowns. A companion knocked to 0 health is down for 10 s, then gets back up near you. Switching is blocked during cutscenes and has a 1 s cooldown.
- **Hades is as powerful as Zeus**, on the **same keys**, with a different style: Zeus hits from range in big bursts; Hades fights closer, controls crowds and steals life (the Shadow element's status effect).

| Key | Zeus | Hades |
|---|---|---|
| A | Punch combo | Punch combo |
| S | Spear: tap thrust / hold sweep | **Shadow bident**: tap double-thrust / hold wide sweep (cleaves); every hit heals Hades for 10% of the damage |
| W | Bolt Step: lightning teleport up to 8 m | **Shadow Step**: melts into shadow, reappears up to 8 m away (or *behind* the lock-on target within 12 m), 0.25 s untouchable; leaves a **shadow decoy** for 2 s that enemies chase; his next attack within 1 s deals +50% |
| Q | Chain Lightning: hold to keep firing, chains to 4 | **Soul Bolts**: hold to keep firing homing shadow skulls (every 0.35 s, 8 stamina, 16 damage, range 16 m, heal 25% of damage); with no target they fly 14 m ahead |
| D | Lightning Fist: charge, lunge, electrified punch | **Grasp of the Dead**: charge up to 1 s, slam the ground; spectral hands rise in a 3–5 m ring (by charge), 18–40 damage, root enemies for 1–2 s and pull them toward the centre; 15–30 stamina, 2 s cooldown |
| R | Sky Strike: needs ≥50% stamina, spends all | **Skull Cage**: needs ≥50% stamina, spends all; a **red warning ring for 1.5 s** marks the spot (lock-on target or 10 m ahead), then a cage of bone drops (4 m): everything inside is trapped for 4 s and crushed for 1.2 × stamina spent over 3 s; 12 s cooldown. Same fairness rules as the GDD: marker always first, visible through effects, no flashing |
| Passive | Charge build-up | **Lord of the Dead**: +15% damage and +25% stamina regen underground or at night |

- **Hades's look (generated, original design):** tall, ash-grey skin, a short dark beard, black and deep-violet robes over dark bronze armour, a spiked black-iron crown, violet-teal soul-fire eyes and faint shadow wisps trailing from his cloak. Same canvas-face expression system as Zeus. Avoid any film or cartoon Hades (e.g. no flaming blue hair).
- Health + stamina (sprint, dodge, climb). Death respawns at the last bed.
- Combat is a **ranged + melee mix**: the weapon archetype decides the moveset (sword, spear, axe, bow, staff…).

## 6. Time of day: real-time world clock
- **1 real hour = ¼ game day**, so a full game day lasts **4 real hours**.
- Driven by **UTC wall-clock time**, not session time. Every player sees the same time of day:
  `dayFraction = (Date.now() / 1000 % 14400) / 14400` (0 = midnight; choose phase offsets so 0.25 ≈ dawn, 0.5 = noon, 0.75 ≈ dusk).
- One function: `sim/time.ts → getWorldTime(nowMs)`. The sim stores `nowMs` per tick (so it can be synced or overridden later). The view derives sun/moon, sky, fog and lighting from the style-test keyframes (golden hour / dusk / night), extended to a full cycle.
- **Prologue override:** clock frozen at golden hour until the cinematic ends.
- **Player setting "Time of day":** *Live (UTC)* (default) / *Always golden hour* / *Always night*. This is also an accessibility option for players who find dark scenes hard to see, and it guarantees the itch.io demo looks right whatever the real time is.
- **Dev only:** a time-scrub slider in the dev menu.
- Night: darker, fireflies and glowing flora, stronger human patrols. Beds let you rest. Because time is global, sleeping **does not skip** the clock: it restores health and sets respawn.

## 7. Elements
Counter wheel **Light > Shadow > Poison > Lightning > Light**. Hitting the element you beat does 2× damage. Each element also applies a status effect.

| Element | Status | Beats | Weak to | Accent color |
|---|---|---|---|---|
| Light | Blind | Shadow | Lightning | `#FFE08A` |
| Shadow | Lifesteal | Poison | Light | `#5B3A8C` |
| Poison | Damage over time | Lightning | Shadow | `#7BC043` |
| Lightning | Chain / stun | Light | Poison | `#6EC6FF` |

## 8. Weapons, crafting and fusion (core hook)
- **Sources:** starter kit; Forge crafting from gathered materials (wood → bronze → storm iron → mech parts → divine ore); soldier and camp drops; mech drops; chests.
- **Weapons are built from parts** (handle / blade or head / guard) × material × element, assembled from primitives so fused weapons visibly combine parts.
- **Fusion Altar:** combine two weapons.
  - **Discovery table:** specific pairs make named legendaries. Unknown pairs make a generic fused weapon (fallback rule: shape of A, stats averaged + 10%).
  - **Fused weapons keep the fusing god's power:** the result takes that god's element (Zeus → Lightning), named legendaries included (a Light legendary fused by Zeus becomes its Lightning variant).
  - Table is data, keyed by the **sorted pair of weapon IDs**.
- **Fusion Codex:** records every discovery. This is the main sandbox goal.
- **Both roles:** the weapon drives basic attacks, and its element boosts the matching god or spirit ability.
- **Single damage pipeline:** base → element wheel → status → ability boosts.

## 9. Humans (enemies)
- **Soldiers:** spear, archer, shield-bearer; later an engineer who repairs mechs. AI states: patrol → suspicious → alert (calls others) → attack → search → return.
- **Camps:** tents, palisade, watchtower, campfire, loot chest. Clearing a camp marks it on the map. Camps respawn slowly (proposed: each new game day).
- **Forts (M6):** smaller than camps: palisade, watchtower, 3–6 soldiers, loot chest; placed along the route in the Underworld region.
- **Sentry squads (M6):** groups of 3–4 sentries patrol the fields in formation; the leader's visible sight cone is the squad's sight. The first to spot you sounds the horn, then the squad fights. Some squads are led by a **Sentry Captain**: bigger, armoured (light hits do half), slow telegraphed halberd slams; his squad fights harder while he lives and breaks and runs when he falls.
- **Mech drones:** sentry / crawler near lairs.
- Patrols are stronger at night and farther from Olympus.

## 10. Mech encounter: Cerberus Mk. II (first)
Scout → sneak (stay out of the visible **sensor cone**, use cover and shadow) → damage **rear plating** (durability bar, noisy) → **hatch** prompt → slow, dramatic crawl → small **interior** (2–3 rooms, power cores, shaking while the mech moves) → **pilot duel** ("The Warden") → mech powers down → loot + **spirit freed** cutscene (short, skippable).

## 11. Other systems (minimum versions)
- **Base building** at the Refuge: snap-to-grid walls, floors, roofs.
- **Save:** localStorage. Seed, inventory, codex, freed spirits, flags (`prologueDone`, `olympusShattered`), base pieces, cleared camps. Stores IDs only.
- **Audio:** synthesized SFX and procedural ambient music (Web Audio), one mood per biome plus a cinematic sting.
- **Settings and accessibility** (Esc menu, saved per browser):
  - Effect toggles: bloom, god rays, outlines, color grade, particles.
  - **Reduce motion & flashes:** no camera shake, softened explosions and flashes, calmer particles.
  - **Remap keys**, **subtitles/captions** for all dialogue and important sound cues.
  - Also: mouse sensitivity, invert Y, master/music/SFX volume.

## 12. Architecture
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

## 13. Multiplayer-ready rules (from line one)
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

## 14. Art direction
Target: **BotW-like light and atmosphere** with warm, expressive characters (team references: golden-hour vista, warm anime-style characters, bioluminescent night forest). Use the mood, not anyone's characters or designs.
- Toon shading (3–4-tone ramp), soft outlines (inverted hull), rim light, bloom, god rays, ACES tone mapping, color grade, distance haze (blue aerial perspective), painted shader sky with clouds, instanced wind-blown grass that glows when backlit, fireflies, petals and glowing flora at night.
- Characters built from primitives, with **canvas-drawn faces** and swappable expressions (neutral / determined / happy / hurt).
- Palette: sun gold `#FFC870`, sky blue `#7FB2E5`, haze `#C9DCEB`, shadow blue `#3A4E7A`, night `#0E1A3A`, spirit cyan `#4FF0E0`. Materials: marble, bronze `#B87333`, storm iron, rusted mech brass.
- **All assets are generated in code by Claude and approved by the team** before they're registered (`approved: true` on the def). No external downloads. Any third-party files the team adds get credited in `public/ASSETS.md`.
- **Reference implementation:** `docs/reference/style-test.html` (three r170 via CDN). Port its shaders and look into `view/`; don't copy the file wholesale.

## 15. Out of scope this weekend
Networked co-op itself (architecture is ready; it would need a server, which the client-only rule forbids until the team asks), the five surface biomes beyond the Underworld region (after the demo), gods beyond Zeus + Hades, skins, carveable terrain, raids, a story ending, PvP, touch/mobile controls for the 3D game.

## 16. itch.io demo requirements
- **Packaging:** `npm run package` → `artifacts/game.zip` with `index.html` at the zip root (the existing script enforces this). Upload as an **HTML** project, *playable in the browser*.
- **Embed settings on itch.io:** 1280×720 viewport, **fullscreen button on**, "mobile friendly" off.
- **Self-contained:** no CDN or runtime network requests. three.js and Rapier are bundled by Vite. Use `@dimforge/rapier3d-compat`, which inlines its WASM. Any file in `public/` is loaded via `import.meta.env.BASE_URL`.
- **Click-to-start title screen.** The first click unlocks audio (browsers block it before a user gesture) and requests pointer lock. If pointer lock is refused inside the itch iframe, fall back to drag-to-orbit. Show a "click to resume" overlay when the iframe loses focus.
- **Fast first load:** show a loading screen; world generation for the starting area must finish in under ~3 s on a laptop. Generate distant chunks progressively.
- **Performance:** quality presets *Low / Medium / High* (shadow size, grass density, pixel ratio, post effects), with an auto default from a quick FPS probe. Target 60 fps at Medium on an integrated-GPU laptop.
- **Saves:** localStorage keys are namespaced (`weaponcraft:save:v1`) because itch.io serves many games from one domain. Add a "New game" button that clears the save, so judges can replay the prologue.
- **Testing:** Playwright drives Chromium (SwiftShader WebGL) through a deterministic test API (`window.wc`, enabled with `#test`) for smoke, visual-baseline and gameplay-flow tests. `npm run test:ship` runs the smoke suite against the built `dist/` before every upload. Approved screenshot baselines double as the art sign-off record. Details in `CLAUDE.md`.
- **Demo safety:** the dev menu is hidden in production builds unless the URL hash is `#dev`. Time-of-day lock (§6) and the prologue skip on replays are the demo's safety nets.
