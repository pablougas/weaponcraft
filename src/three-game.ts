import * as THREE from 'three';

export function startThreeDemo(host: HTMLElement): void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#111827');
  scene.fog = new THREE.Fog('#111827', 8, 24);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 3.2, 8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  host.replaceChildren(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xc5e7ff, 0x33244f, 2));
  const keyLight = new THREE.DirectionalLight(0xffd18c, 3);
  keyLight.position.set(-4, 7, 5);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 2.5, 0.8, 7),
    new THREE.MeshStandardMaterial({ color: '#315b55', flatShading: true }),
  );
  ground.position.y = -1;
  ground.receiveShadow = true;
  scene.add(ground);

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshStandardMaterial({
      color: '#55d6be',
      emissive: '#126b71',
      metalness: 0.2,
      roughness: 0.25,
      flatShading: true,
    }),
  );
  crystal.position.y = 0.25;
  crystal.castShadow = true;
  scene.add(crystal);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.45, 0.035, 8, 72),
    new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.7, roughness: 0.3 }),
  );
  ring.rotation.x = Math.PI / 2.7;
  ring.position.y = 0.2;
  scene.add(ring);

  const stars = new THREE.BufferGeometry();
  const positions = new Float32Array(180 * 3);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (Math.random() - 0.5) * 24;
    positions[i + 1] = Math.random() * 12 - 2;
    positions[i + 2] = (Math.random() - 0.5) * 24;
  }
  stars.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(
    stars,
    new THREE.PointsMaterial({ color: '#c4b5fd', size: 0.045 }),
  ));

  const resize = (): void => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  let dragging = false;
  let previousX = 0;
  host.addEventListener('pointerdown', (event) => {
    dragging = true;
    previousX = event.clientX;
    host.setPointerCapture(event.pointerId);
  });
  host.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    ground.rotation.y += (event.clientX - previousX) * 0.008;
    previousX = event.clientX;
  });
  host.addEventListener('pointerup', () => {
    dragging = false;
  });
  host.addEventListener('wheel', (event) => {
    camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.006, 4, 12);
  }, { passive: true });

  renderer.setAnimationLoop((time) => {
    crystal.rotation.y = time * 0.00045;
    crystal.position.y = 0.25 + Math.sin(time * 0.0015) * 0.13;
    ring.rotation.z = time * 0.00018;
    renderer.render(scene, camera);
  });
}
