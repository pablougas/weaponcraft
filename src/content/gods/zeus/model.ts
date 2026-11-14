import * as THREE from 'three';
import { rng } from '../../../sim/rng';
import { weaponDef } from '../../../sim/defs';
import type { Entity } from '../../../sim/types';
import type { EntityModel, Expression, ModelFactory, ModelFrame } from '../../../view/entity-model';
import { createParticles } from '../../../view/particles';
import { drawFace, SKIN } from './face';

const DODGE_TICKS = 10;
/** Seconds Zeus looks pleased after a successful Chain Lightning. */
const HAPPY_SECONDS = 1.2;

/** Zeus built from primitives, matching the style-test placeholder. */
export const createModel: ModelFactory = (look, entityId) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  // Everything hangs off a hip pivot so the dodge roll turns around the middle.
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  root.add(hips);
  const body = new THREE.Group();
  body.position.y = -0.9;
  hips.add(body);

  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 1024;
  faceCanvas.height = 512;
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;

  const skin = toon({ color: SKIN });
  const cloth = toon({ color: '#f3eee4' });
  const gold = toon({ color: '#e7b443' });
  const cape = toon({ color: '#2b3f94', side: THREE.DoubleSide });
  const hair = toon({ color: '#e9edf6' });
  const boot = toon({ color: '#7a4a2a' });
  const bronze = toon({ color: '#b87333' });

  const legs: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.12, 0.93, 0);
    leg.add(M(new THREE.CylinderGeometry(0.085, 0.07, 0.62, 10), skin, [0, -0.31, 0]));
    leg.add(M(new THREE.CylinderGeometry(0.095, 0.11, 0.34, 10), boot, [0, -0.76, 0.01]));
    leg.add(M(new THREE.TorusGeometry(0.095, 0.018, 6, 14), gold, [0, -0.59, 0.01], { rot: [Math.PI / 2, 0, 0], outline: false }));
    body.add(leg);
    legs.push(leg);
  }
  body.add(M(new THREE.CylinderGeometry(0.24, 0.35, 0.55, 14), cloth, [0, 0.8, 0]));
  body.add(M(new THREE.TorusGeometry(0.345, 0.026, 6, 24), gold, [0, 0.53, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));

  const torso = new THREE.Group();
  torso.position.y = 1.05;
  body.add(torso);
  torso.add(M(new THREE.CylinderGeometry(0.27, 0.22, 0.62, 14), cloth, [0, 0.3, 0]));
  torso.add(M(new THREE.TorusGeometry(0.232, 0.034, 6, 22), gold, [0, 0.0, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));
  torso.add(M(new THREE.BoxGeometry(0.075, 0.74, 0.04), gold, [0.02, 0.32, 0.245], { rot: [0, 0, 0.62], outline: 0.008 }));
  for (const sx of [-1, 1]) {
    torso.add(M(new THREE.SphereGeometry(0.11, 14, 10), skin, [sx * 0.3, 0.56, 0]));
    torso.add(M(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold, [sx * 0.31, 0.58, 0], { rot: [0, 0, -sx * 0.35] }));
  }
  const arm = (sx: number, upperRot: [number, number, number], elbowRot: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.33, 0.53, 0);
    shoulder.rotation.set(...upperRot);
    shoulder.add(M(new THREE.CylinderGeometry(0.075, 0.065, 0.36, 10), skin, [0, -0.18, 0]));
    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    elbow.rotation.x = elbowRot;
    shoulder.add(elbow);
    elbow.add(M(new THREE.CylinderGeometry(0.065, 0.055, 0.32, 10), skin, [0, -0.16, 0]));
    elbow.add(M(new THREE.CylinderGeometry(0.075, 0.072, 0.15, 10), gold, [0, -0.2, 0]));
    elbow.add(M(new THREE.SphereGeometry(0.068, 10, 8), skin, [0, -0.36, 0]));
    torso.add(shoulder);
    return { shoulder, elbow };
  };
  const leftArm = arm(1, [0.08, 0, 0.12], -0.1);
  const rightArm = arm(-1, [-0.3, 0, -0.08], -1.15);

  // Lightning spear
  const spear = new THREE.Group();
  spear.position.set(0, -0.36, 0);
  spear.rotation.x = 1.45;
  rightArm.elbow.add(spear);
  spear.add(M(new THREE.CylinderGeometry(0.024, 0.024, 2.2, 8), bronze, [0, 0.35, 0], { outline: 0.008 }));
  spear.add(M(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8), gold, [0, 1.45, 0], { outline: 0.008 }));
  const bolt = toon({ color: '#d8f4ff', emissive: '#6EC6FF', emissiveIntensity: 3.5, rim: false });
  look.glowMaterials.push({ mat: bolt, day: 1.6, night: 1.9 });
  for (const [x, y, z, rz] of [[0, 1.62, 0.0, 0.5], [0.06, 1.84, 0, -0.6], [0.0, 2.04, 0, 0.55]]) {
    spear.add(M(new THREE.BoxGeometry(0.07, 0.3, 0.05), bolt, [x, y, z], { rot: [0, 0, rz], outline: false, cast: false }));
  }
  spear.add(M(new THREE.ConeGeometry(0.06, 0.18, 6), bolt, [-0.03, 2.25, 0], { rot: [0, 0, 0.3], outline: false }));
  const tip = new THREE.Object3D();
  tip.position.set(0, 1.85, 0);
  spear.add(tip);
  const sparkRng = rng(0, 'zeus-sparks', 4242);
  const sparkRand = () => sparkRng.next();
  const sparks = createParticles(look.U, sparkRand, 60, () => [(sparkRand() - 0.5) * 0.5, (sparkRand() - 0.5) * 0.7, (sparkRand() - 0.5) * 0.5], {
    size: 0.16, colA: '#9fe6ff', colB: '#ffffff', additive: true, gain: 6, drift: 0.12,
  });
  sparks.material.uniforms.opacity.value = 1;
  tip.add(sparks);
  const spearLight = new THREE.PointLight('#6ec6ff', 0.8, 8, 2);
  tip.add(spearLight);

  // Neck and head
  torso.add(M(new THREE.CylinderGeometry(0.075, 0.085, 0.14, 10), skin, [0, 0.66, 0]));
  const head = new THREE.Group();
  head.position.y = 0.86;
  torso.add(head);
  const skull = M(new THREE.SphereGeometry(0.215, 40, 28), toon({ map: faceTex }), [0, 0, 0], { outline: 0.012 });
  skull.rotation.y = -Math.PI / 2;
  head.add(skull);
  head.add(M(new THREE.SphereGeometry(0.232, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, [0, 0.01, -0.02], { rot: [-0.55, 0, 0] }));
  for (let i = 0; i < 9; i += 1) {
    const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
    const spike = M(new THREE.ConeGeometry(0.07, 0.24, 6), hair, [Math.cos(a) * 0.17, 0.12 + Math.sin(i * 2.1) * 0.03, Math.sin(a) * 0.17 - 0.03], { outline: 0.01 });
    spike.lookAt(new THREE.Vector3(Math.cos(a) * 2, 0.9, Math.sin(a) * 2 - 0.4));
    spike.rotateX(Math.PI / 2);
    head.add(spike);
  }
  head.add(M(new THREE.ConeGeometry(0.12, 0.26, 10), hair, [0, -0.25, 0.1], { rot: [Math.PI - 0.25, 0, 0], outline: 0.01 }));
  for (const sx of [-1, 1]) head.add(M(new THREE.ConeGeometry(0.05, 0.16, 6), hair, [sx * 0.12, -0.14, 0.15], { rot: [Math.PI - 0.3, 0, sx * 0.35], outline: 0.008 }));
  head.add(M(new THREE.TorusGeometry(0.222, 0.016, 6, 28), gold, [0, 0.08, 0], { rot: [Math.PI / 2 - 0.25, 0, 0], outline: false }));
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    const leaf = M(new THREE.SphereGeometry(0.03, 6, 4), gold, [Math.cos(a) * 0.225, 0.08 + Math.sin(a) * -0.055, Math.sin(a) * 0.225], { scale: [1, 0.5, 2], outline: false });
    leaf.rotation.y = -a;
    head.add(leaf);
  }
  // Gold lightning bolts on the crown, one above each ear. The flat zigzag faces
  // front/back (angled ~35° outward) so it reads from the close-up and the follow camera.
  const boltShape = new THREE.Shape([
    new THREE.Vector2(0.025, 0.085),
    new THREE.Vector2(-0.03, 0.005),
    new THREE.Vector2(0.0, 0.005),
    new THREE.Vector2(-0.025, -0.085),
    new THREE.Vector2(0.035, -0.005),
    new THREE.Vector2(0.005, -0.005),
  ]);
  const crownBoltGeo = new THREE.ExtrudeGeometry(boltShape, { depth: 0.014, bevelEnabled: false });
  crownBoltGeo.center();
  const crownGold = toon({ color: '#f2c45a', emissive: '#ffb340', emissiveIntensity: 0.35 });
  for (const sx of [-1, 1]) {
    head.add(M(crownBoltGeo, crownGold, [sx * 0.22, 0.19, -0.02], { rot: [0, sx * 0.6, sx * -0.28], scale: [1.3, 1.3, 1.3], outline: 0.006 }));
  }

  const capePivot = new THREE.Group();
  capePivot.position.set(0, 0.62, -0.02);
  torso.add(capePivot);
  capePivot.add(M(new THREE.CylinderGeometry(0.28, 0.44, 1.15, 18, 6, true, Math.PI / 2, Math.PI), cape, [0, -0.575, 0], { outline: 0.012 }));

  // Faces: automatic from state, or forced (tests, cutscenes).
  let shownFace: Expression | null = null;
  let forcedFace: Expression | null = null;
  let happyUntil = -Infinity;
  const showFace = (expression: Expression) => {
    if (expression === shownFace) return;
    shownFace = expression;
    drawFace(faceCanvas, expression);
    faceTex.needsUpdate = true;
  };
  showFace('neutral');

  let walkPhase = 0;
  const model: EntityModel = {
    root,
    update(entity: Entity, frame: ModelFrame) {
      const t = frame.time;
      const hero = entity.hero;
      const moving = !!hero?.moving;
      const sprinting = !!hero?.sprinting;
      const airborne = hero ? !hero.grounded : false;

      // Idle breathing, head look, cape sway (from the style test).
      torso.scale.y = 1 + Math.sin(t * 1.6) * 0.012;
      head.rotation.y = moving ? 0 : Math.sin(t * 0.35) * 0.18;
      head.rotation.x = Math.sin(t * 0.5) * 0.04;
      const flutter = airborne ? 0.35 : moving ? (sprinting ? 0.4 : 0.22) : 0;
      capePivot.rotation.x = 0.16 + flutter + Math.sin(t * (airborne ? 7 : 1.3)) * (0.06 + flutter * 0.2) + Math.sin(t * 3.1) * 0.02;
      capePivot.rotation.z = Math.sin(t * 0.9) * 0.05;

      // Walk cycle: legs swing, body bobs and leans into the run.
      walkPhase += frame.dt * (moving ? (sprinting ? 13 : 9) : 0);
      const swing = moving ? Math.sin(walkPhase) * (sprinting ? 0.75 : 0.5) : 0;
      legs[0].rotation.x = airborne ? -0.5 : swing;
      legs[1].rotation.x = airborne ? 0.2 : -swing;
      body.position.y = -0.9 + (moving && !airborne ? Math.abs(Math.cos(walkPhase)) * 0.05 : 0);
      torso.rotation.x = moving ? (sprinting ? 0.22 : 0.1) : 0;
      leftArm.shoulder.rotation.x = 0.08 - swing * 0.6;

      // Dodge: a full forward roll around the hips.
      const dodge = hero?.dodge;
      hips.rotation.x = dodge ? (1 - dodge.ticksLeft / DODGE_TICKS) * Math.PI * 2 : 0;

      // Attacks: thrust or overhead sweep with the spear arm.
      let shoulderX = -0.3;
      let elbowX = -1.15;
      if (hero?.attack) {
        const spec = weaponDef(hero.weaponId)[hero.attack.kind];
        const p = Math.min(1, hero.attack.tick / spec.totalTicks);
        const hit = spec.hitTick / spec.totalTicks;
        if (hero.attack.kind === 'light') {
          const thrust = p < hit ? -(p / hit) * 0.25 : Math.sin(Math.min(1, (p - hit) / (1 - hit)) * Math.PI);
          shoulderX = -0.3 - thrust * 1.1;
          elbowX = -1.15 + thrust * 0.95;
        } else {
          const windup = Math.min(1, p / hit);
          const follow = p < hit ? 0 : Math.min(1, (p - hit) / (1 - hit));
          shoulderX = -0.3 - windup * 2.3 + follow * 2.6;
          elbowX = -1.15 + windup * 0.6;
          torso.rotation.y = (1 - follow) * windup * 0.35;
        }
      } else {
        torso.rotation.y = 0;
      }
      rightArm.shoulder.rotation.x = shoulderX;
      rightArm.elbow.rotation.x = elbowX;

      spearLight.intensity = 0.8 + look.U.night.value * 1.6;

      if (forcedFace) {
        showFace(forcedFace);
      } else if (hero && hero.hurtTicks > 0) {
        showFace('hurt');
      } else if (t < happyUntil) {
        showFace('happy');
      } else if (hero && (hero.attack || hero.lockTarget || hero.dodge)) {
        showFace('determined');
      } else {
        showFace('neutral');
      }
    },
    onEvent(event, frame) {
      if (event.type === 'ability:cast' && event.casterId === entityId && event.targetIds.length > 0) {
        happyUntil = frame.time + HAPPY_SECONDS;
      }
    },
    setExpression(expression) {
      forcedFace = expression;
      if (expression) showFace(expression);
    },
    anchor(_name, out) {
      return tip.getWorldPosition(out);
    },
    dispose() {
      faceTex.dispose();
    },
  };
  return model;
};
