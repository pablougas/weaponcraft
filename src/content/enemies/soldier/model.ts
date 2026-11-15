import * as THREE from 'three';
import { groundAt } from '../../../sim/regions';
import type { EntityModel, ModelFactory } from '../../../view/entity-model';

/**
 * A human soldier of the occupying army: bronze helmet with a red crest,
 * a red tabard over grey mail, and a spear, a big round shield and a spear,
 * or a bow. Sentries carry a horn and show their sight cone on the ground
 * (yellow while calm, orange when suspicious, red once they've seen you).
 * A "?" or "!" floats above anyone who is suspicious or has raised the alarm.
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
  body.add(M(new THREE.SphereGeometry(0.19, 14, 10), skin, [0, 1.72, 0.02], { outline: 0.012 }));
  body.add(M(new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), bronze, [0, 1.76, 0], { outline: 0.015 }));
  body.add(M(new THREE.BoxGeometry(0.05, 0.16, 0.4), red, [0, 2.0, -0.02], { outline: 0.008 }));
  body.add(M(new THREE.BoxGeometry(0.32, 0.06, 0.04), dark, [0, 1.72, 0.2], { outline: false }));
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
  const build = (kind: string) => {
    built = true;
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
    if (kind === 'sentry') {
      offArm.add(M(new THREE.ConeGeometry(0.1, 0.45, 10), bronze, [0, -0.5, 0.15], { rot: [Math.PI / 2, 0, 0], outline: 0.01 }));
      arm.add(M(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6), wood, [0, -0.4, 0], { outline: 0.008 }));
      coneRadius = 26;
      coneHalf = 0.6;
      const segments = 20;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segments + 2) * 3), 3));
      const index: number[] = [];
      for (let i = 1; i <= segments; i += 1) index.push(0, i, i + 1);
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
      if (!built) build(s.kind);
      const t = frame.time;
      // Walking bob and leg swing when moving (from the patrol/attack state), a raised arm while winding up.
      const moving = s.state !== 'patrol' || s.patrol.length > 0;
      const swing = moving && !frame.reduceMotion ? Math.sin(t * 7 + entity.position.x) * 0.4 : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      arm.rotation.x = s.windup > 0 ? -1.4 : s.state === 'attack' ? -0.5 : 0;
      offArm.rotation.x = s.kind === 'shield' && s.state === 'attack' ? -1.2 : s.kind === 'archer' && s.windup > 0 ? -1.5 : 0;
      body.rotation.z = (entity.creature?.stun ?? 0) > 0 ? 0.15 : 0;
      const markText = s.state === 'attack' ? '!' : s.state === 'suspicious' || s.state === 'search' ? '?' : '';
      if (markText !== shownMark) {
        shownMark = markText;
        mark.visible = markText !== '';
        if (markText) drawMark(markText, markText === '!' ? '#ff4a3a' : '#ffd35c');
      }
      if (cone) {
        // The cone lies on the ground in the direction the sentry looks.
        const pos = cone.geometry.attributes.position as THREE.BufferAttribute;
        const yaw = s.facing;
        const lift = 0.15;
        pos.setXYZ(0, 0, lift, 0);
        const segments = pos.count - 2;
        for (let i = 0; i <= segments; i += 1) {
          const a = -coneHalf + (2 * coneHalf * i) / segments;
          // Local to the root (which is rotated by rotationY).
          const lx = Math.sin(a + yaw - entity.rotationY) * coneRadius;
          const lz = Math.cos(a + yaw - entity.rotationY) * coneRadius;
          const wx = entity.position.x + Math.sin(a + yaw) * coneRadius;
          const wz = entity.position.z + Math.cos(a + yaw) * coneRadius;
          pos.setXYZ(i + 1, lx, groundAt('underworld', wx, wz) - entity.position.y + lift, lz);
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
