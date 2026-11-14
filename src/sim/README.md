# src/sim

All game state as plain serializable data, plus the rules that change it
(SPEC §13, CLAUDE.md architecture rules). No three.js, DOM or `Math.random()`
in here.

- `types.ts` — `WorldState`, entities, players, flags.
- `world.ts` — `createWorld()`, `spawn()` / `despawn()` with stable IDs, `SimContext` (`isAuthority`, `emit`).
- `tick.ts` — `tickWorld()`: one fixed 30 Hz step that applies intents and runs systems.
- `intents.ts` / `events.ts` — the plain-data messages in and out of the sim.
- `rng.ts` — seeded `rng(seed, stream)` and `worldRng(world, stream)`.
- `time.ts` — `getWorldTime(nowMs, settings)`, the only source of time of day.
- `serialize.ts` — one serializer for saves and future network snapshots.

The engine (`src/engine/session.ts`) drives it: it queues intents through a
`Transport`, calls `tickWorld()` from the fixed-step loop, and forwards events
to the `EventBus`.
