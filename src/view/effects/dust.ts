import * as THREE from 'three';
import type { Vec3 } from '../../sim/types';

interface Puff {
  meshes: THREE.Mesh[];
  material: THREE.MeshBasicMaterial;
  age: number;
}

const LIFE = 0.55;

/** A small ring of dust at the feet when Zeus rolls. Reduce motion makes it smaller. */
export class DustEffects {
  private readonly puffs: Puff[] = [];
  private readonly geometry = new THREE.IcosahedronGeometry(1, 0);

  constructor(private readonly scene: THREE.Scene) {}

  spawn(at: Vec3, heading: number, reduceMotion: boolean): void {
    const material = new THREE.MeshBasicMaterial({ color: '#cdb98f', transparent: true, opacity: 0.55, depthWrite: false });
    const meshes: THREE.Mesh[] = [];
    const count = reduceMotion ? 4 : 7;
    for (let i = 0; i < count; i += 1) {
      // Spread behind the roll, fixed angles (no randomness needed for dust).
      const a = heading + Math.PI + (i / (count - 1) - 0.5) * 2.2;
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.position.set(at.x + Math.sin(a) * 0.25, at.y + 0.12, at.z + Math.cos(a) * 0.25);
      mesh.userData.dir = new THREE.Vector3(Math.sin(a), 0.35, Math.cos(a));
      mesh.scale.setScalar(0.12);
      this.scene.add(mesh);
      meshes.push(mesh);
    }
    this.puffs.push({ meshes, material, age: 0 });
  }

  update(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i -= 1) {
      const puff = this.puffs[i];
      puff.age += dt;
      const t = Math.min(1, puff.age / LIFE);
      puff.material.opacity = 0.55 * (1 - t);
      for (const mesh of puff.meshes) {
        mesh.position.addScaledVector(mesh.userData.dir as THREE.Vector3, dt * 1.6 * (1 - t));
        mesh.scale.setScalar(0.12 + t * 0.32);
      }
      if (puff.age >= LIFE) {
        for (const mesh of puff.meshes) this.scene.remove(mesh);
        puff.material.dispose();
        this.puffs.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const puff of this.puffs) {
      for (const mesh of puff.meshes) this.scene.remove(mesh);
      puff.material.dispose();
    }
    this.puffs.length = 0;
  }
}
