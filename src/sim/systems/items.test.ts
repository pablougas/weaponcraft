import { describe, expect, it } from 'vitest';
import { applyDamage, hasStatus, updateStatuses } from '../combat';
import type { Intent } from '../intents';
import { ALTAR_SPOT, ensureMeadowPopulated, MEADOW_WEAPONS } from '../populate';
import { deserialize, serialize } from '../serialize';
import { WATER_LEVEL } from '../terrain/meadow';
import { groundHeightAt } from '../terrain/meadow-rocks';
import { tickWorld } from '../tick';
import type { Entity } from '../types';
import { pairKey } from '../weapons';
import { createSimContext, createWorld } from '../world';
import { nearRock } from './wildlife';

function meadow() {
  const world = createWorld(7, 0);
  ensureMeadowPopulated(world);
  const hero = world.entities[world.players.p1.entityId!] as Entity & { hero: NonNullable<Entity['hero']> };
  const player = world.players.p1;
  const run = (intents: Intent[], ticks = 1) => {
    const events = [];
    for (let t = 0; t < ticks; t += 1) events.push(...tickWorld(world, { nowMs: 0, isAuthority: true, intents: t === 0 ? intents : [] }));
    return events;
  };
  const standAt = (x: number, z: number) => run([{ type: 'dev:teleport', playerId: 'p1', x, z }]);
  const press = (action: 'interact'): Intent => ({ type: 'player:action', playerId: 'p1', action });
  return { world, hero, player, run, standAt, press };
}

describe('weapons in the meadow', () => {
  it('are on dry ground, clear of rocks', () => {
    for (const w of [...MEADOW_WEAPONS, { ...ALTAR_SPOT, weaponId: 'altar' }]) {
      expect(groundHeightAt(w.x, w.z), w.weaponId).toBeGreaterThan(WATER_LEVEL + 2);
      expect(nearRock(w.x, w.z, 0.5), w.weaponId).toBe(false);
    }
  });

  it('F picks up the nearest one into the inventory and removes it from the world', () => {
    const { world, player, run, standAt, press } = meadow();
    const spot = MEADOW_WEAPONS[0];
    standAt(spot.x + 1, spot.z);
    const events = run([press('interact')]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'item:picked', weaponId: spot.weaponId }));
    expect(player.inventory).toEqual(['starter-spear', spot.weaponId]);
    expect(Object.values(world.entities).filter((e) => e.pickup)).toHaveLength(2);
  });

  it('F with nothing nearby is rejected', () => {
    const { run, standAt, press } = meadow();
    standAt(-30, -30);
    expect(run([press('interact')])).toContainEqual(expect.objectContaining({ type: 'intent:rejected', reason: 'nothing to use' }));
  });
});

describe('equip and fuse', () => {
  it('equips a weapon from a slot', () => {
    const { hero, run } = meadow();
    run([{ type: 'dev:give', playerId: 'p1', weaponId: 'storm-axe' }]);
    run([{ type: 'player:equip', playerId: 'p1', slot: 1 }]);
    expect(hero.hero.weaponId).toBe('storm-axe');
  });

  it('fusing a known pair at the altar makes the named legendary and a codex entry', () => {
    const { world, hero, player, run, standAt, press } = meadow();
    run([{ type: 'dev:give', playerId: 'p1', weaponId: 'sunlit-sword' }]);
    standAt(ALTAR_SPOT.x - 1.5, ALTAR_SPOT.z);
    expect(run([press('interact')])).toContainEqual(expect.objectContaining({ type: 'altar:opened', playerId: 'p1' }));
    const events = run([{ type: 'player:fuse', playerId: 'p1', slotA: 1, slotB: 0 }]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'fusion:created', resultId: 'dawnbringer', legendary: true, newDiscovery: true }));
    expect(player.inventory).toEqual(['dawnbringer']);
    // The equipped starter spear was used up, so the result is equipped.
    expect(hero.hero.weaponId).toBe('dawnbringer');
    expect(world.codex[pairKey('starter-spear', 'sunlit-sword')]).toMatchObject({ resultId: 'dawnbringer', inputs: ['sunlit-sword', 'starter-spear'] });
  });

  it('an unknown pair makes a saved generic fused weapon', () => {
    const { world, player, run, standAt } = meadow();
    run([{ type: 'dev:give', playerId: 'p1', weaponId: 'oak-staff' }]);
    run([{ type: 'dev:give', playerId: 'p1', weaponId: 'sunlit-sword' }]);
    standAt(ALTAR_SPOT.x - 1.5, ALTAR_SPOT.z);
    run([{ type: 'player:fuse', playerId: 'p1', slotA: 1, slotB: 2 }]);
    expect(player.inventory).toEqual(['starter-spear', 'fused:oak-staff|sunlit-sword']);
    const restored = deserialize(serialize(world));
    expect(restored.customWeapons['fused:oak-staff|sunlit-sword']).toMatchObject({ archetype: 'staff', element: 'light' });
  });

  it('fusing away from the altar, or the same slot twice, is rejected', () => {
    const { player, run, standAt } = meadow();
    run([{ type: 'dev:give', playerId: 'p1', weaponId: 'oak-staff' }]);
    standAt(-30, -30);
    expect(run([{ type: 'player:fuse', playerId: 'p1', slotA: 0, slotB: 1 }])).toContainEqual(expect.objectContaining({ reason: 'not at an altar' }));
    standAt(ALTAR_SPOT.x - 1.5, ALTAR_SPOT.z);
    expect(run([{ type: 'player:fuse', playerId: 'p1', slotA: 1, slotB: 1 }])).toContainEqual(expect.objectContaining({ reason: 'pick two weapons' }));
    expect(player.inventory).toEqual(['starter-spear', 'oak-staff']);
  });
});

