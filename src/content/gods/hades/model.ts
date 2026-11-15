import * as THREE from 'three';
import { rng } from '../../../sim/rng';
import { attackSpecFor, DODGE_TICKS } from '../../../sim/systems/hero';
import type { Entity } from '../../../sim/types';
import { isKnownWeapon, weaponData } from '../../../sim/weapons';
import type { EntityModel, Expression, ModelFactory, ModelFrame } from '../../../view/entity-model';
import { DAGGERS, daggerOrbit } from '../../spirits/shadow-daggers';
import { buildDagger, daggerMaterials } from '../../../view/effects/shadow';
import { createParticles } from '../../../view/particles';
import { buildWeaponModel } from '../../../view/weapon-model';
import { drawFace, SKIN } from './face';

/** Hades's signature weapon (SPEC §5). Until it's in the weapon registry (M6), this ID shows the hand-built bident. */
export const BIDENT_ID = 'shadow-bident';
/** Hades stands about 10% taller than Zeus. */
const SCALE = 1.1;
const SMIRK_SECONDS = 1.2;

const COLORS = {
  robe: '#1c1426',
  robeViolet: '#3b2357',
  violet: '#5B3A8C',
  bronze: '#6e4a2a',
  bronzeLight: '#a07040',
  iron: '#24222c',
  ironLight: '#3a3846',
  hair: '#17131d',
  boot: '#151219',
  bone: '#a9a091',
  cloakOuter: '#120d19',
  cloakLining: '#3a1f5c',
};

/**
 * Hades built from primitives, matching the approved concept
 * (`docs/reference/hades-concept.html`): ash-grey skin, dark beard, black and
 * violet robes over dark bronze armour, a spiked iron crown with soul-fire
 * tips, a tattered cloak trailing shadow wisps, a soul flame in his free hand
 * and the Shadow bident. Same rig and animation as Zeus, so he can be a story
 * character now (M5.1) and playable later (M6).
 */
