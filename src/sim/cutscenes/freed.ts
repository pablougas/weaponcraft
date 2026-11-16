import { ensureSeaGate } from '../systems/sea-gate';
import { ticks } from '../constants';
import { GROTTO, groundAt } from '../regions';
import { CERBERUS_HOUND } from '../terrain/underworld';
import type { Entity, EntityId, HeroState, Vec3 } from '../types';
import { spawn, type SimContext } from '../world';

/**
 * "Cerberus Freed" (SPEC §10, M7; team story, Nov 15): the Warden has fallen.
 * The conduits feeding on the hound burst, his chains snap, Cerberus rises and
 * howls; Hades walks up to him and they are reunited; his fire flows into both
 * gods (Three-Fold Howl on E). Then a spout of water rises and Poseidon steps
 * out: he couldn't reach his brothers until that machine was beaten. Runs in
 * sim ticks; the view draws it. Skippable once seen. Cerberus and Poseidon
 * stay at the Gates afterwards.
 */
export const FREED_ID = 'cerberus-freed';

export const FREED_BEATS = {
  powerDown: 0,
  /** The conduits from the hound burst. */
  conduits: ticks(1),
  /** The chains snap. */
  chains: ticks(2.5),
  /** Cerberus rises, his fire returning. */
  rise: ticks(3.5),
  /** The Three-Fold Howl. */
  howl: ticks(5.5),
  /** Hades walks up to him. */
  reunion: ticks(7.5),
  lineHades: ticks(10),
  /** Cerberus lowers his three heads to Hades. */
  nuzzle: ticks(13),
  /** His fire flows into both gods. */
  bond: ticks(14.5),
  /** A spout of water rises from the ground… */
  poseidon: ticks(17),
  /** …and Poseidon steps out. */
  poseidonOut: ticks(18.5),
  linePoseidon1: ticks(20.5),
  // Spaced so each spoken line ends before the next (the gods' voices, Nov 15).
  lineZeus: ticks(35.5),
  linePoseidon2: ticks(40.5),
  end: ticks(51),
} as const;

export type FreedBeat = keyof typeof FREED_BEATS;

/** How long Hades takes to walk up to Cerberus, and Poseidon to walk over from the spout. */
const HADES_WALK = ticks(2.5);
const POSEIDON_WALK = ticks(2);

export function freedTicks(world: { cutscene: { id: string; startTick: number } | null; tick: number }): number | null {
  return world.cutscene?.id === FREED_ID ? world.tick - world.cutscene.startTick : null;
}

/** The scene's places (world positions on the Gates' plaza), from the hound's spot and heading. */
export function freedPoints(): Record<'hound' | 'reunion' | 'zeus' | 'hadesStart' | 'spring' | 'poseidon', Vec3> {
  const ahead = { x: Math.sin(CERBERUS_HOUND.yaw), z: Math.cos(CERBERUS_HOUND.yaw) };
  const across = { x: -ahead.z, z: ahead.x };
  const at = (forward: number, side: number): Vec3 => {
    const x = GROTTO.center.x + CERBERUS_HOUND.x + ahead.x * forward + across.x * side;
    const z = GROTTO.center.z + CERBERUS_HOUND.z + ahead.z * forward + across.z * side;
    return { x, y: groundAt('underworld', x, z), z };
  };
  return {
    hound: at(0, 0),
    // In front of his heads.
    reunion: at(6, 0),
    zeus: at(10, 3.5),
    hadesStart: at(10.5, 1.2),
    // The spout rises out on the plaza, past the gods.
    spring: at(17, -4),
    poseidon: at(13, -1.5),
  };
}

function god(world: { entities: Record<EntityId, Entity> }, defId: string): (Entity & { hero: HeroState }) | undefined {
  return Object.values(world.entities).find((e): e is Entity & { hero: HeroState } => e.defId === defId && !!e.hero);
}

export function findPoseidon(world: { entities: Record<EntityId, Entity> }): Entity | undefined {
  return Object.values(world.entities).find((e) => e.defId === 'poseidon' && !!e.npc);
}

const faceTo = (e: Entity, to: Vec3) => { e.rotationY = Math.atan2(to.x - e.position.x, to.z - e.position.z); };

/** Puts a god on the spot, standing, healed and still. */
function stand(e: Entity & { hero: HeroState }, at: Vec3, lookAt: Vec3): void {
  e.region = 'underworld';
  e.position = { ...at };
  faceTo(e, lookAt);
  Object.assign(e.hero, {
    move: { x: 0, z: 0 }, sprint: false, jumpHeld: false, lockTarget: null, attack: null, charge: null, ultimate: null,
    dodge: null, blink: null, vy: 0, grounded: true, down: null, rest: null, resetting: null,
  });
  if (e.health && e.health.current <= 0) e.health.current = e.health.max;
  e.hero.lastSafe = { ...at };
}

