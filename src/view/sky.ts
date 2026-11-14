import * as THREE from 'three';
import type { SharedUniforms } from './look';

/** Painted shader sky: gradient, sun glow + disc, drifting clouds, stars and a night aurora band. */
export function createSky(U: SharedUniforms): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      time: U.time,
      night: U.night,
      sunDir: U.sunDir,
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      skySun: { value: new THREE.Color() },
      cloudLit: { value: new THREE.Color() },
      cloudDark: { value: new THREE.Color() },
      groundCol: { value: new THREE.Color() },
      discGain: { value: 25 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 sunDir, zenith, horizon, skySun, cloudLit, cloudDark, groundCol; uniform float time, night, discGain;
      varying vec3 vDir;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=a*n2(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir); float y = d.y;
        vec3 col = mix(horizon, zenith, pow(clamp(y,0.0,1.0), 0.45));
        col = mix(col, groundCol, smoothstep(0.0, -0.12, y));
        float s = max(dot(d, sunDir), 0.0);
        col += skySun * (pow(s, 8.0) * 0.18 + pow(s, 80.0) * 0.5);
        float disc = smoothstep(0.99935, 0.99965, s);
        float dens = 0.0;
        if (y > -0.02) {
          vec2 uv = d.xz / (y + 0.12);
          vec2 q = uv * 0.85 + vec2(time * 0.006, time * 0.002);
          float n = fbm(q); float nb = fbm(q * 2.3 + 5.0);
          float shape = n * 0.75 + nb * 0.35;
          dens = smoothstep(0.56, 0.86, shape) * smoothstep(-0.02, 0.14, y);
          float ns = fbm(q + sunDir.xz * 0.18);
          float lit = clamp(0.55 + (n - ns) * 4.5, 0.0, 1.0);
          vec3 cc = mix(cloudDark, cloudLit, lit);
          cc += skySun * pow(s, 5.0) * (1.0 - smoothstep(0.55, 0.95, shape)) * 1.6;
          col = mix(col, cc, dens * 0.93);
        }
        col += skySun * disc * discGain * (1.0 - dens);
        if (night > 0.01 && y > 0.0) {
          vec3 sd = d * 190.0; vec3 cell = floor(sd);
          float r = fract(sin(dot(cell, vec3(12.9898,78.233,37.719))) * 43758.5453);
          float star = step(0.9982, r) * smoothstep(0.45, 0.05, length(fract(sd) - 0.5));
          float tw = 0.6 + 0.4 * sin(time * 2.0 + r * 80.0);
          col += vec3(0.85, 0.92, 1.0) * star * tw * night * 3.0 * (1.0 - dens);
          float band = fbm(d.xz * 2.5 + vec2(time*0.01, 0.0)) * smoothstep(0.05, 0.6, y) * smoothstep(1.0, 0.4, y);
          col += night * band * vec3(0.06, 0.20, 0.28) * 0.9;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4500, 48, 24), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}
