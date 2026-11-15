import * as THREE from 'three';
import type { Vec3 } from '../../sim/types';

/**
 * A shadow portal (Hades's way in and out, M5.1): an upright disc of
 * swirling violet-black with a teal rim and drifting dark motes. Drawn from
 * the cutscene's timeline; `open` 0–1 scales it in and out. No flashing.
 */
export class ShadowPortal {
  readonly group = new THREE.Group();
  private readonly disc: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  private readonly rim: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;

  constructor(scene: THREE.Scene) {
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.25, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { time: { value: 0 }, open: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform float time, open; varying vec2 vUv;
          void main(){
            vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
            float swirl = sin(a * 5.0 - r * 9.0 + time * 1.6) * 0.5 + 0.5;
            vec3 col = mix(vec3(0.02, 0.0, 0.05), vec3(0.32, 0.16, 0.55), swirl * (1.0 - r));
            col += vec3(0.12, 0.75, 0.7) * smoothstep(0.75, 1.0, r) * 0.6;
            float alpha = smoothstep(1.0, 0.92, r) * open;
            gl_FragColor = vec4(col, alpha);
          }`,
      }),
    );
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(1.27, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: '#5ff0e0', transparent: true, opacity: 0, toneMapped: false }));
    this.group.add(this.disc, this.rim);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Places the portal standing on `at`, facing `toward`, open by `open` (0 = hidden). */
  update(at: Vec3 | undefined, toward: Vec3 | undefined, open: number, time: number): void {
    this.group.visible = !!at && open > 0.01;
    if (!at || !this.group.visible) return;
    const size = Math.max(0.01, open);
    this.group.position.set(at.x, at.y + 1.35 * size, at.z);
    this.group.scale.set(size, size * 1.1, size);
    if (toward) this.group.lookAt(toward.x, at.y + 1.35 * size, toward.z);
    this.disc.material.uniforms.time.value = time;
    this.disc.material.uniforms.open.value = Math.min(1, open);
    this.rim.material.opacity = 0.8 * Math.min(1, open);
  }
}
