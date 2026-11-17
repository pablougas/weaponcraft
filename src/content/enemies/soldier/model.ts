import * as THREE from 'three';
import { groundAt, regionOf } from '../../../sim/regions';
import { SOLDIER_SPECS } from '../../../sim/systems/soldiers';
import type { EntityModel, ModelFactory } from '../../../view/entity-model';

/** The sentry's sight cone mesh: rings out from the sentry × segments across its angle. */
const CONE_RINGS = 6;
const CONE_SEGMENTS = 20;

/**
 * A human soldier of the occupying army: bronze helmet with a red crest,
 * a red tabard over grey mail, and a spear, a big round shield and a spear,
 * or a bow. Sentries carry a horn. Sentry Captains are bigger, in a bronze
 * breastplate and heavy pauldrons with a tall black-and-red plume and a red
 * cloak, and swing a halberd. A squad's leader shows the squad's sight cone on
 * the ground (yellow while calm, orange when suspicious, red once they've seen
 * you). A "?" or "!" floats above anyone who is suspicious or has raised the alarm.
 * In the Ocean they all wear diving armour instead (see `scuba`).
 */
export const createModel: ModelFactory = (look) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mail = toon({ color: '#6f7480' });
  const red = toon({ color: '#9b2b2b' });
  const bronze = toon({ color: '#b08a42' });
  const skin = toon({ color: '#c99a78' });
  const wood = toon({ color: '#6a4a33' });
  const dark = toon({ color: '#2b2730' });

  body.add(M(new THREE.CylinderGeometry(0.3, 0.36, 0.75, 10), mail, [0, 1.15, 0], { outline: 0.02 }));
  body.add(M(new THREE.BoxGeometry(0.5, 0.7, 0.08), red, [0, 1.05, 0.31], { outline: 0.012 }));
  // The head and its bronze crested helmet (swapped for a diving helmet in the Ocean).
  const head = new THREE.Group();
  body.add(head);
  head.add(M(new THREE.SphereGeometry(0.19, 14, 10), skin, [0, 1.72, 0.02], { outline: 0.012 }));
  head.add(M(new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), bronze, [0, 1.76, 0], { outline: 0.015 }));
  head.add(M(new THREE.BoxGeometry(0.05, 0.16, 0.4), red, [0, 2.0, -0.02], { outline: 0.008 }));
  head.add(M(new THREE.BoxGeometry(0.32, 0.06, 0.04), dark, [0, 1.72, 0.2], { outline: false }));
  const legs: THREE.Group[] = [];
  for (const x of [-0.13, 0.13]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.8, 0);
    leg.add(M(new THREE.CylinderGeometry(0.09, 0.08, 0.8, 8), dark, [0, -0.4, 0], { outline: 0.01 }));
    body.add(leg);
    legs.push(leg);
  }
  const arm = new THREE.Group();
  arm.position.set(0.38, 1.42, 0);
  arm.add(M(new THREE.CylinderGeometry(0.07, 0.06, 0.6, 8), mail, [0, -0.28, 0], { outline: 0.01 }));
  body.add(arm);
  const offArm = new THREE.Group();
  offArm.position.set(-0.38, 1.42, 0);
  offArm.add(M(new THREE.CylinderGeometry(0.07, 0.06, 0.6, 8), mail, [0, -0.28, 0], { outline: 0.01 }));
  body.add(offArm);

  // The "?" / "!" marker.
  const markCanvas = document.createElement('canvas');
  markCanvas.width = 64;
  markCanvas.height = 64;
  const markTexture = new THREE.CanvasTexture(markCanvas);
  const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTexture, transparent: true, depthTest: false, fog: false }));
  mark.scale.setScalar(0.55);
  mark.position.y = 2.45;
  mark.visible = false;
  root.add(mark);
  let shownMark = '';
  const drawMark = (text: string, color: string) => {
    const g = markCanvas.getContext('2d')!;
    g.clearRect(0, 0, 64, 64);
    g.font = 'bold 52px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#1a1018';
    g.strokeText(text, 32, 34);
    g.fillStyle = color;
    g.fillText(text, 32, 34);
    markTexture.needsUpdate = true;
  };

  // Gear and (for sentries) the sight cone.
  let cone: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;
  let coneRadius = 0;
  let coneHalf = 0;
  let built = false;
  let captain = false;
  /**
   * Diving armour for the humans holding Atlantis (team request, Nov 16): a
   * brass diving helmet with a round glass faceplate and side portholes, a
   * still-red crest so they read as the same army, a dark rubber suit under
   * the red tabard, twin air tanks with a hose to the helmet, and flippers.
   */
  const scuba = () => {
    head.visible = false;
    mail.color.set('#22404a');
    dark.color.set('#1a2a30');
    const brass = toon({ color: '#c79a3a', emissive: '#4a3208', emissiveIntensity: 0.15 });
    const glass = toon({ color: '#7fd6e0', emissive: '#2a8c98', emissiveIntensity: 0.45, rim: false });
    const tank = toon({ color: '#e2b23a' });
    const rubber = toon({ color: '#141c22' });
    body.add(M(new THREE.SphereGeometry(0.29, 18, 14), brass, [0, 1.76, 0], { outline: 0.016 }));
    body.add(M(new THREE.CylinderGeometry(0.33, 0.36, 0.12, 18), brass, [0, 1.5, 0], { outline: 0.012 }));
    body.add(M(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 18), glass, [0, 1.76, 0.26], { rot: [Math.PI / 2, 0, 0], outline: false }));
    body.add(M(new THREE.TorusGeometry(0.17, 0.03, 6, 18), brass, [0, 1.76, 0.28], { outline: 0.006 }));
    for (const x of [-0.25, 0.25]) {
      body.add(M(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12), glass, [x, 1.78, 0.06], { rot: [0, 0, Math.PI / 2], outline: false }));
      body.add(M(new THREE.TorusGeometry(0.08, 0.02, 5, 12), brass, [x * 1.08, 1.78, 0.06], { rot: [0, Math.PI / 2, 0], outline: false }));
    }
    body.add(M(new THREE.BoxGeometry(0.05, 0.18, 0.46), red, [0, 2.08, -0.02], { outline: 0.008 }));
    for (const x of [-0.12, 0.12]) {
      body.add(M(new THREE.CylinderGeometry(0.11, 0.11, 0.62, 12), tank, [x, 1.2, -0.38], { outline: 0.012 }));
      body.add(M(new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), tank, [x, 1.51, -0.38], { outline: false }));
    }
    body.add(M(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), rubber, [0, 1.6, -0.38], { outline: false }));
    const hose = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 1.62, -0.38), new THREE.Vector3(0.32, 1.95, -0.3), new THREE.Vector3(0.24, 1.82, -0.05)), 10, 0.035, 5);
    body.add(M(hose, rubber, [0, 0, 0], { outline: false }));
    for (const leg of legs) {
      leg.add(M(new THREE.BoxGeometry(0.22, 0.04, 0.55), rubber, [0, -0.79, 0.2], { outline: 0.008 }));
      leg.add(M(new THREE.BoxGeometry(0.26, 0.02, 0.18), toon({ color: '#2f8f96' }), [0, -0.79, 0.44], { outline: false }));
    }
  };
  const build = (kind: string, region: string) => {
    built = true;
    if (region === 'ocean') scuba();
    if (kind === 'captain') {
      captain = true;
      body.scale.setScalar(1.22);
      mark.position.y = 2.95;
      // Breastplate, heavy pauldrons, tall plume, red cloak.
      body.add(M(new THREE.BoxGeometry(0.62, 0.62, 0.16), bronze, [0, 1.18, 0.26], { outline: 0.014 }));
      body.add(M(new THREE.BoxGeometry(0.1, 0.5, 0.05), red, [0, 1.15, 0.35], { outline: false }));
      for (const x of [-0.42, 0.42]) {
        body.add(M(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bronze, [x, 1.46, 0], { rot: [0, 0, x > 0 ? -0.35 : 0.35], outline: 0.014 }));
      }
      body.add(M(new THREE.BoxGeometry(0.07, 0.34, 0.62), dark, [0, 2.1, -0.06], { outline: 0.01 }));
      body.add(M(new THREE.BoxGeometry(0.075, 0.12, 0.66), red, [0, 2.24, -0.06], { outline: false }));
      const cloak = M(new THREE.CylinderGeometry(0.34, 0.5, 1.1, 14, 1, true, Math.PI / 2, Math.PI), red, [0, 0.95, -0.04], { outline: 0.012 });
      (cloak.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
      body.add(cloak);
      // Halberd: long shaft, axe blade, top spike.
      arm.add(M(new THREE.CylinderGeometry(0.035, 0.035, 2.7, 8), wood, [0, -0.45, 0.3], { rot: [Math.PI / 2.4, 0, 0], outline: 0.01 }));
      const head = new THREE.Group();
      head.position.set(0, -0.05, 1.55);
      head.rotation.x = Math.PI / 2.4;
      arm.add(head);
      head.add(M(new THREE.BoxGeometry(0.04, 0.42, 0.3), dark, [0, 0, 0.16], { outline: 0.01 }));
      head.add(M(new THREE.ConeGeometry(0.05, 0.36, 6), dark, [0, 0.36, 0], { outline: 0.008 }));
    }
    if (kind === 'spear' || kind === 'shield') {
      arm.add(M(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), wood, [0, -0.5, 0.3], { rot: [Math.PI / 2.4, 0, 0], outline: 0.008 }));
      arm.add(M(new THREE.ConeGeometry(0.06, 0.28, 6), bronze, [0, -0.08, 1.35], { rot: [Math.PI / 2.4, 0, 0], outline: 0.008 }));
    }
    if (kind === 'shield') {
      offArm.add(M(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 18), bronze, [0, -0.35, 0.28], { rot: [Math.PI / 2, 0, 0], outline: 0.02 }));
      offArm.add(M(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12), red, [0, -0.35, 0.34], { rot: [Math.PI / 2, 0, 0], outline: false }));
    }
    if (kind === 'archer') {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 6, 20, Math.PI), wood);
      bow.position.set(0, -0.45, 0.25);
      bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
      offArm.add(bow);
      body.add(M(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8), wood, [0.15, 1.3, -0.3], { rot: [0.3, 0, 0.2], outline: 0.008 }));
    }
    if (kind === 'sentry' || kind === 'captain') {
      if (kind === 'sentry') {
        offArm.add(M(new THREE.ConeGeometry(0.1, 0.45, 10), bronze, [0, -0.5, 0.15], { rot: [Math.PI / 2, 0, 0], outline: 0.01 }));
        arm.add(M(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), wood, [0, -0.5, 0.3], { rot: [Math.PI / 2.4, 0, 0], outline: 0.008 }));
        arm.add(M(new THREE.ConeGeometry(0.05, 0.24, 6), bronze, [0, -0.08, 1.35], { rot: [Math.PI / 2.4, 0, 0], outline: 0.008 }));
      }
      // The squad's sight cone, shown only while this one leads (see update).
      coneRadius = SOLDIER_SPECS[kind].sight;
      coneHalf = SOLDIER_SPECS[kind].cone;
      // A fan of CONE_RINGS rings so it drapes over hills instead of cutting through them.
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((1 + CONE_RINGS * (CONE_SEGMENTS + 1)) * 3), 3));
      const index: number[] = [];
      const at = (ring: number, i: number) => 1 + (ring - 1) * (CONE_SEGMENTS + 1) + i;
      for (let i = 0; i < CONE_SEGMENTS; i += 1) index.push(0, at(1, i), at(1, i + 1));
      for (let ring = 2; ring <= CONE_RINGS; ring += 1) {
        for (let i = 0; i < CONE_SEGMENTS; i += 1) index.push(at(ring - 1, i), at(ring, i), at(ring, i + 1), at(ring - 1, i), at(ring, i + 1), at(ring - 1, i + 1));
      }
      geometry.setIndex(index);
      cone = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#ffd35c', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
      cone.frustumCulled = false;
      cone.renderOrder = 2;
      root.add(cone);
    }
  };

  const model: EntityModel = {
    root,
    update(entity, frame) {
      const s = entity.soldier;
      if (!s) return;
      if (!built) build(s.kind, regionOf(entity));
      const t = frame.time;
      // Walking bob and leg swing when moving (from the patrol/attack state), a raised arm while winding up.
      const moving = s.state !== 'patrol' || s.patrol.length > 0;
      const swing = moving && !frame.reduceMotion ? Math.sin(t * 7 + entity.position.x) * 0.4 : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      // A captain heaves the halberd high over his head before the slam: a clear tell to roll.
      arm.rotation.x = s.windup > 0 ? (captain ? -2.7 : -1.4) : s.state === 'attack' ? -0.5 : 0;
      if (captain) offArm.rotation.x = s.windup > 0 ? -2.5 : 0;
      if (!captain) offArm.rotation.x = s.kind === 'shield' && s.state === 'attack' ? -1.2 : s.kind === 'archer' && s.windup > 0 ? -1.5 : 0;
      body.rotation.z = (entity.creature?.stun ?? 0) > 0 ? 0.15 : 0;
      const markText = s.state === 'attack' ? '!' : s.state === 'suspicious' || s.state === 'search' ? '?' : '';
      if (markText !== shownMark) {
        shownMark = markText;
        mark.visible = markText !== '';
        if (markText) drawMark(markText, markText === '!' ? '#ff4a3a' : '#ffd35c');
      }
      if (cone) cone.visible = !!s.leader || !s.squadId;
      if (cone?.visible) {
        // The cone lies on the ground in the direction the sentry looks.
        const pos = cone.geometry.attributes.position as THREE.BufferAttribute;
        const yaw = s.facing;
        const lift = 0.15;
        pos.setXYZ(0, 0, lift, 0);
        let v = 1;
        for (let ring = 1; ring <= CONE_RINGS; ring += 1) {
          const r = (coneRadius * ring) / CONE_RINGS;
          for (let i = 0; i <= CONE_SEGMENTS; i += 1) {
            const a = -coneHalf + (2 * coneHalf * i) / CONE_SEGMENTS;
            // Local to the root (which is rotated by rotationY).
            const lx = Math.sin(a + yaw - entity.rotationY) * r;
            const lz = Math.cos(a + yaw - entity.rotationY) * r;
            const wx = entity.position.x + Math.sin(a + yaw) * r;
            const wz = entity.position.z + Math.cos(a + yaw) * r;
            pos.setXYZ(v++, lx, groundAt(regionOf(entity), wx, wz) - entity.position.y + lift, lz);
          }
        }
        pos.needsUpdate = true;
        const alarm = s.state === 'attack';
        cone.material.color.set(alarm ? '#ff4a3a' : s.awareness > 25 ? '#ff9a3c' : '#ffd35c');
        cone.material.opacity = alarm ? 0.38 : 0.26 + Math.min(0.12, s.awareness / 400);
      }
    },
  };
  return model;
};
