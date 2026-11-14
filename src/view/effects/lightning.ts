import * as THREE from 'three';
import { rng } from '../../sim/rng';
import type { Vec3 } from '../../sim/types';

interface Bolt {
  group: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
  age: number;
  life: number;
}

/**
 * Chain Lightning bolts: jagged glowing segments from the spear tip through
 * each target. Each bolt appears once and fades smoothly; no flicker or
 * strobing (photosensitivity rule). Reduce motion makes them shorter and dimmer.
 */
export class LightningEffects {
  private readonly bolts: Bolt[] = [];
  private readonly core = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(private readonly scene: THREE.Scene) {
    this.core.translate(0, 0.5, 0);
  }

  spawn(points: Vec3[], seed: number, reduceMotion: boolean): void {
    if (points.length < 2) return;
    const random = rng(seed, 'lightning-shape');
    const group = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({ color: '#e8f8ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const glowMat = new THREE.MeshBasicMaterial({ color: '#6ec6ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35, toneMapped: false });
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < points.length - 1; i += 1) {
      // Jag each link into a few segments with small sideways kinks.
      const start = new THREE.Vector3(points[i].x, points[i].y, points[i].z);
      const end = new THREE.Vector3(points[i + 1].x, points[i + 1].y, points[i + 1].z);
      const steps = Math.max(3, Math.round(start.distanceTo(end) / 0.9));
      const path = [start];
      for (let s = 1; s < steps; s += 1) {
        const p = start.clone().lerp(end, s / steps);
        p.x += random.range(-0.25, 0.25);
        p.y += random.range(-0.25, 0.25);
        p.z += random.range(-0.25, 0.25);
        path.push(p);
      }
      path.push(end);
      for (let s = 0; s < path.length - 1; s += 1) {
        a.copy(path[s]);
        b.copy(path[s + 1]);
        const length = a.distanceTo(b);
        const direction = b.clone().sub(a).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(this.up, direction);
        for (const [material, radius] of [[coreMat, 0.035], [glowMat, 0.11]] as const) {
          const mesh = new THREE.Mesh(this.core, material);
          mesh.position.copy(a);
          mesh.quaternion.copy(quaternion);
          mesh.scale.set(radius, length, radius);
          mesh.frustumCulled = false;
          group.add(mesh);
        }
      }
    }
    this.scene.add(group);
    this.bolts.push({ group, materials: [coreMat, glowMat], age: 0, life: reduceMotion ? 0.3 : 0.45 });
  }

  update(dt: number): void {
    for (let i = this.bolts.length - 1; i >= 0; i -= 1) {
      const bolt = this.bolts[i];
      bolt.age += dt;
      const fade = Math.max(0, 1 - bolt.age / bolt.life);
      bolt.materials[0].opacity = fade;
      bolt.materials[1].opacity = 0.35 * fade;
      if (bolt.age >= bolt.life) {
        this.scene.remove(bolt.group);
        for (const material of bolt.materials) material.dispose();
        this.bolts.splice(i, 1);
      }
    }
  }

  /** Removes every bolt (new game). */
  clear(): void {
    for (const bolt of this.bolts) {
      this.scene.remove(bolt.group);
      for (const material of bolt.materials) material.dispose();
    }
    this.bolts.length = 0;
  }
}
