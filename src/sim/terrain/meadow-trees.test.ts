import { describe, expect, it } from 'vitest';
import { createLook } from '../../view/look';
import { buildTrees } from '../../view/meadow/props';
import { rng } from '../rng';
import { MEADOW_LAYOUT_STATE_AFTER_ROCKS } from './meadow-rocks';
import { MEADOW_TREES } from './meadow-trees';

describe('meadow trees', () => {
  it('the sim places every trunk exactly under a drawn tree', () => {
    const layout = rng(0, 'meadow', MEADOW_LAYOUT_STATE_AFTER_ROCKS);
    const drawn = buildTrees(createLook(1), () => layout.next()).children;
    expect(MEADOW_TREES).toHaveLength(drawn.length);
    expect(MEADOW_TREES).toHaveLength(61);
    MEADOW_TREES.forEach((tree, i) => {
      expect(tree.x).toBeCloseTo(drawn[i].position.x, 6);
      expect(tree.y).toBeCloseTo(drawn[i].position.y, 6);
      expect(tree.z).toBeCloseTo(drawn[i].position.z, 6);
    });
  });
});
