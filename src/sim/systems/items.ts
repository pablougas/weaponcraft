import { godDef } from '../defs';
import type { Intent } from '../intents';
import type { Entity, EntityId, PlayerId, WorldState } from '../types';
import { fuse, isKnownWeapon } from '../weapons';
import { despawn, type SimContext } from '../world';

/** Most weapons a player can carry. */
export const INVENTORY_SLOTS = 12;
/** F works on things within this distance of the hero. */
export const INTERACT_RANGE = 2.6;
/** You must stand this close to a Fusion Altar to fuse. */
export const ALTAR_RANGE = 4;

function heroOf(world: WorldState, playerId: PlayerId): Entity | undefined {
  const id = world.players[playerId]?.entityId;
  return id ? world.entities[id] : undefined;
}

function flatDistance(a: Entity, b: Entity): number {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}

/** The nearest pickup or structure within reach of the player's hero. */
export function nearestInteractable(world: WorldState, playerId: PlayerId, range = INTERACT_RANGE): Entity | undefined {
  const hero = heroOf(world, playerId);
  if (!hero) return undefined;
  let best: { entity: Entity; distance: number } | undefined;
  for (const entity of Object.values(world.entities)) {
    if (!entity.pickup && !entity.structure) continue;
    const distance = flatDistance(hero, entity);
    const reach = entity.structure ? Math.max(range, ALTAR_RANGE - 0.5) : range;
    if (distance > reach || Math.abs(hero.position.y - entity.position.y) > 2.5) continue;
    if (!best || distance < best.distance || (distance === best.distance && entity.id < best.entity.id)) best = { entity, distance };
  }
  return best?.entity;
}

function nearAltar(world: WorldState, hero: Entity): EntityId | undefined {
  return Object.values(world.entities).find((e) => e.structure?.kind === 'fusion-altar' && flatDistance(hero, e) <= ALTAR_RANGE)?.id;
}

/** F: pick up the nearest weapon, or open the Fusion Altar. Returns a rejection reason, or null. */
export function interact(ctx: SimContext, playerId: PlayerId): string | null {
  const { world } = ctx;
  const player = world.players[playerId];
  const target = nearestInteractable(world, playerId);
  if (!player || !target) return 'nothing to use';
  if (target.pickup) {
    if (player.inventory.length >= INVENTORY_SLOTS) return 'inventory full';
    const { weaponId } = target.pickup;
    player.inventory.push(weaponId);
    despawn(ctx, target.id);
    ctx.emit('item:picked', { playerId, weaponId, entityId: target.id });
    return null;
  }
  if (target.structure?.kind === 'fusion-altar') {
    ctx.emit('altar:opened', { playerId, altarId: target.id });
    return null;
  }
  if (target.structure?.kind === 'bed') {
    // Rest: back to full health. The world clock is global, so sleeping never skips time (SPEC §6).
    const hero = heroOf(world, playerId);
    if (hero?.health) hero.health.current = hero.health.max;
    if (hero?.stamina) hero.stamina.current = hero.stamina.max;
    ctx.emit('hero:rested', { playerId });
    return null;
  }
  if (target.structure?.kind === 'forge') {
    ctx.emit('forge:used', { playerId });
    return null;
  }
  return 'nothing to use';
}

/** Applies inventory, equip, fuse and dev-give intents. Returns a rejection reason, or null. */
export function applyItemIntent(ctx: SimContext, intent: Extract<Intent, { type: 'player:equip' | 'player:fuse' | 'dev:give' }>): string | null {
  const { world } = ctx;
  const player = world.players[intent.playerId];
  const hero = heroOf(world, intent.playerId);
  if (!player || !hero?.hero) return 'no hero';

  switch (intent.type) {
    case 'dev:give':
      if (!isKnownWeapon(world, intent.weaponId)) return 'unknown weapon';
      if (player.inventory.length >= INVENTORY_SLOTS) return 'inventory full';
      player.inventory.push(intent.weaponId);
      return null;
    case 'player:equip': {
      const weaponId = player.inventory[intent.slot];
      if (weaponId === undefined) return 'empty slot';
      if (hero.hero.attack) return 'busy';
      hero.hero.weaponId = weaponId;
      ctx.emit('weapon:equipped', { playerId: intent.playerId, weaponId });
      return null;
    }
    case 'player:fuse': {
      const { slotA, slotB } = intent;
      const a = player.inventory[slotA];
      const b = player.inventory[slotB];
      if (a === undefined || b === undefined || slotA === slotB) return 'pick two weapons';
      if (!nearAltar(world, hero)) return 'not at an altar';
      // The result keeps the fusing god's power (Zeus → Lightning).
      const result = fuse(world, a, b, intent.playerId, godDef(hero.defId).element);
      // Both weapons are used up; the result takes the first slot.
      const wasEquipped = hero.hero.weaponId === a || hero.hero.weaponId === b;
      for (const slot of [slotA, slotB].sort((x, y) => y - x)) player.inventory.splice(slot, 1);
      player.inventory.splice(Math.min(slotA, slotB), 0, result.weapon.id);
      if (wasEquipped && !player.inventory.includes(hero.hero.weaponId)) hero.hero.weaponId = result.weapon.id;
      ctx.emit('fusion:created', {
        playerId: intent.playerId,
        resultId: result.weapon.id,
        key: result.key,
        legendary: result.legendary,
        newDiscovery: result.newDiscovery,
        inputs: [a, b],
      });
      return null;
    }
    default:
      return 'unknown intent';
  }
}
