import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The shared art-direction kit ported from docs/reference/style-test.html:
 * toon shading with rim light, inverted-hull outlines, distance haze and the
 * uniforms the time of day drives. One `Look` per renderer.
 */
export interface SharedUniforms {
  time: THREE.IUniform<number>;
  rimColor: THREE.IUniform<THREE.Color>;
  rimStrength: THREE.IUniform<number>;
  fogColor: THREE.IUniform<THREE.Color>;
  fogDensity: THREE.IUniform<number>;
  sunDir: THREE.IUniform<THREE.Vector3>;
  sunColor: THREE.IUniform<THREE.Color>;
  ambColor: THREE.IUniform<THREE.Color>;
  night: THREE.IUniform<number>;
  outlineColor: THREE.IUniform<THREE.Color>;
  pixelRatio: THREE.IUniform<number>;
  /** 1 = full wind and particle drift; lower when "Reduce motion" is on. */
  motion: THREE.IUniform<number>;
}

export interface ToonOptions extends THREE.MeshToonMaterialParameters {
  /** Add the rim-light term (default true). */
  rim?: boolean;
  /** Toon ramp: 3 tones (default) or 4. */
  grad?: THREE.DataTexture;
}

export interface MeshOptions {
  rot?: [number, number, number];
  scale?: [number, number, number];
  /** Cast shadows (default true). */
  cast?: boolean;
  /** Outline thickness in metres, or false for none (default 0.012). */
  outline?: number | false;
}

/** A material whose emissive glow is blended from day to night. */
export interface GlowMaterial {
  mat: THREE.MeshToonMaterial;
  day: number;
  night: number;
}

export interface Look {
  U: SharedUniforms;
  GRAD3: THREE.DataTexture;
  GRAD4: THREE.DataTexture;
  toon(options?: ToonOptions): THREE.MeshToonMaterial;
  farFog<T extends THREE.Material>(material: T): T;
  addOutline(mesh: THREE.Mesh, thickness?: number): THREE.Mesh;
  /** Mesh helper matching the style test's `M(geo, mat, pos, opts)`. */
  M(geometry: THREE.BufferGeometry, material: THREE.Material, position?: [number, number, number], options?: MeshOptions): THREE.Mesh;
  readonly outlineMeshes: THREE.Mesh[];
  readonly glowMaterials: GlowMaterial[];
  setOutlinesVisible(visible: boolean): void;
}

function gradientTexture(steps: number[]): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array(steps), steps.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createLook(pixelRatio: number): Look {
  const U: SharedUniforms = {
    time: { value: 0 },
    rimColor: { value: new THREE.Color('#ffd27a') },
    rimStrength: { value: 0.9 },
    fogColor: { value: new THREE.Color() },
    fogDensity: { value: 0.001 },
    sunDir: { value: new THREE.Vector3() },
    sunColor: { value: new THREE.Color() },
    ambColor: { value: new THREE.Color() },
    night: { value: 0 },
    outlineColor: { value: new THREE.Color('#141a33') },
    pixelRatio: { value: pixelRatio },
    motion: { value: 1 },
  };
  const GRAD3 = gradientTexture([70, 165, 255]);
  const GRAD4 = gradientTexture([60, 120, 190, 255]);

  const toon = (options: ToonOptions = {}): THREE.MeshToonMaterial => {
    const { rim = true, grad = GRAD3, ...rest } = options;
    const material = new THREE.MeshToonMaterial({ gradientMap: grad, ...rest });
    if (rim) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.rimColor = U.rimColor;
        shader.uniforms.rimStrength = U.rimStrength;
        shader.fragmentShader = 'uniform vec3 rimColor; uniform float rimStrength;\n' + shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
           { vec3 vd = normalize(vViewPosition); float rimF = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 3.0);
             gl_FragColor.rgb += rimColor * rimF * rimStrength; }`,
        );
      };
      material.customProgramCacheKey = () => 'toonrim';
    }
    return material;
  };

  // Far-distance haze: blue aerial perspective for the horizon landmarks.
  const farFog = <T extends THREE.Material>(material: T): T => {
    const previous = material.onBeforeCompile.bind(material);
    const hadPrevious = material.customProgramCacheKey() === 'toonrim';
    material.onBeforeCompile = (shader, renderer) => {
      previous(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
          float farF = 1.0 - exp(-fogDensity * fogDensity * 0.16 * vFogDepth * vFogDepth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(farF, 0.0, 0.82));
        #endif`,
      );
    };
    material.customProgramCacheKey = () => `farfog${hadPrevious ? 'rim' : ''}`;
    return material;
  };

  // Outlines: an inverted hull with smoothed normals, fogged like the scene.
  const outlineMeshes: THREE.Mesh[] = [];
  const outlineGeometryCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
  const outlineMaterialCache = new Map<number, THREE.ShaderMaterial>();
  const outlineMaterial = (thickness: number): THREE.ShaderMaterial => {
    let material = outlineMaterialCache.get(thickness);
    if (!material) {
      material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { thickness: { value: thickness }, color: U.outlineColor, fogColor: U.fogColor, fogDensity: U.fogDensity },
        vertexShader: `uniform float thickness; varying float vD;
          void main(){ vec3 p = position + normal * thickness; vec4 mv = modelViewMatrix * vec4(p,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 color; uniform vec3 fogColor; uniform float fogDensity; varying float vD;
          void main(){ float f = 1.0 - exp(-fogDensity*fogDensity*vD*vD); gl_FragColor = vec4(mix(color, fogColor, f), 1.0); }`,
      });
      outlineMaterialCache.set(thickness, material);
    }
    return material;
  };
  let outlinesVisible = true;
  const addOutline = (mesh: THREE.Mesh, thickness = 0.02): THREE.Mesh => {
    let geometry = outlineGeometryCache.get(mesh.geometry);
    if (!geometry) {
      let hull = new THREE.BufferGeometry();
      hull.setAttribute('position', mesh.geometry.attributes.position.clone());
      if (mesh.geometry.index) hull.setIndex(mesh.geometry.index.clone());
      hull = mergeVertices(hull, 1e-3);
      hull.computeVertexNormals();
      outlineGeometryCache.set(mesh.geometry, hull);
      geometry = hull;
    }
    const outline = new THREE.Mesh(geometry, outlineMaterial(thickness));
    outline.raycast = () => undefined;
    outline.visible = outlinesVisible;
    mesh.add(outline);
    outlineMeshes.push(outline);
    return outline;
  };

  const M: Look['M'] = (geometry, material, position, options = {}) => {
    const mesh = new THREE.Mesh(geometry, material);
    if (position) mesh.position.set(...position);
    if (options.rot) mesh.rotation.set(...options.rot);
    if (options.scale) mesh.scale.set(...options.scale);
    mesh.castShadow = options.cast !== false;
    mesh.receiveShadow = true;
    if (options.outline !== false) addOutline(mesh, options.outline ?? 0.012);
    return mesh;
  };

  return {
    U,
    GRAD3,
    GRAD4,
    toon,
    farFog,
    addOutline,
    M,
    outlineMeshes,
    glowMaterials: [],
    setOutlinesVisible(visible) {
      outlinesVisible = visible;
      for (const outline of outlineMeshes) outline.visible = visible;
    },
  };
}
