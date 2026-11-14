import * as THREE from 'three';

type Rand = () => number;

interface Bird {
  group: THREE.Group;
  left: THREE.Mesh;
  right: THREE.Mesh;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  cx: number;
  cz: number;
}

export interface Birds {
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
  update(timeSeconds: number): void;
}

/** A flock circling over the meadow toward Olympus during the day. */
export function buildBirds(rand: Rand): Birds {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: '#2a2f45', side: THREE.DoubleSide, transparent: true });
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.5, 0, 0, 0.5, 2.2, 0, 0.1], 3));
  const birds: Bird[] = [];
  for (let i = 0; i < 14; i += 1) {
    const bird = new THREE.Group();
    const left = new THREE.Mesh(wing, material);
    const right = new THREE.Mesh(wing, material);
    right.scale.x = -1;
    bird.add(left, right);
    group.add(bird);
    const radius = 70 + rand() * 140;
    const height = 55 + rand() * 45;
    const speed = 0.05 + rand() * 0.06;
    const phase = rand() * 6.28;
    const cx = -20 + rand() * 60;
    const cz = -220 - rand() * 120;
    birds.push({ group: bird, left, right, radius, height, speed, phase, cx, cz });
  }
  return {
    group,
    material,
    update(t) {
      for (const b of birds) {
        const a = b.phase + t * b.speed;
        b.group.position.set(b.cx + Math.cos(a) * b.radius, b.height + Math.sin(t * 0.7 + b.phase) * 3, b.cz + Math.sin(a) * b.radius);
        b.group.rotation.y = -a;
        const flap = Math.sin(t * 9 + b.phase * 5) * 0.6;
        b.left.rotation.z = flap;
        b.right.rotation.z = -flap;
      }
    },
  };
}
