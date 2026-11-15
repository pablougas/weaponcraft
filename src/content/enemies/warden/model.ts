import * as THREE from 'three';
import { WARDEN } from '../../../sim/systems/warden';
import type { EntityModel, ModelFactory } from '../../../view/entity-model';

/**
 * The Warden: a hulking man, about 4.5 m tall, in blackened iron plate with
 * bronze trim and spikes, a horned great-helm with a burning visor slit, a
 * torn red cloak, and a two-handed iron maul. Animated from the sim: a heavy
 * run, the maul raised overhead before a swing, a deep crouch before a leap,
 * shoulder down before a dash, and a collapse when he falls. When enraged his
 * visor burns brighter (steady, never flashing).
 */
export const createModel: ModelFactory = (look) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  // Modelled at ~3.5 m, shown at ~4.5 m (team request: bigger).
  const SIZE = 1.3;
  rig.scale.setScalar(SIZE);
  root.add(rig);
  const iron = toon({ color: '#4a4c58' });
  const plate = toon({ color: '#666b7a' });
  const bronze = toon({ color: '#b8893c' });
  const red = toon({ color: '#7c1d1d' });
  const skin = toon({ color: '#8a5a44' });
  const visor = toon({ color: '#ffb35c', emissive: '#ff5a1a', emissiveIntensity: 1, rim: false });
  const leather = toon({ color: '#3a2a22' });

  // Torso: a barrel chest in plate with a bronze-trimmed belt.
  const torso = new THREE.Group();
  torso.position.y = 1.75;
  rig.add(torso);
  torso.add(M(new THREE.CylinderGeometry(0.72, 0.55, 1.25, 10), plate, [0, 0.55, 0], { outline: 0.03 }));
  torso.add(M(new THREE.BoxGeometry(1.25, 0.5, 0.75), plate, [0, 1.05, 0.05], { outline: 0.03 }));
  torso.add(M(new THREE.CylinderGeometry(0.6, 0.62, 0.22, 10), bronze, [0, -0.05, 0], { outline: 0.02 }));
  // Spiked pauldrons.
  for (const side of [-1, 1]) {
    torso.add(M(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.7), iron, [side * 0.78, 1.2, 0], { outline: 0.025 }));
    for (const k of [-1, 0, 1]) torso.add(M(new THREE.ConeGeometry(0.08, 0.36, 6), bronze, [side * (0.85 + Math.abs(k) * 0.05), 1.58, k * 0.18], { rot: [0, 0, side * -0.35], outline: 0.01 }));
  }
  // Head: thick neck, a horned great-helm with a burning visor slit.
  torso.add(M(new THREE.CylinderGeometry(0.24, 0.3, 0.3, 8), skin, [0, 1.4, 0], { outline: 0.015 }));
  const head = new THREE.Group();
  head.position.set(0, 1.78, 0.04);
  torso.add(head);
  head.add(M(new THREE.BoxGeometry(0.62, 0.66, 0.62), iron, [0, 0, 0], { outline: 0.025 }));
  head.add(M(new THREE.BoxGeometry(0.66, 0.1, 0.66), bronze, [0, 0.3, 0], { outline: 0.015 }));
  const slit = M(new THREE.BoxGeometry(0.5, 0.12, 0.05), visor, [0, 0.05, 0.32], { outline: false });
  head.add(slit);
  // A furnace-rune burning on his breastplate (the Mk. II's stolen fire).
  torso.add(M(new THREE.OctahedronGeometry(0.2, 0), visor, [0, 0.95, 0.4], { scale: [1, 1.3, 0.4], outline: false }));
  head.add(M(new THREE.BoxGeometry(0.06, 0.3, 0.05), iron, [0, -0.12, 0.33], { outline: false }));
  for (const side of [-1, 1]) {
    head.add(M(new THREE.ConeGeometry(0.11, 0.7, 8), bronze, [side * 0.42, 0.42, -0.05], { rot: [-0.3, 0, side * -0.9], outline: 0.012 }));
  }
  // A torn red cloak hanging from the shoulders.
  const cloak = M(new THREE.BoxGeometry(1.1, 1.7, 0.06), red, [0, 0.45, -0.45], { rot: [0.12, 0, 0], outline: 0.015 });
  torso.add(cloak);

  // Legs: armoured, pivoting at the hip.
  const legs = [-0.32, 0.32].map((x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 1.75, 0);
    leg.add(M(new THREE.CylinderGeometry(0.26, 0.22, 0.95, 8), leather, [0, -0.45, 0], { outline: 0.02 }));
    leg.add(M(new THREE.CylinderGeometry(0.24, 0.2, 0.8, 8), plate, [0, -1.25, 0], { outline: 0.02 }));
    leg.add(M(new THREE.BoxGeometry(0.42, 0.22, 0.62), iron, [0, -1.65, 0.1], { outline: 0.02 }));
    rig.add(leg);
    return leg;
  });

  // Arms, both on the maul.
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.82, 1.05, 0.05);
    arm.add(M(new THREE.CylinderGeometry(0.2, 0.18, 0.75, 8), plate, [0, -0.38, 0], { outline: 0.02 }));
    arm.add(M(new THREE.CylinderGeometry(0.2, 0.16, 0.6, 8), leather, [0, -0.95, 0], { outline: 0.02 }));
    arm.add(M(new THREE.SphereGeometry(0.2, 8, 6), iron, [0, -1.28, 0], { outline: 0.015 }));
    torso.add(arm);
    return arm;
  });
  // The maul: a long haft and a huge iron head with bronze bands, held in the right hand.
  const maul = new THREE.Group();
  maul.position.set(0, -1.28, 0);
  maul.add(M(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), leather, [0, 0.4, 0], { outline: 0.012 }));
  maul.add(M(new THREE.BoxGeometry(0.75, 0.75, 1.1), iron, [0, 1.75, 0], { outline: 0.025 }));
  for (const z of [-0.4, 0.4]) maul.add(M(new THREE.BoxGeometry(0.8, 0.8, 0.1), bronze, [0, 1.75, z], { outline: 0.012 }));
  arms[1].add(maul);

  let stride = 0;
  let fall = 0;
  const model: EntityModel = {
    root,
    update(entity, frame) {
      const w = entity.warden;
      if (!w) return;
      const a = w.attack;
      // Running: a heavy stride with arm swing.
      if (w.walking) stride += frame.dt * 7;
      const swing = w.walking ? Math.sin(stride) * 0.55 : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      torso.rotation.set(w.walking ? 0.12 : 0, 0, 0);
      rig.position.y = w.walking ? Math.abs(Math.cos(stride)) * 0.08 * SIZE : 0;
      arms[0].rotation.set(-0.5, 0, 0.2);
      arms[1].rotation.set(-0.5, 0, -0.2);
      maul.rotation.set(0.9, 0, 0);

      if (a) {
        const total = a.kind === 'swing' ? WARDEN.swing.windup : a.kind === 'leap' ? WARDEN.leap.windup : WARDEN.dash.windup;
        const f = a.windup > 0 ? 1 - a.windup / total : 1;
        if (a.kind === 'swing') {
          if (a.windup > 0) {
            // Maul raised high overhead, leaning back.
            arms[1].rotation.set(-0.5 - 2.4 * f, 0, -0.2);
            arms[0].rotation.set(-0.5 - 2.2 * f, 0, 0.35);
            torso.rotation.x = -0.25 * f;
          } else {
            // Brought down in front.
            arms[1].rotation.set(-1.2, 0, -0.2);
            arms[0].rotation.set(-1.1, 0, 0.35);
            torso.rotation.x = 0.35;
            maul.rotation.x = 1.6;
          }
        } else if (a.kind === 'leap') {
          // Crouch, then airborne with the maul overhead.
          if (a.windup > 0) {
            rig.position.y = -0.45 * f * SIZE;
            legs[0].rotation.x = legs[1].rotation.x = -0.6 * f;
            torso.rotation.x = 0.35 * f;
          } else {
            arms[1].rotation.set(-2.8, 0, -0.2);
            arms[0].rotation.set(-2.6, 0, 0.35);
            legs[0].rotation.x = -0.7;
            legs[1].rotation.x = 0.4;
          }
        } else {
          // Shoulder down, then the charge.
          torso.rotation.set(0.45 * f, 0.5 * f, 0);
          legs[0].rotation.x = a.windup > 0 ? -0.4 * f : Math.sin(frame.time * 20) * 0.6;
          legs[1].rotation.x = a.windup > 0 ? 0.3 * f : -Math.sin(frame.time * 20) * 0.6;
        }
      }
      // Enraged: the visor burns brighter (steady). Defeated: it goes dark and he topples.
      visor.emissiveIntensity = w.mode === 'defeated' ? 0 : w.enraged ? 2.2 : 1;
      visor.emissive.set(w.enraged ? '#ff2a10' : '#ff5a1a');
      if (w.mode === 'defeated') {
        fall = frame.dt === 0 ? 1 : Math.min(1, fall + frame.dt * 1.2);
        root.rotation.order = 'YXZ';
        root.rotation.x = -Math.PI / 2 * fall * 0.95;
        rig.position.y = 0.3 * fall * SIZE;
      } else {
        fall = 0;
        root.rotation.x = 0;
      }
      cloak.rotation.x = 0.12 + (w.walking ? 0.35 : 0) + (a?.kind === 'leap' && a.windup === 0 ? 0.6 : 0);
    },
  };
  return model;
};