export const createModel: ModelFactory = (look, entityId) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  const scaled = new THREE.Group();
  scaled.scale.setScalar(SCALE);
  root.add(scaled);
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  scaled.add(hips);
  const body = new THREE.Group();
  body.position.y = -0.9;
  hips.add(body);

  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 1024;
  faceCanvas.height = 512;
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 1024;
  glowCanvas.height = 512;
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;

  const skin = toon({ color: SKIN });
  const robe = toon({ color: COLORS.robe });
  const robeV = toon({ color: COLORS.robeViolet });
  const violet = toon({ color: COLORS.violet });
  const bronze = toon({ color: COLORS.bronze });
  const bronzeL = toon({ color: COLORS.bronzeLight });
  const iron = toon({ color: COLORS.iron });
  const ironL = toon({ color: COLORS.ironLight });
  const hair = toon({ color: COLORS.hair });
  const boot = toon({ color: COLORS.boot });
  const bone = toon({ color: COLORS.bone });
  const soul = new THREE.MeshBasicMaterial({ color: '#8ef7ee', toneMapped: false });
  const soulViolet = new THREE.MeshBasicMaterial({ color: '#b48cff', toneMapped: false });

  // Legs (mostly under the robe) with armoured boots.
  const legs: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.12, 0.93, 0);
    leg.add(M(new THREE.CylinderGeometry(0.09, 0.08, 0.6, 10), robe, [0, -0.38, 0]));
    leg.add(M(new THREE.CylinderGeometry(0.1, 0.12, 0.36, 10), boot, [0, -0.75, 0.02]));
    leg.add(M(new THREE.ConeGeometry(0.06, 0.16, 6), bronze, [0, -0.51, 0.09], { rot: [0.3, 0, 0], outline: 0.008 }));
    body.add(leg);
    legs.push(leg);
  }
  // Long robe: a dark outer skirt split at the front over a violet under-robe.
  body.add(M(new THREE.CylinderGeometry(0.25, 0.42, 0.95, 18), robeV, [0, 0.62, 0]));
  body.add(M(new THREE.CylinderGeometry(0.27, 0.46, 0.98, 18, 1, true, Math.PI * 0.12, Math.PI * 1.76), robe, [0, 0.62, 0]));
  body.add(M(new THREE.TorusGeometry(0.44, 0.022, 6, 28), violet, [0, 0.14, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));
  body.add(M(new THREE.BoxGeometry(0.2, 0.62, 0.03), robeV, [0, 0.72, 0.36], { rot: [-0.18, 0, 0], outline: 0.008 }));
  for (const sx of [-1, 1]) body.add(M(new THREE.BoxGeometry(0.02, 0.62, 0.035), bronzeL, [sx * 0.1, 0.72, 0.365], { rot: [-0.18, 0, 0], outline: false }));

  const torso = new THREE.Group();
  torso.position.y = 1.08;
  body.add(torso);
  // Cuirass, chest plate and belt with a skull buckle.
  torso.add(M(new THREE.CylinderGeometry(0.29, 0.24, 0.64, 16), bronze, [0, 0.3, 0]));
  torso.add(M(new THREE.BoxGeometry(0.34, 0.36, 0.08), iron, [0, 0.38, 0.22], { outline: 0.01 }));
  torso.add(M(new THREE.BoxGeometry(0.04, 0.34, 0.09), bronzeL, [0, 0.38, 0.23], { outline: false }));
  torso.add(M(new THREE.TorusGeometry(0.25, 0.04, 6, 24), iron, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));
  const buckle = new THREE.Group();
  buckle.position.set(0, 0, 0.27);
  buckle.scale.setScalar(0.85);
  torso.add(buckle);
  buckle.add(M(new THREE.SphereGeometry(0.06, 12, 10), bone, [0, 0.01, 0], { scale: [1, 1, 0.8], outline: 0.006 }));
  buckle.add(M(new THREE.BoxGeometry(0.06, 0.03, 0.05), bone, [0, -0.045, 0], { outline: 0.005 }));
  for (const sx of [-1, 1]) {
    const eyeGlow = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), soul);
    eyeGlow.position.set(sx * 0.022, 0.012, 0.045);
    buckle.add(eyeGlow);
  }
  // Spiked iron pauldrons.
  for (const sx of [-1, 1]) {
    torso.add(M(new THREE.SphereGeometry(0.11, 14, 10), skin, [sx * 0.31, 0.56, 0]));
    const pad = new THREE.Group();
    pad.position.set(sx * 0.33, 0.6, 0);
    pad.rotation.z = -sx * 0.4;
    torso.add(pad);
    pad.add(M(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), iron, [0, 0, 0], { outline: 0.012 }));
    pad.add(M(new THREE.TorusGeometry(0.155, 0.016, 6, 22), bronzeL, [0, 0.005, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));
    for (let i = 0; i < 3; i += 1) {
      pad.add(M(new THREE.ConeGeometry(0.03, 0.17, 6), ironL, [sx * 0.03, 0.12, -0.07 + i * 0.07], { rot: [(-1 + i) * 0.25, 0, sx * 0.35], outline: 0.006 }));
    }
  }
  // High collar.
  torso.add(M(new THREE.CylinderGeometry(0.16, 0.22, 0.16, 16, 1, true, Math.PI * 0.75, Math.PI * 1.5), robe, [0, 0.67, -0.02], { outline: 0.008 }));

  // Arms: dark sleeves, grey forearms, iron bracers.
  const arm = (sx: number, upperRot: [number, number, number], elbowRot: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.35, 0.53, 0);
    shoulder.rotation.set(...upperRot);
    shoulder.add(M(new THREE.CylinderGeometry(0.08, 0.07, 0.36, 10), robe, [0, -0.18, 0]));
    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    elbow.rotation.x = elbowRot;
    shoulder.add(elbow);
    elbow.add(M(new THREE.CylinderGeometry(0.065, 0.055, 0.32, 10), skin, [0, -0.16, 0]));
    elbow.add(M(new THREE.CylinderGeometry(0.08, 0.075, 0.18, 10), iron, [0, -0.19, 0]));
    elbow.add(M(new THREE.TorusGeometry(0.078, 0.012, 6, 16), bronzeL, [0, -0.105, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));
    elbow.add(M(new THREE.SphereGeometry(0.07, 10, 8), skin, [0, -0.36, 0]));
    torso.add(shoulder);
    return { shoulder, elbow };
  };
  const leftArm = arm(1, [0.12, 0, 0.16], -0.35);
  const rightArm = arm(-1, [-0.3, 0, -0.08], -1.15);

  // Soul flame cupped in the free (left) hand; it swells while charging (Grasp of the Dead).
  const flame = new THREE.Group();
  flame.position.set(0, -0.44, 0.04);
  leftArm.elbow.add(flame);
  flame.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), soul));
  const flameTongue = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 10), soulViolet);
  flameTongue.position.y = 0.08;
  flame.add(flameTongue);
  const flameLight = new THREE.PointLight('#7fe9ff', 0.6, 3, 2);
  flame.add(flameLight);

  // The Shadow bident: dark iron shaft, skull at the fork, two prongs flaring
  // into violet-edged blades.
  const bident = new THREE.Group();
  bident.position.set(0, -0.36, 0);
  bident.rotation.x = 1.45;
  rightArm.elbow.add(bident);
  const heldWeapon = new THREE.Group();
  heldWeapon.position.copy(bident.position);
  heldWeapon.rotation.copy(bident.rotation);
  rightArm.elbow.add(heldWeapon);
  let heldWeaponId = BIDENT_ID;
  let heldTip: THREE.Object3D | null = null;
  bident.add(M(new THREE.CylinderGeometry(0.026, 0.026, 2.0, 8), iron, [0, 0.35, 0], { outline: 0.008 }));
  for (const y of [-0.45, 1.15]) bident.add(M(new THREE.CylinderGeometry(0.036, 0.036, 0.08, 8), bronzeL, [0, y, 0], { outline: false }));
  bident.add(M(new THREE.ConeGeometry(0.04, 0.14, 8), iron, [0, -0.72, 0], { rot: [Math.PI, 0, 0], outline: 0.006 }));
  bident.add(M(new THREE.SphereGeometry(0.05, 10, 8), iron, [0, 1.36, 0], { scale: [1.3, 0.8, 1], outline: 0.006 }));
  const fork = new THREE.Group();
  fork.position.y = 1.37;
  bident.add(fork);
  fork.add(M(new THREE.SphereGeometry(0.055, 10, 8), bone, [0, 0, 0.03], { scale: [1, 1, 0.85], outline: 0.006 }));
  for (const sx of [-1, 1]) {
    const prong = new THREE.Group();
    prong.position.set(sx * 0.03, 0.02, 0);
    prong.rotation.z = -sx * 0.32;
    fork.add(prong);
    prong.add(M(new THREE.CylinderGeometry(0.02, 0.026, 0.3, 6), iron, [0, 0.15, 0], { outline: 0.006 }));
    const blade = new THREE.Group();
    blade.position.y = 0.3;
    blade.rotation.z = sx * 0.32;
    prong.add(blade);
    blade.add(M(new THREE.ConeGeometry(0.05, 0.3, 4), ironL, [0, 0.15, 0], { rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.42], outline: 0.006 }));
    const edge = new THREE.Mesh(new THREE.ConeGeometry(0.053, 0.31, 4), soulViolet);
    edge.position.y = 0.15;
    edge.rotation.y = Math.PI / 4;
    edge.scale.set(1.08, 1.02, 0.1);
    blade.add(edge);
  }
  const tip = new THREE.Object3D();
  tip.position.set(0, 1.75, 0);
  bident.add(tip);

  // Neck and head.
  torso.add(M(new THREE.CylinderGeometry(0.075, 0.09, 0.14, 10), skin, [0, 0.7, 0]));
  const head = new THREE.Group();
  head.position.y = 0.9;
  torso.add(head);
  const faceMat = toon({ map: faceTex, emissive: '#ffffff', emissiveMap: glowTex, emissiveIntensity: 2.2 });
  const skull = M(new THREE.SphereGeometry(0.21, 40, 28), faceMat, [0, 0, 0], { scale: [0.95, 1.06, 1], outline: 0.012 });
  skull.rotation.y = -Math.PI / 2;
  head.add(skull);
  // Slicked-back hair, short beard and moustache, ears.
  head.add(M(new THREE.SphereGeometry(0.222, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, [0, 0.02, -0.03], { rot: [-0.7, 0, 0], scale: [0.98, 1.05, 1.05] }));
  head.add(M(new THREE.ConeGeometry(0.12, 0.3, 10), hair, [0, -0.06, -0.2], { rot: [-2.4, 0, 0], outline: 0.01 }));
  head.add(M(new THREE.ConeGeometry(0.1, 0.2, 10), hair, [0, -0.22, 0.1], { rot: [Math.PI - 0.32, 0, 0], outline: 0.008 }));
  for (const sx of [-1, 1]) {
    head.add(M(new THREE.ConeGeometry(0.035, 0.12, 6), hair, [sx * 0.05, -0.12, 0.19], { rot: [Math.PI / 2 + 0.6, 0, sx * 1.1], outline: 0.005 }));
    head.add(M(new THREE.SphereGeometry(0.035, 8, 6), skin, [sx * 0.2, 0, -0.01], { scale: [0.5, 1, 0.8], outline: 0.004 }));
  }
  // Spiked black-iron crown with soul-fire tips.
  const crown = new THREE.Group();
  crown.position.y = 0.12;
  crown.rotation.x = -0.12;
  head.add(crown);
  crown.add(M(new THREE.CylinderGeometry(0.205, 0.215, 0.06, 24, 1, true), iron, [0, 0, 0], { outline: 0.006 }));
  const SPIKES = 9;
  for (let i = 0; i < SPIKES; i += 1) {
    const a = (i / SPIKES) * Math.PI * 2;
    const tall = 0.14 + (Math.cos(a) > 0.6 ? 0.1 : 0) + (i % 2 ? 0 : 0.03);
    const spike = M(new THREE.ConeGeometry(0.026, tall, 5), ironL, [Math.sin(a) * 0.205, tall / 2 + 0.02, Math.cos(a) * 0.205], { outline: 0.005 });
    spike.rotation.set(Math.cos(a) * -0.18, 0, Math.sin(a) * 0.18);
    crown.add(spike);
    const spikeTip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), soul);
    spikeTip.position.set(Math.sin(a) * 0.205, tall + 0.03, Math.cos(a) * 0.205);
    crown.add(spikeTip);
  }

  // Tattered cloak: ragged hem, deep violet lining.
  const cloakPivot = new THREE.Group();
  cloakPivot.position.set(0, 0.64, -0.04);
  torso.add(cloakPivot);
  const cloakGeo = new THREE.CylinderGeometry(0.32, 0.62, 1.72, 28, 10, true, Math.PI / 2 - 0.15, Math.PI + 0.3);
  const cp = cloakGeo.attributes.position;
  for (let i = 0; i < cp.count; i += 1) {
    const y = cp.getY(i);
    if (y < -0.84) {
      const a = Math.atan2(cp.getX(i), cp.getZ(i));
      cp.setY(i, y + Math.abs(Math.sin(a * 9)) * 0.22 + Math.abs(Math.sin(a * 23)) * 0.06);
    }
  }
  cloakGeo.computeVertexNormals();
  cloakPivot.add(M(cloakGeo, toon({ color: COLORS.cloakOuter, side: THREE.FrontSide }), [0, -0.86, 0], { outline: 0.01 }));
  const lining = new THREE.Mesh(cloakGeo, toon({ color: COLORS.cloakLining, side: THREE.BackSide }));
  lining.position.set(0, -0.86, 0);
  lining.scale.setScalar(0.985);
  cloakPivot.add(lining);

  // Shadow wisps drifting off the hem (deterministic seed, like Zeus's sparks).
  const wispRng = rng(0, 'hades-wisps', 6161);
  const wispRand = () => wispRng.next();
  const wisps = createParticles(look.U, wispRand, 70, () => {
    const a = Math.PI / 2 - 0.15 + wispRand() * (Math.PI + 0.3);
    return [Math.sin(a) * 0.62, -1.55 + wispRand() * 0.7, Math.cos(a) * 0.62];
  }, { size: 0.13, colA: '#7a5ae0', colB: '#4ff0e0', additive: true, gain: 3, drift: 0.35 });
  wisps.material.uniforms.opacity.value = 0.8;
  cloakPivot.add(wisps);

  // Faces: automatic from state, or forced (tests, cutscenes).
  let shownFace: Expression | null = null;
  let forcedFace: Expression | null = null;
  let smirkUntil = -Infinity;
  const showFace = (expression: Expression) => {
    if (expression === shownFace) return;
    shownFace = expression;
    drawFace(faceCanvas, glowCanvas, expression);
    faceTex.needsUpdate = true;
    glowTex.needsUpdate = true;
  };
  showFace('neutral');

  // Shadow Daggers (Cerberus's gift): three blades circling him while the gift lasts.
  // They live in world-aligned space (the ring undoes his heading) so they follow the sim's orbit.
  const daggerRing = new THREE.Group();
  root.add(daggerRing);
  const daggers = Array.from({ length: DAGGERS.count }, () => {
    const d = buildDagger();
    daggerRing.add(d);
    return { group: d, mats: daggerMaterials(d) };
  });
  daggerRing.visible = false;
  let orbitT = 0;
  const origin = { x: 0, y: 0, z: 0 };

  let walkPhase = 0;
  const model: EntityModel = {
    root,
    update(entity: Entity, frame: ModelFrame) {
      const weaponId = entity.hero?.weaponId ?? BIDENT_ID;
      if (weaponId !== heldWeaponId) {
        heldWeaponId = weaponId;
        heldWeapon.clear();
        heldTip = null;
        const custom = weaponId !== BIDENT_ID && isKnownWeapon(frame.world, weaponId);
        bident.visible = !custom;
        if (custom) {
          const built = buildWeaponModel(look, weaponData(frame.world, weaponId));
          heldWeapon.add(built.group);
          heldTip = built.tip;
        }
      }
      const t = frame.time;
      const hero = entity.hero;
      const moving = !!hero?.moving;
      const sprinting = !!hero?.sprinting;
      const airborne = hero ? !hero.grounded : false;

      // Idle: slow, regal breathing; the cloak stirs; the soul flame flickers.
      torso.scale.y = 1 + Math.sin(t * 1.4) * 0.01;
      head.rotation.y = moving ? 0 : Math.sin(t * 0.3) * 0.1;
      head.rotation.x = Math.sin(t * 0.45) * 0.03;
      const flutter = airborne ? 0.3 : moving ? (sprinting ? 0.35 : 0.18) : 0;
      cloakPivot.rotation.x = 0.1 + flutter + Math.sin(t * (airborne ? 6 : 1.1)) * (0.04 + flutter * 0.2);
      cloakPivot.rotation.z = Math.sin(t * 0.7) * 0.03;
      const flicker = frame.reduceMotion ? 1 : 1 + Math.sin(t * 7) * 0.08 + Math.sin(t * 13) * 0.04;
      flameTongue.scale.set(1, flicker, 1);

      // Shadow Daggers: circling at chest height, tips outward; a thrown one fades back in as it re-forms.
      const ring = hero?.daggers;
      daggerRing.visible = !!ring;
      if (ring) {
        const simT = frame.world.tick / 30;
        orbitT = Math.abs(orbitT + frame.dt - simT) > 0.1 ? simT : orbitT + frame.dt;
        daggerRing.rotation.y = -root.rotation.y;
        const fadeOut = Math.min(1, ring.ticksLeft / 15);
        daggers.forEach((d, i) => {
          const p = daggerOrbit(origin, i, orbitT);
          d.group.position.set(p.x, p.y, p.z);
          // Tip outward and a little down, along the ring (ring-local, so no lookAt: that works in world space).
          d.group.rotation.set(0.35, Math.atan2(p.x, p.z) + 0.5, 0, 'YXZ');
          const back = ring.reform[i] > 0 ? Math.max(0, 1 - ring.reform[i] / 12) : 1;
          d.group.visible = back > 0;
          d.group.scale.setScalar(0.6 + 0.4 * back);
          for (const m of d.mats) m.opacity = (m.blending === THREE.AdditiveBlending ? 0.25 : 1) * back * fadeOut;
        });
      }

      // Walk cycle.
      walkPhase += frame.dt * (moving ? (sprinting ? 12 : 8) : 0);
      const swing = moving ? Math.sin(walkPhase) * (sprinting ? 0.7 : 0.45) : 0;
      legs[0].rotation.x = airborne ? -0.5 : swing;
      legs[1].rotation.x = airborne ? 0.2 : -swing;
      body.position.y = -0.9 + (moving && !airborne ? Math.abs(Math.cos(walkPhase)) * 0.04 : 0);
      torso.rotation.x = moving ? (sprinting ? 0.2 : 0.08) : 0;

      // Dodge: a forward roll around the hips (Shadow Step gets its own effect in M6).
      const dodge = hero?.dodge;
      hips.rotation.x = dodge ? (1 - dodge.ticksLeft / DODGE_TICKS) * Math.PI * 2 : 0;

      // Attacks: same poses as Zeus (bident in the right hand, free left hand).
      let shoulderX = -0.3;
      let elbowX = -1.15;
      let leftShoulderX = 0.12 - swing * 0.5;
      let leftElbowX = -0.35;
      let twist = 0;
      let flamePower = 0;
      const attack = hero?.attack;
      if (hero && attack) {
        const spec = attackSpecFor(frame.world, entity, attack);
        const p = Math.min(1, attack.tick / spec.totalTicks);
        const hit = spec.hitTick / spec.totalTicks;
        const windup = Math.min(1, p / hit);
        const follow = p < hit ? 0 : Math.min(1, (p - hit) / (1 - hit));
        const strike = p < hit ? windup : 1 - follow * 0.85;
        if (attack.kind === 'light') {
          const thrust = p < hit ? -(p / hit) * 0.25 : Math.sin(follow * Math.PI);
          shoulderX = -0.3 - thrust * 1.1;
          elbowX = -1.15 + thrust * 0.95;
        } else if (attack.kind === 'heavy') {
          shoulderX = -0.3 - windup * 2.3 + follow * 2.6;
          elbowX = -1.15 + windup * 0.6;
          twist = (1 - follow) * windup * 0.35;
        } else if (attack.kind === 'punch') {
          const step = attack.step ?? 1;
          const upper = step === 3;
          const reachShoulder = upper ? -2.3 : -1.55;
          const reachElbow = upper ? -0.7 : -0.05;
          if (step === 2) {
            shoulderX = -0.3 + (reachShoulder + 0.3) * strike;
            elbowX = -1.15 + (reachElbow + 1.15) * strike;
            twist = 0.45 * strike;
          } else {
            leftShoulderX = 0.12 + (reachShoulder - 0.12) * strike;
            leftElbowX = -1.3 + (reachElbow + 1.3) * strike;
            twist = -0.4 * strike;
          }
        } else {
          // Charged move: the soul-flame hand slams down (Grasp of the Dead in M6).
          leftShoulderX = -2.4 + 2.2 * strike;
          leftElbowX = -0.4;
          twist = -0.3 * strike;
          flamePower = (attack.power ?? 0) * (1 - follow);
        }
      } else if (hero && hero.charge != null) {
        const charge = Math.min(1, hero.charge / 30);
        leftShoulderX = -2.4 * charge;
        leftElbowX = -0.4;
        flamePower = 0.25 + 0.75 * charge;
      } else if (hero?.ultimate) {
        // Ultimate (Skull Cage in M6): bident raised.
        shoulderX = -2.9;
        elbowX = -0.2;
      }
      torso.rotation.y = twist;
      rightArm.shoulder.rotation.x = shoulderX;
      rightArm.elbow.rotation.x = elbowX;
      leftArm.shoulder.rotation.x = leftShoulderX;
      leftArm.elbow.rotation.x = leftElbowX;
      flame.scale.setScalar(1 + flamePower * 1.6);
      flameLight.intensity = 0.6 + flamePower * 2.5 + look.U.night.value * 0.6;

      if (forcedFace) showFace(forcedFace);
      else if (hero && hero.hurtTicks > 0) showFace('hurt');
      else if (t < smirkUntil) showFace('happy');
      else if (hero && (hero.attack || hero.lockTarget || hero.dodge || hero.charge != null || hero.ultimate)) showFace('determined');
      else showFace('neutral');
    },
    onEvent(event, frame) {
      if (event.type === 'ability:cast' && event.casterId === entityId && event.targetIds.length > 0) {
        smirkUntil = frame.time + SMIRK_SECONDS;
      }
    },
    setExpression(expression) {
      forcedFace = expression;
      if (expression) showFace(expression);
    },
    anchor(_name, out) {
      return (heldTip ?? tip).getWorldPosition(out);
    },
    dispose() {
      for (const d of daggers) for (const m of d.mats) m.dispose();
      faceTex.dispose();
      glowTex.dispose();
    },
  };
  return model;
};
