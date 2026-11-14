import * as THREE from 'three';
import { meadowHeightAt, WATER_LEVEL } from '../../sim/terrain/meadow';
import { fbm, smoothstep as smooth } from '../../sim/terrain/noise';
import type { Look } from '../look';

/** The meadow heightfield as one vertex-coloured toon mesh (denser near the centre). */
export function buildTerrainMesh(look: Look): THREE.Mesh {
  const N = 320;
  const EXT = 1500;
  const count = (N + 1) * (N + 1);
  const pos = new Float32Array(count * 3);
  let k = 0;
  for (let j = 0; j <= N; j += 1) {
    for (let i = 0; i <= N; i += 1) {
      const s = (i / N) * 2 - 1;
      const t = (j / N) * 2 - 1;
      const x = Math.sign(s) * s * s * EXT;
      const z = Math.sign(t) * t * t * EXT;
      pos[k++] = x;
      pos[k++] = meadowHeightAt(x, z);
      pos[k++] = z;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const c = a + (N + 1);
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();

  const normals = geometry.attributes.normal.array;
  const colors = new Float32Array(count * 3);
  const grassLo = new THREE.Color('#3f6b24');
  const grassHi = new THREE.Color('#8cb33a');
  const dry = new THREE.Color('#bdb257');
  const rock = new THREE.Color('#6c7180');
  const rockWarm = new THREE.Color('#8a7d6c');
  const snow = new THREE.Color('#f2f5fb');
  const sand = new THREE.Color('#d6c79a');
  const c = new THREE.Color();
  for (let v = 0; v < count; v += 1) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    const ny = normals[v * 3 + 1];
    const r = Math.hypot(x, z);
    c.copy(grassLo).lerp(grassHi, smooth(-30, 20, y));
    c.lerp(dry, smooth(0.55, 0.8, fbm(x * 0.02, z * 0.02, 3)) * 0.7);
    if (y < WATER_LEVEL + 2.5) c.lerp(sand, smooth(WATER_LEVEL + 2.5, WATER_LEVEL + 0.5, y));
    const rockAmount = Math.max(smooth(0.86, 0.7, ny), smooth(420, 700, r) * 0.85);
    c.lerp(fbm(x * 0.01, z * 0.01, 2) > 0.5 ? rockWarm : rock, rockAmount);
    c.lerp(snow, smooth(150, 210, y + (fbm(x * 0.02, z * 0.02, 3) - 0.5) * 60) * smooth(0.5, 0.75, ny + 0.2));
    colors[v * 3] = c.r;
    colors[v * 3 + 1] = c.g;
    colors[v * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geometry, look.toon({ vertexColors: true, grad: look.GRAD4, rim: false }));
  mesh.receiveShadow = true;
  return mesh;
}

export function buildWater(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhongMaterial> {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshPhongMaterial({ color: '#2f6690', specular: '#ffe3b0', shininess: 90 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  water.receiveShadow = true;
  return water;
}
