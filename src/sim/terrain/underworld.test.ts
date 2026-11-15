import { describe, expect, it } from 'vitest';
import { FIELDS, FORT_RADIUS, FORT_SPOTS, GATES, pathX, SPIRES, spireBase, TUNNEL, underworldLocalHeight as h } from './underworld';

/** Steepest slope (degrees) at (x, z), from the four grid neighbours 2.5 m away. */
function slopeDeg(x: number, z: number): number {
  const s = 2.5;
  const dx = (h(x + s, z) - h(x - s, z)) / (2 * s);
  const dz = (h(x, z + s) - h(x, z - s)) / (2 * s);
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
}

describe('Underworld topography', () => {
  it('the main path stays walkable from the tunnel mouth to the Gates', () => {
    let worst = 0;
    for (let z = TUNNEL.toZ; z > GATES.z; z -= 1) {
      for (const off of [-3, 0, 3]) worst = Math.max(worst, slopeDeg(pathX(z) + off, z));
    }
    // The controller climbs up to 52°; keep the route comfortably gentle.
    expect(worst).toBeLessThan(25);
  });

  it('fort interiors and the Gates plaza are flat', () => {
    for (const fort of FORT_SPOTS) {
      for (let a = 0; a < 6.28; a += 0.5) {
        const r = FORT_RADIUS - 2;
        expect(Math.abs(h(fort.x + Math.cos(a) * r, fort.z + Math.sin(a) * r) - h(fort.x, fort.z))).toBeLessThan(1.5);
      }
    }
    for (let a = 0; a < 6.28; a += 0.5) expect(Math.abs(h(GATES.x + Math.cos(a) * 50, GATES.z + Math.sin(a) * 50))).toBeLessThan(0.5);
  });

  it('has real highlands: tall terraces and cliffs away from the path', () => {
    let tall = 0;
    let steep = 0;
    let samples = 0;
    let max = 0;
    for (let x = FIELDS.minX + 40; x < FIELDS.maxX - 40; x += 5) {
      for (let z = FIELDS.minZ + 40; z < FIELDS.maxZ - 10; z += 5) {
        if (Math.abs(x - pathX(z)) < 40) continue;
        samples += 1;
        const y = h(x, z);
        max = Math.max(max, y);
        if (y > 8) tall += 1;
        if (slopeDeg(x, z) > 52) steep += 1;
      }
    }
    console.log(`highlands: max ${max.toFixed(1)} m, ${((100 * tall) / samples).toFixed(0)}% above 8 m, ${((100 * steep) / samples).toFixed(0)}% cliff (>52°)`);
    expect(max).toBeGreaterThan(18);
    expect(tall / samples).toBeGreaterThan(0.15);
    // Mostly climbable: cliffs are accents, not a maze.
    expect(steep / samples).toBeLessThan(0.2);
  });

  it('spires sit at or below the ground all round them', () => {
    for (const spire of SPIRES) expect(spireBase(spire)).toBeLessThanOrEqual(h(spire.x, spire.z) - 1);
  });
});
