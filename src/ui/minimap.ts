import { GROTTO } from '../sim/regions';
import { REVEAL_BOUNDS, REVEAL_CELL, REVEAL_COLS, REVEAL_ROWS, revealGrid } from '../sim/systems/reveal';
import { FIELDS, FORT_SPOTS, GATES, pathX, riverZ, TUNNEL, underworldLocalHeight } from '../sim/terrain/underworld';
import type { EntityId, WorldState } from '../sim/types';

export interface Minimap {
  element: HTMLElement;
  /** Draws the local god's region map; hidden on the surface (the meadow needs none yet). */
  update(world: WorldState, heroId: EntityId | null, visible: boolean): void;
  /** M (rebindable) toggles the full map. */
  toggleFull(): void;
  isFull(): boolean;
}

const MINI_RADIUS_M = 90;

/**
 * The Underworld map (SPEC §4.1, M6): a round, north-up minimap in the top-right
 * corner and a full map on M. It starts dark and shows only revealed cells
 * (fog of war is world state). Markers: you (arrow), your companion, the Refuge,
 * the Gates, and forts once seen (crossed out once cleared).
 */
export function createMinimap(parent: HTMLElement): Minimap {
  const element = document.createElement('div');
  element.id = 'wc-minimap';
  element.hidden = true;
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', 'Map of the Underworld');
  const canvas = document.createElement('canvas');
  element.append(canvas);
  const legend = document.createElement('p');
  legend.className = 'wc-map-legend';
  legend.textContent = 'Map · M to close';
  element.append(legend);
  parent.append(element);
  let full = false;

  // The terrain picture (all of it); fog is painted over unrevealed cells each update.
  const terrain = document.createElement('canvas');
  const scale = 1; // px per metre on the terrain picture / 2
  terrain.width = Math.ceil((REVEAL_BOUNDS.maxX - REVEAL_BOUNDS.minX) / 2);
  terrain.height = Math.ceil((REVEAL_BOUNDS.maxZ - REVEAL_BOUNDS.minZ) / 2);
  {
    const g = terrain.getContext('2d')!;
    const img = g.createImageData(terrain.width, terrain.height);
    for (let py = 0; py < terrain.height; py += 1) {
      for (let px = 0; px < terrain.width; px += 1) {
        const x = REVEAL_BOUNDS.minX + px * 2;
        const z = REVEAL_BOUNDS.minZ + py * 2;
        let r = 20;
        let gr = 16;
        let b = 30;
        const inGrotto = Math.hypot(x, z) < 21;
        const inTunnel = Math.abs(x) < TUNNEL.halfWidth && z <= TUNNEL.fromZ && z >= TUNNEL.toZ;
        const inFields = x > FIELDS.minX && x < FIELDS.maxX && z > FIELDS.minZ && z < FIELDS.maxZ;
        if (inGrotto || inTunnel || inFields) {
          const h = underworldLocalHeight(x, z);
          const shade = Math.max(0, Math.min(1, 0.55 + h / 30));
          r = 70 * shade + 25;
          gr = 62 * shade + 22;
          b = 104 * shade + 40;
          if (inFields && Math.abs(z - riverZ(x)) < 9) { r = 30; gr = 110; b = 120; }
          if (inFields && Math.abs(x - pathX(z)) < 2.5 && z < TUNNEL.toZ) { r = 150; gr = 135; b = 160; }
          if (inFields && h > 8) { r *= 0.6; gr *= 0.6; b *= 0.7; }
        }
        const i = (py * terrain.width + px) * 4;
        img.data.set([r, gr, b, 255], i);
      }
    }
    g.putImageData(img, 0, 0);
  }
  void scale;

  const toMap = (x: number, z: number) => ({ px: (x - REVEAL_BOUNDS.minX) / 2, py: (z - REVEAL_BOUNDS.minZ) / 2 });

  return {
    element,
    toggleFull() {
      full = !full;
      element.classList.toggle('wc-map-full', full);
    },
    isFull: () => full,
    update(world, heroId, visible) {
      const hero = heroId ? world.entities[heroId] : undefined;
      const show = visible && hero?.region === 'underworld';
      element.hidden = !show;
      if (!show || !hero) return;
      const size = full ? Math.min(window.innerWidth, window.innerHeight) * 0.8 : 168;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(size * dpr)) {
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
      }
      const g = canvas.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      const hx = hero.position.x - GROTTO.center.x;
      const hz = hero.position.z - GROTTO.center.z;
      // World metres → screen px. Minimap: centred on you; full map: the whole region.
      const spanM = full ? Math.max(REVEAL_BOUNDS.maxX - REVEAL_BOUNDS.minX, REVEAL_BOUNDS.maxZ - REVEAL_BOUNDS.minZ) : MINI_RADIUS_M * 2;
      const cx = full ? (REVEAL_BOUNDS.minX + REVEAL_BOUNDS.maxX) / 2 : hx;
      const cz = full ? (REVEAL_BOUNDS.minZ + REVEAL_BOUNDS.maxZ) / 2 : hz;
      const k = size / spanM;
      const sx = (x: number) => size / 2 + (x - cx) * k;
      const sy = (z: number) => size / 2 + (z - cz) * k;
      g.save();
      if (!full) {
        g.beginPath();
        g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        g.clip();
      }
      g.fillStyle = '#07060c';
      g.fillRect(0, 0, size, size);
      const tl = toMap(cx - spanM / 2, cz - spanM / 2);
      g.imageSmoothingEnabled = false;
      g.drawImage(terrain, tl.px, tl.py, spanM / 2, spanM / 2, 0, 0, size, size);
      // Fog of war over cells not yet revealed.
      const grid = revealGrid(world);
      g.fillStyle = '#07060c';
      for (let r = 0; r < REVEAL_ROWS; r += 1) {
        for (let c = 0; c < REVEAL_COLS; c += 1) {
          if (grid[r * REVEAL_COLS + c] === '1') continue;
          const x0 = REVEAL_BOUNDS.minX + c * REVEAL_CELL;
          const z0 = REVEAL_BOUNDS.minZ + r * REVEAL_CELL;
          g.fillRect(Math.floor(sx(x0)), Math.floor(sy(z0)), Math.ceil(REVEAL_CELL * k) + 1, Math.ceil(REVEAL_CELL * k) + 1);
        }
      }
      // Markers.
      const dot = (x: number, z: number, color: string, r: number) => {
        g.fillStyle = color;
        g.beginPath();
        g.arc(sx(x), sy(z), r, 0, Math.PI * 2);
        g.fill();
      };
      dot(0, 0, '#ffd35c', full ? 6 : 4); // the Refuge (grotto)
      dot(GATES.x, GATES.z, '#5ff0e0', full ? 7 : 5); // the Gates (always shown: the beacon is visible from anywhere)
      for (const fort of FORT_SPOTS) {
        const state = world.forts?.[fort.id];
        if (!state?.seen) continue;
        dot(fort.x, fort.z, state.cleared ? '#8a8a96' : '#d4473b', full ? 6 : 4);
        if (state.cleared) {
          g.strokeStyle = '#e8e8f0';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(sx(fort.x) - 4, sy(fort.z) - 4);
          g.lineTo(sx(fort.x) + 4, sy(fort.z) + 4);
          g.stroke();
        }
      }
      for (const other of Object.values(world.entities)) {
        if (other.hero && other.id !== hero.id && other.region === 'underworld') {
          dot(other.position.x - GROTTO.center.x, other.position.z - GROTTO.center.z, '#b48cff', full ? 4 : 3);
        }
      }
      // You: an arrow pointing where you face (north-up map: −z is up).
      const ax = sx(hx);
      const ay = sy(hz);
      const yaw = hero.rotationY;
      g.save();
      g.translate(ax, ay);
      g.rotate(Math.atan2(Math.sin(yaw), Math.cos(yaw)) * -1 + Math.PI);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#07060c';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(5, 6);
      g.lineTo(0, 3);
      g.lineTo(-5, 6);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      g.restore();
    },
  };
}
