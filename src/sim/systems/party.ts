import { isHittable } from '../combat';
import { ticks } from '../constants';
import { godDef } from '../defs';
import { groundAt, regionOf, sameRegion } from '../regions';
import type { Entity, EntityId, HeroState, PlayerId, PlayerState } from '../types';
import type { SimContext } from '../world';
import { castAbility, doAction, newHeroState } from './hero';
import { isResting } from './rest';

/**
 * Two gods, one player (SPEC §5, M6): V switches which god you control; the
 * other is an AI companion that follows 3–6 m behind, catches up with his
 * own teleport when left behind or stuck, and helps against hostiles near
 * you (basic attacks and his Q now and then, never his ultimate).
 */
export const SWITCH_COOLDOWN_TICKS = ticks(1);
const FOLLOW_NEAR = 3;
const FOLLOW_FAR = 6;
const CATCH_UP_DISTANCE = 25;
const STUCK_TICKS = ticks(2);
/** Hostiles this close to the leader draw the companion in. */
const HELP_RADIUS = 12;
const MELEE_RANGE = 2.2;

type HeroEntity = Entity & { hero: HeroState };

/** The player whose party includes this god but who isn't controlling him, if any. */
export function companionOf(ctx: SimContext, entity: Entity): PlayerState | undefined {
  return Object.values(ctx.world.players).find((p) => p.party?.includes(entity.id) && p.entityId !== entity.id);
}

/** Hades steps out of the story and into the party (M6). */
export function recruitHades(ctx: SimContext): EntityId | null {
  const { world } = ctx;
  const npc = Object.values(world.entities).find((e) => e.defId === 'hades' && e.npc);
  const player = Object.values(world.players)[0];
  if (!npc || !player?.entityId) return null;
  const def = godDef('hades');
  delete npc.npc;
  npc.ownerId = player.id;
  npc.body = { ...def.body };
  npc.health = { current: def.maxHealth, max: def.maxHealth };
  npc.stamina = { current: def.maxStamina, max: def.maxStamina };
  npc.hero = newHeroState(def.starterWeaponId);
  if (def.passive) npc.hero.passiveDamage = def.passive.damageMultiplier;
  npc.hero.lastSafe = { ...npc.position };
  player.party = [player.entityId, npc.id];
  player.switchReadyTick = 0;
  ctx.emit('party:joined', { playerId: player.id, entityId: npc.id, defId: 'hades' });
  return npc.id;
}

/** V: control the other god. */
export function switchCharacter(ctx: SimContext, playerId: PlayerId): string | null {
  const { world } = ctx;
  const player = world.players[playerId];
  if (!player?.party || player.party.length < 2) return 'nobody to switch to';
  if (world.tick < (player.switchReadyTick ?? 0)) return 'cooling down';
  const current = player.entityId ? world.entities[player.entityId] : undefined;
  const nextId = player.party.find((id) => id !== player.entityId && world.entities[id]?.hero);
  const next = nextId ? world.entities[nextId] : undefined;
  if (!next?.hero) return 'nobody to switch to';
  if (next.hero.down != null) return 'down';
  // Neither god keeps the other's held input (or the companion AI's steering).
  for (const god of [current, next]) {
    if (!god?.hero) continue;
    god.hero.move = { x: 0, z: 0 };
    god.hero.sprint = false;
    god.hero.abilityHeld = false;
    god.hero.chargeHeld = false;
    god.hero.weaponHeld = false;
    god.hero.lockTarget = null;
  }
  player.entityId = next.id;
  player.switchReadyTick = world.tick + SWITCH_COOLDOWN_TICKS;
  ctx.emit('party:switched', { playerId, entityId: next.id, defId: next.defId });
  return null;
}

/** Hostile and hittable, in the same region, within `radius` of a point. */
function nearestHostile(ctx: SimContext, from: Entity, radius: number): Entity | undefined {
  let best: { e: Entity; d: number } | undefined;
  for (const e of Object.values(ctx.world.entities)) {
    if (!e.creature?.hostile || !isHittable(e) || !sameRegion(e, from)) continue;
    const d = Math.hypot(e.position.x - from.position.x, e.position.z - from.position.z);
    if (d <= radius && (!best || d < best.d || (d === best.d && e.id < best.e.id))) best = { e, d };
  }
  return best?.e;
}

