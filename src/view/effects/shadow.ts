import * as THREE from 'three';
import type { Vec3 } from '../../sim/types';

interface Fx {
  objects: THREE.Object3D[];
  materials: THREE.Material[];
  age: number;
  life: number;
  update(t: number, age: number): void;
}

/**
 * Hades's effects (M6): soul-bolt skulls, the hands of Grasp of the Dead, the
 * red Skull Cage warning and its bone cage, and Shadow Step's smoke. Every
 * effect eases in and out once: nothing flashes or strobes, and Reduce motion
 * makes them shorter and calmer.
 */
export class ShadowEffects {
  private readonly fx: Fx[] = [];
  private readonly sphere = new THREE.SphereGeometry(1, 14, 10);
  private readonly finger = new THREE.ConeGeometry(0.09, 1, 6);
  private readonly bar = new THREE.CylinderGeometry(0.08, 0.11, 1, 6);
  private readonly ringGeo = new THREE.RingGeometry(0.9, 1, 64);
  private readonly discGeo = new THREE.CircleGeometry(1, 48);

  constructor(private readonly scene: THREE.Scene) {
    this.finger.translate(0, 0.5, 0);
    this.bar.translate(0, 0.5, 0);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.discGeo.rotateX(-Math.PI / 2);
  }

  private glow(color: string, opacity = 1): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  }

  private add(fx: Fx): void {
    for (const o of fx.objects) this.scene.add(o);
    this.fx.push(fx);
  }

  /** A shadow skull flying from Hades's hand to its target (or a point ahead). */
  soulBolt(from: Vec3, to: Vec3, reduceMotion: boolean): void {
    const head = new THREE.Group();
    const skullMat = new THREE.MeshBasicMaterial({ color: '#d9cfff', transparent: true, toneMapped: false });
    const haloMat = this.glow('#7a3cff', 0.55);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#1a0730', transparent: true });
    const skull = new THREE.Mesh(this.sphere, skullMat);
    skull.scale.set(0.2, 0.22, 0.22);
    const halo = new THREE.Mesh(this.sphere, haloMat);
    halo.scale.setScalar(0.42);
    head.add(skull, halo);
    for (const x of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(this.sphere, eyeMat);
      eye.scale.setScalar(0.045);
      eye.position.set(x, 0.03, 0.18);
      head.add(eye);
    }
    const a = new THREE.Vector3(from.x, from.y, from.z);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const side = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(reduceMotion ? 0.4 : 1.2);
    const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(side).add(new THREE.Vector3(0, 0.8, 0)), b);
    const trailMat = this.glow('#9b6bff', 0.5);
    const trail = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.05, 6, false), trailMat);
    trail.geometry.setDrawRange(0, 0);
    const flight = 0.28;
    this.add({
      objects: [head, trail], materials: [skullMat, haloMat, eyeMat, trailMat], age: 0, life: flight + 0.35,
      update: (_t, age) => {
        const p = Math.min(1, age / flight);
        head.position.copy(curve.getPoint(p));
        head.lookAt(curve.getPoint(Math.min(1, p + 0.05)));
        const total = trail.geometry.index ? trail.geometry.index.count : 0;
        trail.geometry.setDrawRange(0, Math.floor(total * p));
        const fade = age < flight ? 1 : Math.max(0, 1 - (age - flight) / 0.35);
        skullMat.opacity = fade;
        haloMat.opacity = 0.55 * fade;
        eyeMat.opacity = fade;
        trailMat.opacity = 0.5 * fade;
        head.scale.setScalar(age < flight ? 1 : 1 + (1 - fade) * 0.6);
      },
    });
  }

  /**
   * A shadow dagger thrown from Hades's pyramid at his focus, with a violet
   * tracer that follows it (a tail a couple of metres long that catches up and
   * fades once it lands), then a dark burst.
   */
  dagger(from: Vec3, to: Vec3, reduceMotion: boolean): void {
    const blade = buildDagger();
    const mats = daggerMaterials(blade);
    const a = new THREE.Vector3(from.x, from.y, from.z);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const length = Math.max(0.1, a.distanceTo(b));
    const segments = 48;
    const radial = 6;
    const perSegment = radial * 6;
    const line = new THREE.LineCurve3(a, b);
    // A bright core inside a soft glow; both are drawn only between the tail and the dagger.
    const coreMat = this.glow('#e6dcff', 0.85);
    const glowMat = this.glow('#7a3cff', 0.4);
    const core = new THREE.Mesh(new THREE.TubeGeometry(line, segments, 0.025, radial, false), coreMat);
    const glow = new THREE.Mesh(new THREE.TubeGeometry(line, segments, 0.08, radial, false), glowMat);
    const tracers = [core, glow];
    for (const t of tracers) t.geometry.setDrawRange(0, 0);
    const tail = Math.min(1, 2.4 / length);
    const burstMat = this.glow('#5b2aa8', 0.6);
    const burst = new THREE.Mesh(this.sphere, burstMat);
    burst.position.copy(b);
    burst.scale.setScalar(0.001);
    const flight = Math.min(0.45, 0.12 + length / 40);
    const fadeTime = reduceMotion ? 0.25 : 0.4;
    blade.position.copy(a);
    blade.lookAt(b);
    this.add({
      objects: [blade, core, glow, burst], materials: [...mats, coreMat, glowMat, burstMat], age: 0, life: flight + fadeTime,
      update: (_t, age) => {
        const p = Math.min(1, age / flight);
        blade.position.lerpVectors(a, b, p);
        blade.visible = p < 1;
        // The tail follows the dagger; after it lands the tail runs on into the target.
        const after = age < flight ? 0 : (age - flight) / fadeTime;
        const head = Math.floor(segments * p);
        const from0 = Math.max(0, Math.floor(segments * (p - tail + after * tail)));
        for (const t of tracers) t.geometry.setDrawRange(from0 * perSegment, Math.max(0, head - from0) * perSegment);
        const fade = Math.max(0, 1 - after);
        coreMat.opacity = 0.85 * fade;
        glowMat.opacity = 0.4 * fade;
        burstMat.opacity = age < flight ? 0 : 0.6 * fade;
        burst.scale.setScalar(age < flight ? 0.001 : 0.25 + (1 - fade) * (reduceMotion ? 0.25 : 0.5));
      },
    });
  }

  /** Spectral hands rise in a ring around Hades (Grasp of the Dead). */
  grasp(center: Vec3, radius: number, reduceMotion: boolean): void {
    const group = new THREE.Group();
    group.position.set(center.x, center.y, center.z);
    const handMat = this.glow('#b48cff', 0.85);
    const groundMat = this.glow('#4a1f8a', 0.4);
    const ring = new THREE.Mesh(this.ringGeo, groundMat);
    ring.scale.setScalar(radius);
    ring.position.y = 0.05;
    group.add(ring);
    const hands = Math.round(radius * 3);
    const handGroups: THREE.Group[] = [];
    for (let i = 0; i < hands; i += 1) {
      const a = (i / hands) * Math.PI * 2;
      const hand = new THREE.Group();
      hand.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
      hand.rotation.y = a;
      for (let f = 0; f < 4; f += 1) {
        const finger = new THREE.Mesh(this.finger, handMat);
        finger.position.set((f - 1.5) * 0.11, 0, 0);
        finger.rotation.z = (f - 1.5) * 0.12;
        finger.rotation.x = -0.35;
        finger.scale.set(1, 0.8 + (f % 2) * 0.25, 1);
        hand.add(finger);
      }
      handGroups.push(hand);
      group.add(hand);
    }
    const life = reduceMotion ? 0.7 : 1.0;
    this.add({
      objects: [group], materials: [handMat, groundMat], age: 0, life,
      update: (_t, age) => {
        const rise = Math.min(1, age / 0.18);
        const fade = Math.max(0, 1 - Math.max(0, age - 0.35) / (life - 0.35));
        for (const hand of handGroups) hand.scale.set(1, Math.max(0.01, rise * (0.4 + fade * 0.6)), 1);
        handMat.opacity = 0.85 * fade;
        groundMat.opacity = 0.4 * fade;
      },
    });
  }

  /** The red warning ring before the Skull Cage drops (steady build-up, no blinking). */
  cageWarning(point: Vec3, radius: number, seconds: number): void {
    const group = new THREE.Group();
    group.position.set(point.x, point.y + 0.08, point.z);
    const ringMat = this.glow('#ff3b3b', 0);
    const fillMat = this.glow('#a01818', 0);
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.scale.setScalar(radius);
    const fill = new THREE.Mesh(this.discGeo, fillMat);
    group.add(ring, fill);
    const life = Math.max(0.2, seconds);
    this.add({
      objects: [group], materials: [ringMat, fillMat], age: 0, life,
      update: (_t, age) => {
        const p = Math.min(1, age / life);
        ringMat.opacity = 0.45 + 0.5 * p;
        fillMat.opacity = 0.1 + 0.2 * p;
        fill.scale.setScalar(Math.max(0.01, radius * p));
      },
    });
  }

  /** The cage of bone drops and holds for `seconds`. */
  cage(point: Vec3, radius: number, seconds: number, reduceMotion: boolean): void {
    const group = new THREE.Group();
    group.position.set(point.x, point.y, point.z);
    const boneMat = new THREE.MeshToonMaterial({ color: '#e8e0cc', transparent: true });
    const glowMat = this.glow('#8f4dff', 0.35);
    const bars = 14;
    const height = 3.4;
    for (let i = 0; i < bars; i += 1) {
      const a = (i / bars) * Math.PI * 2;
      const bar = new THREE.Mesh(this.bar, boneMat);
      bar.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
      // Each bar curves in toward the top, like ribs.
      bar.rotation.set(Math.cos(a) * -0.28, 0, Math.sin(a) * 0.28);
      bar.scale.set(1, height, 1);
      group.add(bar);
    }
    const top = new THREE.Mesh(this.sphere, boneMat);
    top.scale.set(0.55, 0.5, 0.6);
    top.position.y = height - 0.1;
    const halo = new THREE.Mesh(this.discGeo, glowMat);
    halo.scale.setScalar(radius);
    halo.position.y = 0.06;
    group.add(top, halo);
    const drop = reduceMotion ? 0.12 : 0.22;
    this.add({
      objects: [group], materials: [boneMat, glowMat], age: 0, life: seconds + 0.5,
      update: (_t, age) => {
        group.position.y = point.y + Math.max(0, 1 - age / drop) * 6;
        const fade = age < seconds ? 1 : Math.max(0, 1 - (age - seconds) / 0.5);
        boneMat.opacity = fade;
        glowMat.opacity = 0.35 * fade;
      },
    });
  }

  /** A puff of shadow where Hades melts away or reappears. */
  puff(at: Vec3, reduceMotion: boolean): void {
    const mat = new THREE.MeshBasicMaterial({ color: '#2a0f45', transparent: true, opacity: 0.7, depthWrite: false });
    const rim = this.glow('#7a3cff', 0.4);
    const ball = new THREE.Mesh(this.sphere, mat);
    const glow = new THREE.Mesh(this.sphere, rim);
    ball.position.set(at.x, at.y + 1, at.z);
    glow.position.copy(ball.position);
    const life = reduceMotion ? 0.35 : 0.55;
    this.add({
      objects: [ball, glow], materials: [mat, rim], age: 0, life,
      update: (_t, age) => {
        const p = age / life;
        ball.scale.set(0.5 + p * 0.7, 0.9 + p * 0.6, 0.5 + p * 0.7);
        glow.scale.copy(ball.scale).multiplyScalar(1.15);
        mat.opacity = 0.7 * (1 - p);
        rim.opacity = 0.4 * (1 - p);
      },
    });
  }

  update(dt: number): void {
    for (let i = this.fx.length - 1; i >= 0; i -= 1) {
      const fx = this.fx[i];
      fx.age += dt;
      fx.update(dt, fx.age);
      if (fx.age >= fx.life) {
        for (const o of fx.objects) this.scene.remove(o);
        for (const m of fx.materials) m.dispose();
        this.fx.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const fx of this.fx.splice(0)) {
      for (const o of fx.objects) this.scene.remove(o);
      for (const m of fx.materials) m.dispose();
    }
  }
}

