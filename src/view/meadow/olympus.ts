import * as THREE from 'three';
import { ridged, smoothstep as smooth } from '../../sim/terrain/noise';
import type { Look } from '../look';

/**
 * Mount Olympus, intact, on the horizon: a ridged snowy cone with the golden
 * temple and floating marble islands. M5 adds the shattered-summit variant.
 */
export function buildOlympus(look: Look): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.ConeGeometry(360, 980, 64, 40, true);
  const p = geometry.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const rockC = new THREE.Color('#9a93a0');
  const snowC = new THREE.Color('#f5f7fc');
  const marble = new THREE.Color('#e9e3d6');
  for (let i = 0; i < p.count; i += 1) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const a = Math.atan2(z, x);
    const t = (y + 490) / 980;
    const n = ridged(Math.cos(a) * 2 + 10, t * 6);
    const rr = 1 + (n - 0.5) * 0.35 * (1 - t);
    x *= rr;
    z *= rr;
    y += (n - 0.5) * 40;
    p.setXYZ(i, x, y, z);
    c.copy(rockC).lerp(snowC, smooth(0.45, 0.7, t + (n - 0.5) * 0.2)).lerp(marble, smooth(0.9, 1.0, t));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mountain = new THREE.Mesh(geometry, look.farFog(look.toon({ vertexColors: true, grad: look.GRAD4, rim: false })));
  mountain.position.y = 490 - 30;
  group.add(mountain);

  const gold = look.farFog(look.toon({ color: '#ffd36b', emissive: '#ffb340', emissiveIntensity: 1.4, rim: false }));
  look.glowMaterials.push({ mat: gold, day: 1.4, night: 3.0 });
  const temple = new THREE.Group();
  temple.add(new THREE.Mesh(new THREE.BoxGeometry(70, 10, 46), gold));
  for (let i = 0; i < 8; i += 1) {
    for (const zz of [-18, 18]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 26, 8), gold);
      column.position.set(-30 + i * 8.6, 18, zz);
      temple.add(column);
    }
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(48, 16, 4), gold);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.6);
  roof.position.y = 39;
  temple.add(roof);
  temple.position.y = 960;
  group.add(temple);

  const islandMaterial = look.farFog(look.toon({ color: '#e7e1d3', grad: look.GRAD4, rim: false }));
  for (let i = 0; i < 6; i += 1) {
    const island = new THREE.Mesh(new THREE.ConeGeometry(28 + i * 4, 60, 7), islandMaterial);
    island.rotation.x = Math.PI;
    const a = (i / 6) * Math.PI * 2;
    island.position.set(Math.cos(a) * (260 + i * 25), 760 + (i % 3) * 70, Math.sin(a) * 160);
    group.add(island);
    const top = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 10), gold);
    top.position.copy(island.position).y += 33;
    group.add(top);
  }
  group.scale.setScalar(0.72);
  group.position.set(700, -40, -2050);
  return group;
}
