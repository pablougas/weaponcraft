import * as THREE from 'three';
import { groundAt } from '../../../sim/regions';
import { MECH } from '../../../sim/systems/mech';
import { MECH_SIZE } from '../../../sim/terrain/underworld';
import type { Entity } from '../../../sim/types';
import { WARDEN_BEATS, WARDEN_ID } from '../../../sim/cutscenes/warden';
import type { EntityModel, ModelFactory } from '../../../view/entity-model';

/** Built at the original set-piece size, then scaled up for the encounter. */
const SCALE = 1.7;
/** Draped ground fans (sensor cone, fire): rings out × segments across. */
const RINGS = 7;
const SEGMENTS = 24;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A flat fan of triangles that is re-draped over the ground every frame. */
function drapedFan(color: string, opacity: number): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((1 + RINGS * (SEGMENTS + 1)) * 3), 3));
  const index: number[] = [];
  const at = (ring: number, i: number) => 1 + (ring - 1) * (SEGMENTS + 1) + i;
  for (let i = 0; i < SEGMENTS; i += 1) index.push(0, at(1, i), at(1, i + 1));
  for (let ring = 2; ring <= RINGS; ring += 1) {
    for (let i = 0; i < SEGMENTS; i += 1) index.push(at(ring - 1, i), at(ring, i), at(ring, i + 1), at(ring - 1, i), at(ring, i + 1), at(ring - 1, i + 1));
  }
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

/**
 * Lays a fan on the ground: from `origin` (world), `range` metres along world
 * heading `yaw`, ±`half` radians. The fan is a child of the mech's root, so
 * points are converted to the root's local frame.
 */
function drape(fan: THREE.Mesh, entity: Entity, origin: { x: number; z: number }, yaw: number, half: number, range: number): void {
  const pos = fan.geometry.attributes.position as THREE.BufferAttribute;
  const base = entity.position;
  const cos = Math.cos(-entity.rotationY);
  const sin = Math.sin(-entity.rotationY);
  const toLocal = (wx: number, wz: number, wy: number) => {
    const dx = wx - base.x;
    const dz = wz - base.z;
    // Undo the root's yaw (rotation about +Y).
    pos.setXYZ(v, dx * cos + dz * sin, wy - base.y + 0.2, -dx * sin + dz * cos);
    v += 1;
  };
  let v = 0;
  toLocal(origin.x, origin.z, groundAt('underworld', origin.x, origin.z));
  for (let ring = 1; ring <= RINGS; ring += 1) {
    const r = (range * ring) / RINGS;
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const a = yaw - half + (2 * half * i) / SEGMENTS;
      const wx = origin.x + Math.sin(a) * r;
      const wz = origin.z + Math.cos(a) * r;
      toLocal(wx, wz, groundAt('underworld', wx, wz));
    }
  }
  pos.needsUpdate = true;
}

/**
 * Cerberus Mk. II (M7): iron body, brass armour, three necks and heads with
 * ember eyes, four piston legs, and the rear plating that is its weak spot.
 * Reads the sim's mech state: walking stride, heads following the sensor
 * cone, rearing for a stomp, glowing for its breath, sagging when it's down.
 */
