import * as THREE from 'three';

/**
 * Temporary backdrop for the M0 skeleton (title screen and an empty world).
 * M2 replaces it with the meadow ported from docs/reference/style-test.html.
 * View-only: it holds no game state.
 */
export interface PlaceholderScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize(width: number, height: number): void;
  /** Advances the decorative animation to `timeMs`. */
  update(timeMs: number): void;
}

export function createPlaceholderScene(): PlaceholderScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#3a4e7a');
  scene.fog = new THREE.Fog('#3a4e7a', 9, 26);

  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);

  scene.add(new THREE.HemisphereLight('#c9dceb', '#3a4e7a', 1.6));
  const sun = new THREE.DirectionalLight('#ffc870', 3);
  sun.position.set(-4, 7, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 2.5, 0.8, 7),
    new THREE.MeshStandardMaterial({ color: '#4f7f5a', flatShading: true }),
  );
  ground.position.y = -1;
  ground.receiveShadow = true;
  scene.add(ground);

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshStandardMaterial({
      color: '#4ff0e0',
      emissive: '#126b71',
      metalness: 0.2,
      roughness: 0.25,
      flatShading: true,
    }),
  );
  crystal.castShadow = true;
  scene.add(crystal);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.45, 0.035, 8, 72),
    new THREE.MeshStandardMaterial({ color: '#f2c45a', metalness: 0.7, roughness: 0.3 }),
  );
  ring.rotation.x = Math.PI / 2.7;
  ring.position.y = 0.2;
  scene.add(ring);

  // Fixed pseudo-random star field so every load (and screenshot) matches.
  const starCount = 180;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 12345.6789;
    const c = Math.sin(i * 39.425) * 24634.6345;
    positions[i * 3] = (a - Math.floor(a) - 0.5) * 24;
    positions[i * 3 + 1] = (b - Math.floor(b)) * 12 - 2;
    positions[i * 3 + 2] = (c - Math.floor(c) - 0.5) * 24;
  }
  const stars = new THREE.BufferGeometry();
  stars.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#ffe6a6', size: 0.045 })));

  return {
    scene,
    camera,
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    update(timeMs) {
      const orbit = timeMs * 0.00006;
      camera.position.set(Math.sin(orbit) * 8, 3.2, Math.cos(orbit) * 8);
      camera.lookAt(0, 0, 0);
      crystal.rotation.y = timeMs * 0.00045;
      crystal.position.y = 0.25 + Math.sin(timeMs * 0.0015) * 0.13;
      ring.rotation.z = timeMs * 0.00018;
    },
  };
}