describe('damage pipeline: statuses and boosts', () => {
  const setup = () => {
    const { world, hero } = meadow();
    const { ctx } = createSimContext(world, true);
    const dummy = (element: string) => Object.values(world.entities).find((e) => e.defId === 'practice-dummy' && e.element === element)!;
    return { world, ctx, hero, dummy };
  };

  it('poison ticks damage once a second for 4 s', () => {
    const { world, ctx, dummy } = setup();
    const target = dummy('shadow');
    applyDamage(ctx, target.id, 5, null, 'light', 'poison');
    expect(hasStatus(target, 'poison')).toBe(true);
    const after = target.health!.current;
    for (let t = 0; t < 130; t += 1) updateStatuses(createSimContext(world, true).ctx);
    expect(target.health!.current).toBe(after - 3 * 4);
    expect(hasStatus(target, 'poison')).toBe(false);
  });

  it('light blinds, lightning stuns, shadow heals the attacker', () => {
    const { ctx, hero, dummy } = setup();
    applyDamage(ctx, dummy('poison').id, 5, hero.id, 'light', 'light');
    expect(hasStatus(dummy('poison'), 'blind')).toBe(true);
    applyDamage(ctx, dummy('shadow').id, 5, hero.id, 'light', 'lightning');
    expect(hasStatus(dummy('shadow'), 'stun')).toBe(true);
    hero.health!.current = 50;
    applyDamage(ctx, dummy('light').id, 20, hero.id, 'light', 'shadow');
    expect(hero.health!.current).toBe(55);
  });

  it('an ability is boosted only when the equipped weapon shares its element', () => {
    const { ctx, hero, dummy } = setup();
    expect(applyDamage(ctx, dummy('shadow').id, 20, hero.id, 'ability', 'lightning')).toBe(25); // starter spear: lightning
    hero.hero.weaponId = 'sunlit-sword';
    expect(applyDamage(ctx, dummy('poison').id, 20, hero.id, 'ability', 'lightning')).toBe(20);
  });
});

describe('older saves', () => {
  it('a pre-M4 save gains the altar, the weapons, dummy elements and an inventory on load', () => {
    const { world } = meadow();
    for (const e of Object.values(world.entities)) {
      if (e.pickup || e.structure) delete world.entities[e.id];
      delete e.element;
    }
    const old = JSON.parse(serialize(world));
    delete old.world.flags.armoryPlaced;
    delete old.world.codex;
    delete old.world.customWeapons;
    delete old.world.players.p1.inventory;
    const restored = deserialize(JSON.stringify(old));
    ensureMeadowPopulated(restored);
    expect(Object.values(restored.entities).filter((e) => e.structure)).toHaveLength(1);
    expect(Object.values(restored.entities).filter((e) => e.pickup)).toHaveLength(3);
    expect(Object.values(restored.entities).filter((e) => e.defId === 'practice-dummy').map((e) => e.element).sort()).toEqual(['light', 'poison', 'shadow']);
    expect(restored.players.p1.inventory).toEqual(['starter-spear']);
  });
});
