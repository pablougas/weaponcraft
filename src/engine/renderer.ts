import * as THREE from 'three';

export interface FullWindowRenderer {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  /** Current drawing-buffer size in CSS pixels. */
  size(): { width: number; height: number };
  /** Registers a callback for window resizes (also called once immediately). */
  onResize(callback: (width: number, height: number) => void): void;
}

/** Creates a WebGL renderer whose canvas fills the window. Throws if WebGL is unavailable. */
export function createFullWindowRenderer(parent: HTMLElement): FullWindowRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;

  const canvas = renderer.domElement;
  canvas.id = 'wc-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Weaponcraft game view');
  parent.prepend(canvas);

  const listeners: Array<(width: number, height: number) => void> = [];
  const size = () => ({ width: window.innerWidth, height: window.innerHeight });
  const apply = () => {
    const { width, height } = size();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    for (const listener of listeners) listener(width, height);
  };
  window.addEventListener('resize', apply);
  apply();

  return {
    renderer,
    canvas,
    size,
    onResize(callback) {
      listeners.push(callback);
      const { width, height } = size();
      if (width && height) callback(width, height);
    },
  };
}