export const createModel: ModelFactory = (look) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  rig.scale.setScalar(SCALE);
  root.add(rig);
  const brass = toon({ color: '#a8863a' });
  const iron = toon({ color: '#3d3f4a' });
  const eyeMat = toon({ color: '#ffb35c', emissive: '#ff7a1a', emissiveIntensity: 0.7, rim: false });
  const plateMat = toon({ color: '#c49a44', emissive: '#3a2400', emissiveIntensity: 0.2 });
  const crackMat = new THREE.MeshBasicMaterial({ color: '#1a0d06' });

  // The body (it rears and sags as one).
  const body = new THREE.Group();
  rig.add(body);
  body.add(M(new THREE.BoxGeometry(8, 5, 15), iron, [0, 8.5, 0], { outline: 0.06 }));
  body.add(M(new THREE.BoxGeometry(7, 2.2, 12), brass, [0, 11.6, 0.5], { outline: 0.05 }));
  // Exhaust stacks along the spine.
  for (const z of [-3, 0, 3]) body.add(M(new THREE.CylinderGeometry(0.45, 0.55, 2.2, 8), iron, [2.6, 13.3, z], { outline: 0.03 }));

  // The rear plating (its weak spot): a riveted brass shield on its back, cracking as it's hit.
  // It's also the rear hatch: hinged on its left edge, it swings open like a door when the Mk. II breaks down (M7).
  const hinge = new THREE.Group();
  hinge.position.set(-3.1, 7.6, -7.65);
  const plate = new THREE.Group();
  plate.position.set(3.1, 0, 0);
  hinge.add(plate);
  plate.add(M(new THREE.BoxGeometry(6.2, 5.6, 0.6), plateMat, [0, 0, 0], { outline: 0.04 }));
  for (const [x, y] of [[-2.6, -2.3], [2.6, -2.3], [-2.6, 2.3], [2.6, 2.3]]) plate.add(M(new THREE.SphereGeometry(0.28, 8, 6), iron, [x, y, -0.35], { outline: false }));
  const cracks = [
    [0, 0.6, 0.5, 3.4, 0.3], [-1.2, -0.8, -0.7, 2.6, 0.25], [1.3, -0.4, 0.9, 2.8, 0.25], [0.4, -1.8, 0.2, 2.4, 0.25],
  ].map(([x, y, rot, length, width]) => {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(width, length, 0.1), crackMat);
    crack.position.set(x, y, -0.33);
    crack.rotation.z = rot;
    crack.visible = false;
    plate.add(crack);
    return crack;
  });
  body.add(hinge);
  // Behind the hatch: the dark cockpit opening, with a faint red glow inside.
  const hole = M(new THREE.BoxGeometry(4.6, 4.4, 0.3), new THREE.MeshBasicMaterial({ color: '#160606' }), [0, 7.6, -7.5], { outline: false });
  hole.visible = false;
  body.add(hole);

  // Legs: piston legs pivoting at the hip so they can stride.
  const legs = [[-3.5, 5.5], [3.5, 5.5], [-3.5, -5.5], [3.5, -5.5]].map(([x, z]) => {
    const hip = new THREE.Group();
    hip.position.set(x, 6.5, z);
    hip.add(M(new THREE.BoxGeometry(1.8, 6.5, 2), iron, [0, -3.25, 0], { outline: 0.04 }));
    hip.add(M(new THREE.BoxGeometry(2.4, 1, 3), brass, [0, -6, 0.4], { outline: 0.03 }));
    rig.add(hip);
    return hip;
  });

  // Three necks and heads; they turn together toward where the sensors look.
  const eyes: THREE.Mesh[] = [];
  const necks = [[0, -3], [1, 0], [2, 3]].map(([i, x]) => {
    const neck = new THREE.Group();
    neck.position.set(x, 10.5, 7.5);
    neck.rotation.y = (i - 1) * 0.35;
    neck.add(M(new THREE.CylinderGeometry(0.9, 1.2, 4, 8), iron, [0, 1.6, 0.8], { rot: [0.6, 0, 0], outline: 0.03 }));
    neck.add(M(new THREE.BoxGeometry(2.4, 2, 3.4), brass, [0, 3.6, 2.4], { outline: 0.04 }));
    neck.add(M(new THREE.BoxGeometry(2, 0.7, 2), iron, [0, 2.6, 3.4], { outline: 0.03 }));
    for (const ex of [-0.6, 0.6]) {
      const eye = M(new THREE.SphereGeometry(0.25, 8, 6), eyeMat, [ex, 4, 4.05], { outline: false });
      eyes.push(eye);
      neck.add(eye);
    }
    body.add(neck);
    return { neck, spread: (i - 1) * 0.35 };
  });

  // Sensor cone on the ground (teal on watch, amber when suspicious, red when it attacks).
  const sensor = drapedFan('#5ff0e0', 0.16);
  root.add(sensor);
  // Fire breath: a ground fan plus a translucent flame from the heads.
  const fireFan = drapedFan('#ff7a1a', 0.3);
  fireFan.visible = false;
  root.add(fireFan);
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  // A unit cone with its tip at the origin, opening along +Z (aimed with yaw and pitch).
  const flameGeo = new THREE.ConeGeometry(1, 1, 16, 1, true);
  flameGeo.rotateX(-Math.PI / 2);
  flameGeo.translate(0, 0, 0.5);
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.visible = false;
  root.add(flame);
  // Stomp warning: a red disc on the ground with a ring closing in as it's about to land.
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const stompDisc = new THREE.Mesh(new THREE.CircleGeometry(MECH.stomp.radius, 48), ringMat);
  stompDisc.rotation.x = -Math.PI / 2;
  stompDisc.position.y = 0.25;
  stompDisc.visible = false;
  stompDisc.renderOrder = 2;
  root.add(stompDisc);
  const closingMat = new THREE.MeshBasicMaterial({ color: '#ffd0a0', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const closing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), closingMat);
  closing.rotation.x = -Math.PI / 2;
  closing.position.y = 0.3;
  closing.visible = false;
  closing.renderOrder = 3;
  root.add(closing);

  let stride = 0;
  let sag = 0;
  const model: EntityModel = {
    root,
    update(entity, frame) {
      const m = entity.mech;
      if (!m) return;
      const down = m.mode === 'down';
      // Stride while walking (slow and heavy); legs settle when still.
      const charging = m.attack?.kind === 'charge' && m.attack.windup === 0;
      if (m.walking && !down) stride += frame.dt * (charging ? 6.5 : 2.2);
      const swing = m.walking && !down ? Math.sin(stride) * 0.32 : 0;
      legs[0].rotation.x = swing;
      legs[3].rotation.x = swing;
      legs[1].rotation.x = -swing;
      legs[2].rotation.x = -swing;
      body.position.y = m.walking && !down ? Math.abs(Math.cos(stride)) * 0.25 : 0;

      // Down: the hatch bursts open (2 s into the Warden's scene), then it collapses (3.5 s) and lists.
      const cut = frame.world.cutscene;
      const sceneT = cut?.id === WARDEN_ID ? (frame.world.tick - cut.startTick) / 30 : null;
      const open = !down ? 0 : sceneT === null ? 1 : Math.min(1, Math.max(0, (sceneT - WARDEN_BEATS.hatch / 30) / 0.5));
      const sagTarget = !down ? 0 : sceneT === null || sceneT >= WARDEN_BEATS.breakdown / 30 ? 1 : 0.45;
      sag = frame.dt === 0 ? sagTarget : sag < sagTarget ? Math.min(sagTarget, sag + frame.dt * 0.8) : sagTarget;
      body.position.y -= sag * 3.2;
      body.rotation.x = sag * 0.12;
      body.rotation.z = Math.max(0, sag - 0.45) * 0.14;
      for (const leg of legs) leg.rotation.z = sag * (leg.position.x < 0 ? -0.18 : 0.18);
      hinge.rotation.y = -1.9 * open;
      hole.visible = open > 0;

      // Stomp: it rears up during the warning and slams down when it lands.
      const attack = m.attack;
      // Charge: during the warning it dips its heads and paws the ground; then it runs nose-down.
      if (attack?.kind === 'charge') {
        const f = attack.windup > 0 ? 1 - attack.windup / MECH.charge.windup : 1;
        body.rotation.x = 0.1 * f;
        if (attack.windup > 0 && !frame.reduceMotion) legs[0].rotation.x = -0.35 * Math.max(0, Math.sin(frame.time * 9));
      }
      if (attack?.kind === 'stomp' && attack.windup > 0) {
        const f = 1 - attack.windup / MECH.stomp.windup;
        body.rotation.x = -0.16 * Math.sin(Math.min(1, f * 1.3) * Math.PI / 2);
        legs[0].rotation.x = legs[1].rotation.x = -0.5 * f;
      }

      // Heads follow the sensors (clamped like the sim).
      const look = Math.max(-MECH.headLimit, Math.min(MECH.headLimit, wrap(m.facing - entity.rotationY)));
      for (const { neck, spread } of necks) neck.rotation.y = spread + look;

      // Eyes: amber on watch, red when fighting, white-hot while it draws breath, dark when down.
      const breathing = attack?.kind === 'breath';
      const color = down ? '#201510' : breathing ? '#fff1c4' : m.mode === 'attack' ? '#ff3a2a' : '#ffb35c';
      eyeMat.color.set(color);
      eyeMat.emissive.set(down ? '#000000' : breathing ? '#ffcc66' : m.mode === 'attack' ? '#ff2a10' : '#ff7a1a');
      eyeMat.emissiveIntensity = down ? 0 : breathing ? 1.6 : 0.8;

      // Plating damage: cracks appear as it weakens.
      const plating = m.platingId ? frame.world.entities[m.platingId] : undefined;
      const left = plating?.health ? plating.health.current / plating.health.max : 0;
      cracks.forEach((crack, i) => { crack.visible = left < 1 - (i + 1) * 0.2; });
      // (The plating stays on as the hatch door once it breaks; fully cracked.)
      if (!plating && down) cracks.forEach((crack) => { crack.visible = true; });
      plateMat.emissiveIntensity = down ? 0.05 : 0.2 + (1 - left) * 0.5;

      // Ground fans. The heads (the cone's origin) are at the front of the body.
      const fx = Math.sin(entity.rotationY);
      const fz = Math.cos(entity.rotationY);
      const eyesAt = { x: entity.position.x + fx * MECH_SIZE.halfZ, z: entity.position.z + fz * MECH_SIZE.halfZ };
      sensor.visible = !down;
      if (sensor.visible) {
        drape(sensor, entity, eyesAt, m.facing, MECH.cone, MECH.sight);
        sensor.material.color.set(m.mode === 'attack' ? '#ff4a3a' : m.awareness > 25 || m.mode === 'search' ? '#ff9a3c' : '#5ff0e0');
        sensor.material.opacity = m.mode === 'attack' ? 0.2 : 0.14 + Math.min(0.1, m.awareness / 400);
      }
      fireFan.visible = breathing;
      flame.visible = breathing && attack!.windup === 0;
      if (breathing) {
        drape(fireFan, entity, eyesAt, attack!.yaw, MECH.breath.cone, MECH.breath.range);
        // During the warning the fan glows faintly; once it breathes it's bright.
        fireFan.material.opacity = attack!.windup > 0 ? 0.16 + 0.12 * (1 - attack!.windup / MECH.breath.windup) : 0.42;
        // The flame: from the heads (high on the front) down onto the far end of the burning fan, in the root's frame.
        const yaw = wrap(attack!.yaw - entity.rotationY);
        const from = new THREE.Vector3(0, 11.5 * SCALE - sag * 3, MECH_SIZE.halfZ + 2);
        const to = new THREE.Vector3(Math.sin(yaw) * MECH.breath.range, 0, MECH_SIZE.halfZ + Math.cos(yaw) * MECH.breath.range);
        const reach = from.distanceTo(to);
        const across = Math.hypot(to.x - from.x, to.z - from.z);
        flame.position.copy(from);
        flame.rotation.set(Math.atan2(from.y - to.y, across), Math.atan2(to.x - from.x, to.z - from.z), 0, 'YXZ');
        const width = Math.tan(MECH.breath.cone) * MECH.breath.range;
        flame.scale.set(width, width * 0.45, reach);
        flameMat.opacity = frame.reduceMotion ? 0.4 : 0.45 + 0.1 * Math.sin(frame.time * 18);
      }
      const stomping = attack?.kind === 'stomp' && attack.windup > 0;
      stompDisc.visible = stomping;
      closing.visible = stomping;
      if (stomping) {
        const f = 1 - attack!.windup / MECH.stomp.windup;
        // The ring closes from the edge toward the body; the disc deepens (no flashing).
        const r = MECH.stomp.radius * (1 - f * 0.55);
        closing.scale.setScalar(r);
        ringMat.opacity = 0.18 + 0.2 * f;
      }
    },
  };
  return model;
};
