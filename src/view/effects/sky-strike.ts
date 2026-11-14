import * as THREE from 'three';
import type { Vec3 } from '../../sim/types';
import type { LightningEffects } from './lightning';

interface Marker {
  group: THREE.Group;
  ring: THREE.Mesh;
  fill: THREE.Mesh;
  materials: THREE.MeshBasicMaterial[];
  age: number;
  life: number;
  radius: number;
}

interface Impact {
  light: THREE.PointLight;
  shock: THREE.Mesh;
  scorch: THREE.Mesh;
  materials: THREE.MeshBasicMaterial[];
  age: number;
  radius: number;
  reduceMotion: boolean;
}

/** How long the scorch mark stays on the grass, seconds. */
const SCORCH_SECONDS = 4;

/**
 * Sky Strike visuals (M3.1): a glowing ring marks the spot, then a huge bolt
 * falls from the sky with one slow bright swell (never strobing), an expanding
 * shock ring and a scorch mark that fades. Reduce motion dims the swell.
 */
export class SkyStrikeEffects {
  private readonly markers: Marker[] = [];
  private readonly impacts: Impact[] = [];
  private readonly ringGeo = new THREE.RingGeometry(0.92, 1, 64);
  private readonly discGeo = new THREE.CircleGeometry(1, 48);

  constructor(private readonly scene: THREE.Scene, private readonly lightning: LightningEffects) {
    this.ringGeo.rotateX(-Math.PI / 2);
    this.discGeo.rotateX(-Math.PI / 2);
  }

  /** The warning ring before the strike lands. */
  telegraph(point: Vec3, radius: number, seconds: number): void {
    const group = new THREE.Group();
    group.position.set(point.x, point.y + 0.08, point.z);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#8fd8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const fillMat = new THREE.MeshBasicMaterial({ color: '#4aa8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.scale.setScalar(radius);
    const fill = new THREE.Mesh(this.discGeo, fillMat);
    fill.scale.setScalar(0.01);
    group.add(ring, fill);
    this.scene.add(group);
    this.markers.push({ group, ring, fill, materials: [ringMat, fillMat], age: 0, life: Math.max(0.2, seconds), radius });
  }

  /** The bolt lands. */
  strike(point: Vec3, radius: number, seed: number, reduceMotion: boolean): void {
    // Clear any marker at this spot.
    for (const marker of this.markers.splice(0)) this.disposeMarker(marker);

    // Three thick jagged bolts from high above converge on the point.
    const top: Vec3 = { x: point.x + 3, y: point.y + 70, z: point.z - 2 };
    const ground: Vec3 = { x: point.x, y: point.y + 0.1, z: point.z };
    this.lightning.spawn([top, { x: point.x + 1.2, y: point.y + 30, z: point.z }, ground], seed, reduceMotion, 3.2);
    this.lightning.spawn([{ ...top, x: top.x - 5 }, { x: point.x - 1, y: point.y + 18, z: point.z + 1 }, ground], seed + 1, reduceMotion, 1.6);
    this.lightning.spawn([{ ...top, z: top.z + 5 }, ground], seed + 2, reduceMotion, 1.4);

    const light = new THREE.PointLight('#bfe6ff', 0, radius * 8, 1.5);
    light.position.set(point.x, point.y + 4, point.z);
    const shockMat = new THREE.MeshBasicMaterial({ color: '#d8f2ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const shock = new THREE.Mesh(this.ringGeo, shockMat);
    shock.position.set(point.x, point.y + 0.12, point.z);
    shock.scale.setScalar(0.5);
    const scorchMat = new THREE.MeshBasicMaterial({ color: '#1a1410', transparent: true, opacity: 0.55, depthWrite: false });
    const scorch = new THREE.Mesh(this.discGeo, scorchMat);
    scorch.position.set(point.x, point.y + 0.06, point.z);
    scorch.scale.setScalar(radius * 0.7);
    this.scene.add(light, shock, scorch);
    this.impacts.push({ light, shock, scorch, materials: [shockMat, scorchMat], age: 0, radius, reduceMotion });
  }

  update(dt: number): void {
    for (let i = this.markers.length - 1; i >= 0; i -= 1) {
      const marker = this.markers[i];
      marker.age += dt;
      const p = Math.min(1, marker.age / marker.life);
      // Steady build-up (no blinking): ring brightens, inner disc grows to the edge.
      (marker.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.6 * p;
      (marker.fill.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.18 * p;
      marker.fill.scale.setScalar(Math.max(0.01, marker.radius * p));
      if (marker.age > marker.life + 0.5) {
        this.disposeMarker(marker);
        this.markers.splice(i, 1);
      }
    }
    for (let i = this.impacts.length - 1; i >= 0; i -= 1) {
      const impact = this.impacts[i];
      impact.age += dt;
      const t = impact.age;
      // One smooth swell up and down over ~0.6 s.
      const swell = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.5);
      impact.light.intensity = swell * (impact.reduceMotion ? 40 : 120);
      const grow = Math.min(1, t / 0.45);
      impact.shock.scale.setScalar(0.5 + grow * impact.radius * 1.4);
      impact.materials[0].opacity = 0.9 * (1 - grow);
      impact.materials[1].opacity = 0.55 * Math.max(0, 1 - t / SCORCH_SECONDS);
      if (t > SCORCH_SECONDS) {
        this.disposeImpact(impact);
        this.impacts.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const marker of this.markers.splice(0)) this.disposeMarker(marker);
    for (const impact of this.impacts.splice(0)) this.disposeImpact(impact);
  }

  private disposeMarker(marker: Marker): void {
    this.scene.remove(marker.group);
    for (const material of marker.materials) material.dispose();
  }

  private disposeImpact(impact: Impact): void {
    this.scene.remove(impact.light, impact.shock, impact.scorch);
    for (const material of impact.materials) material.dispose();
  }
}
