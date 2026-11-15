import * as THREE from 'three';
import type { EntityModel, ModelFactory } from '../../../view/entity-model';
import { drawFace, SKIN } from '../../gods/zeus/face';

/**
 * Poseidon, built from primitives in the gods' style: sea-green robes with
 * gold and coral trim, a long blue-grey beard and flowing hair, a crown of
 * coral spikes, and a trident with glowing sea-glass tips. Same canvas-face
 * system as Zeus. He idles (breathing, a slow look round) and walks when the
 * scene moves him (`data.walking`).
 */
export const createModel: ModelFactory = (look) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 1024;
  faceCanvas.height = 512;
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  drawFace(faceCanvas, 'determined');
  faceTex.needsUpdate = true;

  const skin = toon({ color: SKIN });
  const robe = toon({ color: '#1f7a78' });
  const robeDark = toon({ color: '#14514f', side: THREE.DoubleSide });
  const gold = toon({ color: '#e7b443' });
  const coral = toon({ color: '#f07a5a' });
  const hair = toon({ color: '#9fb4c8' });
  const glass = toon({ color: '#b8fff4', emissive: '#3fe0d0', emissiveIntensity: 1.6, rim: false });
  look.glowMaterials.push({ mat: glass, day: 1.2, night: 1.8 });

  // Legs (mostly hidden by the robe) and the robe.
  const legs = [-0.12, 0.12].map((x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.93, 0);
    leg.add(M(new THREE.CylinderGeometry(0.085, 0.07, 0.62, 10), skin, [0, -0.31, 0]));
    leg.add(M(new THREE.CylinderGeometry(0.095, 0.11, 0.3, 10), toon({ color: '#6a4a2a' }), [0, -0.78, 0.01]));
    body.add(leg);
    return leg;
  });
  body.add(M(new THREE.CylinderGeometry(0.26, 0.42, 0.85, 16), robe, [0, 0.72, 0]));
  body.add(M(new THREE.TorusGeometry(0.42, 0.028, 6, 24), gold, [0, 0.3, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));

  const torso = new THREE.Group();
  torso.position.y = 1.08;
  body.add(torso);
  torso.add(M(new THREE.CylinderGeometry(0.29, 0.25, 0.62, 14), robe, [0, 0.3, 0]));
  torso.add(M(new THREE.TorusGeometry(0.26, 0.034, 6, 22), gold, [0, 0.02, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));
  // A sash of coral across the chest, and a sea-green mantle over the shoulders.
  torso.add(M(new THREE.BoxGeometry(0.08, 0.76, 0.04), coral, [-0.02, 0.32, 0.27], { rot: [0, 0, -0.62], outline: 0.008 }));
  for (const sx of [-1, 1]) torso.add(M(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), robeDark, [sx * 0.31, 0.56, 0], { rot: [0, 0, -sx * 0.35] }));
  const mantle = new THREE.Group();
  mantle.position.set(0, 0.62, -0.03);
  torso.add(mantle);
  mantle.add(M(new THREE.CylinderGeometry(0.3, 0.5, 1.3, 18, 6, true, Math.PI / 2, Math.PI), robeDark, [0, -0.65, 0], { outline: 0.012 }));

  const arm = (sx: number, rot: [number, number, number]) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.35, 0.53, 0);
    shoulder.rotation.set(...rot);
    shoulder.add(M(new THREE.CylinderGeometry(0.08, 0.07, 0.38, 10), robe, [0, -0.19, 0]));
    shoulder.add(M(new THREE.CylinderGeometry(0.068, 0.058, 0.34, 10), skin, [0, -0.52, 0]));
    shoulder.add(M(new THREE.TorusGeometry(0.07, 0.016, 6, 12), gold, [0, -0.42, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));
    shoulder.add(M(new THREE.SphereGeometry(0.07, 10, 8), skin, [0, -0.72, 0]));
    torso.add(shoulder);
    return shoulder;
  };
  arm(1, [0.1, 0, 0.14]);
  const rightArm = arm(-1, [-0.35, 0, -0.1]);

  // The trident: a long gold-bound shaft and three glowing sea-glass tines.
  const trident = new THREE.Group();
  trident.position.set(0, -0.72, 0);
  trident.rotation.x = 1.25;
  rightArm.add(trident);
  trident.add(M(new THREE.CylinderGeometry(0.026, 0.026, 2.5, 8), gold, [0, 0.45, 0], { outline: 0.008 }));
  trident.add(M(new THREE.BoxGeometry(0.42, 0.05, 0.05), gold, [0, 1.7, 0], { outline: 0.008 }));
  for (const x of [-0.19, 0, 0.19]) {
    trident.add(M(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 6), gold, [x, 1.86, 0], { outline: 0.006 }));
    trident.add(M(new THREE.ConeGeometry(0.05, 0.22, 6), glass, [x, 2.12, 0], { outline: false }));
  }
  const tridentLight = new THREE.PointLight('#5ff0e0', 0.9, 7, 2);
  tridentLight.position.set(0, 2, 0);
  trident.add(tridentLight);

  // Head: the face, flowing hair, a long beard, and a crown of coral spikes.
  torso.add(M(new THREE.CylinderGeometry(0.075, 0.085, 0.14, 10), skin, [0, 0.66, 0]));
  const head = new THREE.Group();
  head.position.y = 0.87;
  torso.add(head);
  const skull = M(new THREE.SphereGeometry(0.215, 40, 28), toon({ map: faceTex }), [0, 0, 0], { outline: 0.012 });
  skull.rotation.y = -Math.PI / 2;
  head.add(skull);
  head.add(M(new THREE.SphereGeometry(0.235, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, [0, 0.01, -0.03], { rot: [-0.6, 0, 0] }));
  // Hair falling to the shoulders behind.
  head.add(M(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 14, 1, true, Math.PI / 2, Math.PI), hair, [0, -0.22, -0.04], { outline: 0.01 }));
  // A long, full beard.
  head.add(M(new THREE.ConeGeometry(0.17, 0.5, 12), hair, [0, -0.33, 0.1], { rot: [Math.PI - 0.22, 0, 0], outline: 0.012 }));
  for (const sx of [-1, 1]) head.add(M(new THREE.ConeGeometry(0.07, 0.3, 8), hair, [sx * 0.13, -0.2, 0.14], { rot: [Math.PI - 0.3, 0, sx * 0.3], outline: 0.008 }));
  head.add(M(new THREE.TorusGeometry(0.225, 0.018, 6, 28), gold, [0, 0.1, 0], { rot: [Math.PI / 2 - 0.2, 0, 0], outline: false }));
  for (let i = 0; i < 7; i += 1) {
    const a = -Math.PI * 0.85 + (i / 6) * Math.PI * 0.7;
    const spike = M(new THREE.ConeGeometry(0.035, 0.2 + (i % 2) * 0.08, 6), coral, [Math.cos(a) * 0.2, 0.22, Math.sin(a) * 0.2], { outline: 0.006 });
    spike.rotation.z = -Math.cos(a) * 0.3;
    spike.rotation.x = Math.sin(a) * 0.3;
    head.add(spike);
  }
  root.scale.setScalar(1.08);

  let walkPhase = 0;
  const model: EntityModel = {
    root,
    update(entity, frame) {
      const t = frame.time;
      const walking = entity.data.walking === true;
      torso.scale.y = 1 + Math.sin(t * 1.4) * 0.012;
      head.rotation.y = walking ? 0 : Math.sin(t * 0.3) * 0.15;
      walkPhase += frame.dt * (walking ? 9 : 0);
      const swing = walking ? Math.sin(walkPhase) * 0.5 : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      mantle.rotation.x = 0.12 + (walking ? 0.2 : 0) + Math.sin(t * 1.2) * 0.04;
      tridentLight.intensity = 0.9 + look.U.night.value * 1.2;
    },
    dispose() {
      faceTex.dispose();
    },
  };
  return model;
};