/**
 * One shadow dagger (Cerberus's gift to Hades): a violet-white blade with a
 * dark hilt and a soft glow, its tip along +Z. Used for the daggers circling
 * him and for the ones he throws.
 */
export function buildDagger(): THREE.Group {
  const group = new THREE.Group();
  const bladeGeo = new THREE.ConeGeometry(0.06, 0.7, 4);
  bladeGeo.rotateX(Math.PI / 2);
  bladeGeo.translate(0, 0, 0.35);
  const blade = new THREE.Mesh(bladeGeo, new THREE.MeshBasicMaterial({ color: '#d6c6ff', transparent: true, toneMapped: false }));
  blade.scale.set(1, 0.3, 1);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: '#2a1840', transparent: true }));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 6), guard.material);
  grip.rotation.x = Math.PI / 2;
  grip.position.z = -0.12;
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: '#7a3cff', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  halo.scale.set(0.08, 0.05, 0.4);
  halo.position.z = 0.25;
  group.add(blade, guard, grip, halo);
  return group;
}

/** The materials in a dagger, for fading and disposal. */
export function daggerMaterials(dagger: THREE.Group): THREE.Material[] {
  const mats = new Set<THREE.Material>();
  dagger.traverse((o) => { if (o instanceof THREE.Mesh) mats.add(o.material as THREE.Material); });
  return [...mats];
}

/** A Shadow Step decoy: a dark, see-through silhouette of Hades with violet eyes. */
export function createDecoyModel(): { root: THREE.Group; update(entity: { decoy?: { ticksLeft: number } }): void } {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#1b0b2e', transparent: true, opacity: 0.6, depthWrite: false });
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#b48cff', transparent: true, toneMapped: false });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.1, 4, 10), mat);
  body.position.y = 0.95;
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 10, 1, true), mat);
  robe.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), mat);
  head.position.y = 1.95;
  root.add(body, robe, head);
  for (const x of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), eyeMat);
    eye.position.set(x, 1.98, 0.19);
    root.add(eye);
  }
  return {
    root,
    update(entity) {
      const left = entity.decoy?.ticksLeft ?? 0;
      const fade = Math.min(1, left / 15);
      mat.opacity = 0.6 * fade;
      eyeMat.opacity = fade;
    },
  };
}