/** Writes the companions' inputs for this tick (authority only). */
export function updateCompanions(ctx: SimContext): void {
  if (!ctx.isAuthority) return;
  const { world } = ctx;
  for (const player of Object.values(world.players)) {
    if (!player.party || !player.entityId) continue;
    const leader = world.entities[player.entityId];
    if (!leader?.hero) continue;
    for (const id of player.party) {
      if (id === player.entityId) continue;
      const companion = world.entities[id] as HeroEntity | undefined;
      if (!companion?.hero || isResting(companion.hero)) continue;
      driveCompanion(ctx, companion, leader as HeroEntity);
    }
  }
}

function driveCompanion(ctx: SimContext, self: HeroEntity, leader: HeroEntity): void {
  const hero = self.hero;
  hero.move = { x: 0, z: 0 };
  hero.sprint = false;
  hero.abilityHeld = false;
  if (ctx.world.cutscene || isResting(leader.hero)) return;
  const dx = leader.position.x - self.position.x;
  const dz = leader.position.z - self.position.z;
  const distance = Math.hypot(dx, dz);

  // Left behind, in another region, or stuck: catch up with a teleport to just behind the leader.
  const stuck = (hero.companionStuck ?? 0) >= STUCK_TICKS;
  if (!sameRegion(self, leader) || distance > CATCH_UP_DISTANCE || stuck) {
    // Beside and a little behind, out of the follow camera's line of sight.
    const back = leader.rotationY + Math.PI;
    const x = leader.position.x + Math.sin(back) * 1.2 - Math.cos(back) * 2.6;
    const z = leader.position.z + Math.cos(back) * 1.2 + Math.sin(back) * 2.6;
    const from = { ...self.position };
    self.region = leader.region;
    self.position = { x, y: Math.max(groundAt(regionOf(leader), x, z), leader.position.y), z };
    self.rotationY = leader.rotationY;
    hero.vy = 0;
    hero.companionStuck = 0;
    hero.lastSafe = { ...self.position };
    const blink = godDef(self.defId).blink;
    ctx.emit('ability:blink', { casterId: self.id, abilityId: blink?.id ?? 'catch-up', from, to: { ...self.position }, targetIds: [] });
    return;
  }

  // Help in fights near the leader.
  const threat = nearestHostile(ctx, leader, HELP_RADIUS);
  if (threat) {
    const tx = threat.position.x - self.position.x;
    const tz = threat.position.z - self.position.z;
    const d = Math.hypot(tx, tz);
    self.rotationY = Math.atan2(tx, tz);
    hero.aimYaw = self.rotationY;
    hero.lockTarget = threat.id;
    if (d > MELEE_RANGE) {
      hero.move = { x: tx / d, z: tz / d };
      hero.sprint = d > 8;
    }
    // His Q every couple of seconds while he has the stamina for it; otherwise melee.
    const q = godDef(self.defId).ability;
    if (d <= 14 && ctx.world.tick % ticks(2) === 0 && (self.stamina?.current ?? 0) > 40) castAbility(ctx, self);
    else if (d <= MELEE_RANGE + 0.4 && ctx.world.tick % ticks(0.5) === 0) doAction(ctx, self, hero.weaponId ? 'lightAttack' : 'punch');
    void q;
    trackStuck(self, d > MELEE_RANGE);
    return;
  }
  hero.lockTarget = null;

  // Follow 3–6 m behind, off to the leader's side (so he isn't between you and the camera).
  const sideX = -Math.cos(leader.rotationY) * 2.4 - Math.sin(leader.rotationY) * 1.5;
  const sideZ = Math.sin(leader.rotationY) * 2.4 - Math.cos(leader.rotationY) * 1.5;
  const gx = leader.position.x + sideX - self.position.x;
  const gz = leader.position.z + sideZ - self.position.z;
  const toSpot = Math.hypot(gx, gz);
  if (distance > FOLLOW_FAR || (distance > FOLLOW_NEAR && hero.moving) || (toSpot > 1.5 && distance < FOLLOW_FAR && !leader.hero.moving)) {
    hero.move = toSpot > 0.01 ? { x: gx / toSpot, z: gz / toSpot } : { x: 0, z: 0 };
    hero.sprint = distance > 10 || leader.hero.sprinting;
    trackStuck(self, true);
  } else {
    trackStuck(self, false);
  }
}

function trackStuck(self: HeroEntity, tryingToMove: boolean): void {
  const hero = self.hero;
  const last = hero.companionLast;
  const moved = last ? Math.hypot(self.position.x - last.x, self.position.z - last.z) : 1;
  hero.companionStuck = tryingToMove && moved < 0.02 ? (hero.companionStuck ?? 0) + 1 : 0;
  hero.companionLast = { ...self.position };
}