/** Starts the scene (a moment after the Warden falls). */
export function startFreed(ctx: SimContext, _causeId?: EntityId): void {
  const { world } = ctx;
  if (world.cutscene || world.flags.cerberusFreed) return;
  const players = Object.values(world.players);
  const skippable = players.length > 0 && players.every((p) => p.seenCutscenes?.includes(FREED_ID));
  const points = freedPoints();
  world.cutscene = { id: FREED_ID, startTick: world.tick, skippable, points };
  const zeus = god(world, 'zeus');
  const hades = god(world, 'hades');
  if (zeus) stand(zeus, points.zeus, points.hound);
  if (hades) stand(hades, points.hadesStart, points.hound);
  ctx.emit('cutscene:start', { cutsceneId: FREED_ID, skippable });
}

/** Advances the scene by a tick (after the heroes' own update, so walking shows). */
export function updateFreed(ctx: SimContext): void {
  const { world } = ctx;
  const t = freedTicks(world);
  if (t === null) return;
  const points = freedPoints();
  for (const [beat, at] of Object.entries(FREED_BEATS) as Array<[FreedBeat, number]>) {
    if (t === at && beat !== 'end') ctx.emit('cutscene:beat', { cutsceneId: FREED_ID, beat });
  }
  const zeus = god(world, 'zeus');
  const hades = god(world, 'hades');

  // Hades walks up to Cerberus.
  if (hades && t >= FREED_BEATS.reunion && t <= FREED_BEATS.reunion + HADES_WALK) {
    const f = (t - FREED_BEATS.reunion) / HADES_WALK;
    const x = points.hadesStart.x + (points.reunion.x - points.hadesStart.x) * f;
    const z = points.hadesStart.z + (points.reunion.z - points.hadesStart.z) * f;
    hades.position = { x, y: groundAt('underworld', x, z), z };
    faceTo(hades, points.hound);
    hades.hero.moving = f < 1;
  }

  // Poseidon: out of the spout, over to his brothers.
  if (t === FREED_BEATS.poseidonOut && !findPoseidon(world)) spawnPoseidon(ctx, points.spring);
  const poseidon = findPoseidon(world);
  if (poseidon && t >= FREED_BEATS.poseidonOut && t <= FREED_BEATS.poseidonOut + POSEIDON_WALK) {
    const f = (t - FREED_BEATS.poseidonOut) / POSEIDON_WALK;
    const x = points.spring.x + (points.poseidon.x - points.spring.x) * f;
    const z = points.spring.z + (points.poseidon.z - points.spring.z) * f;
    poseidon.position = { x, y: groundAt('underworld', x, z), z };
    poseidon.data.walking = f < 1;
    if (zeus) faceTo(poseidon, zeus.position);
  }
  // The brothers turn to him.
  if (t >= FREED_BEATS.poseidon) {
    const look = poseidon?.position ?? points.spring;
    if (zeus) faceTo(zeus, look);
    if (hades && t >= FREED_BEATS.poseidonOut) faceTo(hades, look);
  }
  if (t >= FREED_BEATS.end) finishFreed(ctx, false);
}

function spawnPoseidon(ctx: SimContext, at: Vec3): void {
  const id = spawn(ctx, 'poseidon', { position: { ...at } });
  Object.assign(ctx.world.entities[id], { npc: { name: 'Poseidon' }, body: { radius: 0.4, height: 2.1 }, region: 'underworld' } satisfies Partial<Entity>);
}

function finishFreed(ctx: SimContext, skipped: boolean): void {
  const { world } = ctx;
  world.cutscene = null;
  world.flags.cerberusFreed = true;
  const points = freedPoints();
  // Everyone where the scene leaves them (also when it's skipped).
  const hades = god(world, 'hades');
  const zeus = god(world, 'zeus');
  if (hades) {
    hades.position = { ...points.reunion };
    hades.hero.moving = false;
    hades.hero.lastSafe = { ...points.reunion };
  }
  if (!findPoseidon(world)) spawnPoseidon(ctx, points.poseidon);
  const poseidon = findPoseidon(world)!;
  poseidon.position = { ...points.poseidon };
  poseidon.data.walking = false;
  if (zeus) faceTo(poseidon, zeus.position);
  for (const player of Object.values(world.players)) {
    player.seenCutscenes = [...new Set([...(player.seenCutscenes ?? []), FREED_ID])];
  }
  ctx.emit('cutscene:end', { cutsceneId: FREED_ID, skipped });
  ctx.emit('spirit:freed', { spiritId: 'cerberus' });
  world.objective = 'brothers-reunited';
  ctx.emit('objective:set', { objectiveId: 'brothers-reunited' });
  // Poseidon's spout stays open: a gate to his sea (team request, Nov 15).
  ensureSeaGate(ctx);
}

export function skipFreed(ctx: SimContext): string | null {
  if (ctx.world.cutscene?.id !== FREED_ID) return 'nothing to skip';
  if (!ctx.world.cutscene.skippable) return 'not skippable the first time';
  finishFreed(ctx, true);
  return null;
}
