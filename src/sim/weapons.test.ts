import { describe, expect, it } from 'vitest';
import { FUSIONS, weapons } from '../content/weapons';
import { MATERIALS } from '../content/weapons/materials';
import { deserialize, serialize } from './serialize';
import { fuse, genericFusion, pairKey, recipeFor, weaponData } from './weapons';
import { createWorld } from './world';

describe('weapon registry', () => {
  it('has 8 base weapons, the gods’ own (Hades’s Shadow Bident, Poseidon’s Sea Trident) and 6 named legendaries, with unique IDs', () => {
    expect(weapons.filter((w) => !w.legendary && w.id !== 'shadow-bident' && w.id !== 'sea-trident')).toHaveLength(8);
    expect(weapons.filter((w) => w.legendary)).toHaveLength(6);
    expect(new Set(weapons.map((w) => w.id)).size).toBe(weapons.length);
  });

  it('every recipe uses real weapons, results are legendaries, and no pair is listed twice', () => {
    const ids = new Set(weapons.map((w) => w.id));
    const keys = new Set<string>();
    for (const r of FUSIONS) {
      expect(ids.has(r.a) && ids.has(r.b)).toBe(true);
      expect(weapons.find((w) => w.id === r.result)?.legendary).toBe(true);
      expect(keys.has(pairKey(r.a, r.b))).toBe(false);
      keys.add(pairKey(r.a, r.b));
    }
    expect(new Set(FUSIONS.map((r) => r.result)).size).toBe(6);
  });

  it('stronger materials hit harder', () => {
    expect(weaponData(undefined, 'storm-axe').light.damage).toBeGreaterThan(Math.round(14 * MATERIALS.bronze.power));
    expect(weaponData(undefined, 'starter-spear').light.damage).toBe(10);
  });
});

describe('fusion discovery table', () => {
  it('keys pairs by sorted IDs, so order never matters for named recipes', () => {
    expect(pairKey('b', 'a')).toBe('a+b');
    expect(recipeFor('sunlit-sword', 'starter-spear')).toBe('dawnbringer');
    expect(recipeFor('starter-spear', 'sunlit-sword')).toBe('dawnbringer');
    expect(recipeFor('oak-staff', 'sunlit-sword')).toBeUndefined();
  });

  it('a known pair makes the named legendary and a codex entry, once', () => {
    const world = createWorld(1, 0);
    const first = fuse(world, 'storm-axe', 'starter-spear', 'p1');
    expect(first).toMatchObject({ legendary: true, newDiscovery: true, weapon: { id: 'thunderclap-halberd' } });
    expect(world.codex[pairKey('storm-axe', 'starter-spear')]).toMatchObject({ resultId: 'thunderclap-halberd', legendary: true, by: 'p1' });
    expect(fuse(world, 'starter-spear', 'storm-axe', 'p1').newDiscovery).toBe(false);
  });

  it('an unknown pair follows the fallback rule: shape of A, element of B, stats averaged + 10%', () => {
    const a = weaponData(undefined, 'oak-staff');
    const b = weaponData(undefined, 'sunlit-sword');
    const fused = genericFusion(a, b);
    expect(fused).toMatchObject({ archetype: 'staff', element: 'light', material: 'bronze', legendary: false, fusedFrom: ['oak-staff', 'sunlit-sword'] });
    expect(fused.light.damage).toBe(Math.round(((a.light.damage + b.light.damage) / 2) * 1.1));
    expect(fused.light.hitTick).toBe(a.light.hitTick);
    expect(fused.parts.head).toBe(a.parts.head);
    expect(fused.parts.guard).toBe(b.parts.guard);
    // Order matters for the fallback (A's shape, B's element).
    expect(genericFusion(b, a)).toMatchObject({ archetype: 'sword', element: null });
  });

  it('the fusing god\'s element wins: Zeus\'s fusions are Lightning, legendaries included', () => {
    const world = createWorld(1, 0);
    expect(fuse(world, 'oak-staff', 'sunlit-sword', 'p1', 'lightning').weapon).toMatchObject({ archetype: 'staff', element: 'lightning' });
    const legend = fuse(world, 'starter-spear', 'sunlit-sword', 'p1', 'lightning');
    expect(legend.weapon).toMatchObject({ id: 'dawnbringer@lightning', name: 'Dawnbringer', element: 'lightning', legendary: true });
    // Already Lightning: the registry legendary itself, no variant.
    expect(fuse(world, 'starter-spear', 'storm-axe', 'p1', 'lightning').weapon.id).toBe('thunderclap-halberd');
  });

  it('fused weapons are stored in the world and survive a save', () => {
    const world = createWorld(1, 0);
    const result = fuse(world, 'oak-staff', 'sunlit-sword', 'p1');
    const restored = deserialize(serialize(world));
    expect(weaponData(restored, result.weapon.id)).toEqual(result.weapon);
    expect(Object.keys(restored.codex)).toEqual([result.key]);
  });
});
