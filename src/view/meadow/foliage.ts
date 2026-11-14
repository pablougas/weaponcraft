import * as THREE from 'three';
import { GLADE_CENTER, meadowHeightAt, WATER_LEVEL } from '../../sim/terrain/meadow';
import type { Look } from '../look';

type Rand = () => number;

// Keep rand() call order identical to the style test (see props.ts).

/** Instanced wind-blown grass that glows when backlit by the sun. */
export function buildGrass(look: Look, rand: Rand): THREE.InstancedMesh {
  const { U } = look;
  const COUNT = 46000;
  const w = 0.07;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.65, 0.45, 0, w * 0.65, 0.45, 0, 0, 1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 0.45, 1, 0.45, 0.5, 1], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      time: U.time, sunDir: U.sunDir, sunColor: U.sunColor, ambColor: U.ambColor,
      fogColor: U.fogColor, fogDensity: U.fogDensity, night: U.night, motion: U.motion,
    },
    vertexShader: `
      uniform float time, motion; varying float vH; varying vec3 vCol; varying float vD; varying vec3 vW;
      void main(){
        vH = uv.y;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float w = sin(time*1.7 + wp.x*0.13 + wp.z*0.09) * 0.55 + sin(time*2.9 + wp.x*0.5 + wp.z*0.3) * 0.2;
        float gust = smoothstep(0.6, 1.0, sin(time*0.6 + wp.x*0.02 - wp.z*0.015));
        w += gust * 0.6;
        w *= motion;
        wp.x += w * vH * vH * 0.32; wp.z += w * vH * vH * 0.18; wp.y -= abs(w) * vH * vH * 0.06;
        vCol = instanceColor; vW = wp.xyz;
        vec4 mv = viewMatrix * wp; vD = -mv.z; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 sunDir, sunColor, ambColor, fogColor; uniform float fogDensity, night;
      varying float vH; varying vec3 vCol; varying float vD; varying vec3 vW;
      void main(){
        vec3 base = mix(vCol * 0.32, vCol, smoothstep(0.0, 0.9, vH));
        vec3 V = normalize(cameraPosition - vW);
        float back = pow(max(dot(-V, sunDir), 0.0), 4.0);
        vec3 c = base * (ambColor + sunColor * (0.35 + 0.45 * max(sunDir.y, 0.0)));
        c += sunColor * back * vH * vH * vec3(1.0, 0.85, 0.45) * 0.55;
        float f = 1.0 - exp(-fogDensity*fogDensity*vD*vD);
        gl_FragColor = vec4(mix(c, fogColor, f), 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  const c1 = new THREE.Color('#7fae36');
  const c2 = new THREE.Color('#b6c94c');
  const c3 = new THREE.Color('#4f8a2c');
  let i = 0;
  let guard = 0;
  while (i < COUNT && guard++ < COUNT * 4) {
    const a = rand() * Math.PI * 2;
    const r = 3.2 + Math.pow(rand(), 1.45) * 105;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < 3.3 && Math.abs(z) < 3.0) continue;
    const y = meadowHeightAt(x, z);
    if (y < WATER_LEVEL + 0.6) continue;
    const slope = Math.abs(meadowHeightAt(x + 1, z) - meadowHeightAt(x - 1, z)) + Math.abs(meadowHeightAt(x, z + 1) - meadowHeightAt(x, z - 1));
    if (slope > 2.2) continue;
    p.set(x, y - 0.05, z);
    const ex = (rand() - 0.5) * 0.35;
    const ey = rand() * Math.PI * 2;
    const ez = (rand() - 0.5) * 0.35;
    e.set(ex, ey, ez);
    q.setFromEuler(e);
    const height = 0.55 + rand() * 0.75;
    s.set(1 + rand() * 0.6, height, 1);
    m4.compose(p, q, s);
    mesh.setMatrixAt(i, m4);
    c.copy(c3).lerp(c1, rand()).lerp(c2, Math.pow(rand(), 3) * 0.8);
    mesh.setColorAt(i, c);
    i += 1;
  }
  mesh.count = i;
  mesh.frustumCulled = false;
  mesh.userData.maxCount = i;
  return mesh;
}

export interface FlowerMeshes {
  group: THREE.Group;
  flowers: THREE.InstancedMesh;
  glow: THREE.InstancedMesh;
}

/** Flowers plus bioluminescent flora that glows at night (densest in the glade). */
export function buildFlowers(look: Look, rand: Rand): FlowerMeshes {
  const group = new THREE.Group();
  const geometry = new THREE.IcosahedronGeometry(0.09, 0);
  const n = 1600;
  const flowers = new THREE.InstancedMesh(geometry, look.toon({ rim: false }), n);
  const palette = ['#ffffff', '#ffe066', '#ffb3c7', '#9fc8ff', '#ffd9a0'].map((hex) => new THREE.Color(hex));
  const m4 = new THREE.Matrix4();
  let i = 0;
  while (i < n) {
    const a = rand() * Math.PI * 2;
    const r = 3.5 + Math.pow(rand(), 1.2) * 70;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = meadowHeightAt(x, z);
    if (y < WATER_LEVEL + 1) continue;
    m4.makeTranslation(x, y + 0.35 + rand() * 0.35, z);
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, palette[Math.floor(rand() * palette.length)]);
    i += 1;
  }
  flowers.userData.maxCount = n;
  group.add(flowers);

  const glowMat = look.toon({ color: '#9ffff2', emissive: '#3ff0dc', emissiveIntensity: 0.0, rim: false });
  look.glowMaterials.push({ mat: glowMat, day: 0.05, night: 3.2 });
  const glowGeo = new THREE.ConeGeometry(0.07, 0.5, 5);
  const gn = 520;
  const glow = new THREE.InstancedMesh(glowGeo, glowMat, gn);
  i = 0;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  while (i < gn) {
    const near = rand() < 0.7;
    const a = rand() * Math.PI * 2;
    const r = near ? Math.pow(rand(), 0.7) * 16 : 4 + rand() * 50;
    const cx = near ? GLADE_CENTER.x : 0;
    const cz = near ? GLADE_CENTER.z : 0;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const y = meadowHeightAt(x, z);
    if (y < WATER_LEVEL + 1) continue;
    const ex = (rand() - 0.5) * 0.5;
    const ez = (rand() - 0.5) * 0.5;
    e.set(ex, 0, ez);
    q.setFromEuler(e);
    s.setScalar(0.6 + rand() * 1.2);
    p.set(x, y + 0.15, z);
    glow.setMatrixAt(i, m4.compose(p, q, s));
    i += 1;
  }
  group.add(glow);
  return { group, flowers, glow };
}
