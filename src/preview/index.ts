import '@fontsource/cinzel/700.css';
import * as THREE from 'three';
import { hadesLook } from '../content/gods/hades';
import { zeus } from '../content/gods/zeus';
import { FUSIONS, weapons } from '../content/weapons';
import type { Entity, WorldState } from '../sim/types';
import { EXPRESSIONS, type Expression, type ModelFactory } from '../view/entity-model';
import { ARCHETYPES } from '../content/weapons/build';
import { MATERIALS } from '../content/weapons/materials';
import '../ui/ui.css';
import { elementChip, escapeHtml } from '../ui/weapon-card';
import { weaponIconSvg } from '../ui/weapon-icon';
import { createLook } from '../view/look';
import { buildWeaponModel } from '../view/weapon-model';
import './preview.css';

const TYPES = ['weapons', 'characters'] as const;

/**
 * Dev preview pages (`?preview=<type>`): every item of a registry, approved
 * or not, for the team to review before flipping `approved: true`.
 */
export function startPreview(root: HTMLElement, type: string): void {
  document.documentElement.classList.remove('wc-fullscreen');
  document.title = `Weaponcraft · Preview · ${type}`;
  if (type === 'characters') {
    void renderCharacters(root);
    return;
  }
  if (type !== 'weapons') {
    root.innerHTML = `<main class="wc-preview"><h1>Preview</h1><p>Unknown type “${escapeHtml(type)}”. Try: ${TYPES.map((t) => `<a href="?preview=${t}">${t}</a>`).join(', ')}.</p></main>`;
    document.body.dataset.ready = 'true';
    return;
  }
  renderWeapons(root);
}

function renderWeapons(root: HTMLElement): void {
  const recipeOf = (id: string) => FUSIONS.find((r) => r.result === id);
  const nameOf = (id: string) => weapons.find((w) => w.id === id)?.name ?? id;
  root.innerHTML = `
    <main class="wc-preview">
      <header>
        <p class="wc-preview-eyebrow">Weaponcraft · content preview</p>
        <h1>Weapons</h1>
        <p>${weapons.length} weapons: ${weapons.filter((w) => !w.legendary).length} base and ${weapons.filter((w) => w.legendary).length} legendaries.
        Unapproved weapons never appear in normal play.</p>
      </header>
      <ul class="wc-preview-grid">
        ${weapons.map((w) => `
          <li class="wc-preview-card${w.approved ? '' : ' wc-unapproved'}" data-weapon="${w.id}">
            <div class="wc-preview-art"><img alt="${escapeHtml(w.name)} model" data-render="${w.id}" width="200" height="200"><span class="wc-preview-icon">${weaponIconSvg(w, 56)}</span></div>
            <h2>${escapeHtml(w.name)}</h2>
            <div class="wc-chips">
              <span class="wc-chip ${w.approved ? 'wc-ok' : 'wc-pending'}">${w.approved ? 'Approved' : 'Not approved'}</span>
              ${w.legendary ? '<span class="wc-chip wc-chip-legendary">Legendary</span>' : ''}
              ${elementChip(w)}
            </div>
            <dl class="wc-stats">
              <dt>Type</dt><dd>${ARCHETYPES[w.archetype].name} · ${MATERIALS[w.material].name}</dd>
              <dt>Parts</dt><dd>${w.parts.handle} · ${w.parts.head} · ${w.parts.guard}</dd>
              <dt>Light / heavy</dt><dd>${w.light.damage} / ${w.heavy.damage}</dd>
              ${recipeOf(w.id) ? `<dt>Recipe</dt><dd>${escapeHtml(nameOf(recipeOf(w.id)!.a))} + ${escapeHtml(nameOf(recipeOf(w.id)!.b))}</dd>` : ''}
            </dl>
            <p class="wc-weapon-desc">${escapeHtml(w.description)}</p>
          </li>`).join('')}
      </ul>
    </main>`;

  // One small renderer draws each weapon model into an image.
  const size = 400;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const look = createLook(1);
  look.U.rimColor.value.set('#ffd27a');
  look.U.rimStrength.value = 0.6;
  look.U.outlineColor.value.set('#141a33');
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#c9dceb', '#3a4e7a', 1.6));
  const sun = new THREE.DirectionalLight('#ffe2b0', 2.6);
  sun.position.set(2, 3, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  for (const weapon of weapons) {
    const { group } = buildWeaponModel(look, weapon);
    group.rotation.z = -Math.PI / 4;
    scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    const centre = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    camera.position.set(centre.x, centre.y, centre.z + radius / Math.tan((camera.fov * Math.PI) / 360) * 1.05);
    camera.lookAt(centre);
    renderer.render(scene, camera);
    const img = root.querySelector<HTMLImageElement>(`[data-render="${weapon.id}"]`);
    if (img) img.src = renderer.domElement.toDataURL('image/png');
    scene.remove(group);
  }
  renderer.dispose();
  document.body.dataset.ready = 'true';
}

/** The gods' in-game models from three angles, plus close-ups of every face. */
async function renderCharacters(root: HTMLElement): Promise<void> {
  const characters = [
    { id: zeus.id, name: zeus.name, approved: zeus.approved, load: zeus.model, underworld: false, headY: 1.91 },
    { id: hadesLook.id, name: hadesLook.name, approved: hadesLook.approved, load: hadesLook.model, underworld: true, headY: 2.18 },
  ];
  const angles = [['Front', 0], ['Three-quarter', -0.75], ['Back', Math.PI]] as const;
  root.innerHTML = `
    <main class="wc-preview">
      <header>
        <p class="wc-preview-eyebrow">Weaponcraft · content preview</p>
        <h1>Characters</h1>
        <p>The in-game models, built from primitives. Unapproved characters never appear in normal play.</p>
      </header>
      ${characters.map((c) => `
        <section class="wc-preview-character" data-character="${c.id}">
          <h2>${escapeHtml(c.name)} <span class="wc-chip ${c.approved ? 'wc-ok' : 'wc-pending'}">${c.approved ? 'Approved' : 'Not approved'}</span></h2>
          <div class="wc-preview-angles">
            ${angles.map(([label]) => `<figure><img alt="${escapeHtml(c.name)}, ${label.toLowerCase()}" data-render="${c.id}-${label}" width="300" height="420"><figcaption>${label}</figcaption></figure>`).join('')}
          </div>
          <div class="wc-preview-faces">
            ${EXPRESSIONS.map((e) => `<figure><img alt="${escapeHtml(c.name)}, ${e} face" data-render="${c.id}-face-${e}" width="150" height="150"><figcaption>${e}</figcaption></figure>`).join('')}
          </div>
        </section>`).join('')}
    </main>`;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const look = createLook(1);
  look.U.outlineColor.value.set('#0b0812');
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const world = { entities: {} } as unknown as WorldState;
  const frame = { time: 1.2, dt: 0, world, reduceMotion: true };

  for (const c of characters) {
    const factory: ModelFactory = (await c.load()).createModel;
    const scene = new THREE.Scene();
    if (c.underworld) {
      look.U.rimColor.value.set('#8f7fe0');
      look.U.rimStrength.value = 0.32;
      scene.add(new THREE.HemisphereLight('#8a7bc0', '#120d1c', 1.25));
      const key = new THREE.DirectionalLight('#d9d0ff', 2.4);
      key.position.set(2.5, 4, 3.5);
      const back = new THREE.DirectionalLight('#5fd8d0', 1.0);
      back.position.set(-2, 3, -4);
      scene.add(key, back);
    } else {
      look.U.rimColor.value.set('#ffd27a');
      look.U.rimStrength.value = 0.6;
      scene.add(new THREE.HemisphereLight('#c9dceb', '#3a4e7a', 1.6));
      const sun = new THREE.DirectionalLight('#ffe2b0', 2.6);
      sun.position.set(2, 3, 4);
      scene.add(sun);
    }
    const entity = { id: `preview-${c.id}`, defId: c.id, position: { x: 0, y: 0, z: 0 }, rotationY: 0 } as unknown as Entity;
    const model = factory(look, entity.id);
    scene.add(model.root);
    model.update(entity, frame);

    const shot = (key: string, w: number, h: number, yaw: number, target: THREE.Vector3, distance: number) => {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      camera.position.set(target.x + Math.sin(yaw) * distance, target.y + distance * 0.03, target.z + Math.cos(yaw) * distance);
      camera.lookAt(target);
      renderer.render(scene, camera);
      const img = root.querySelector<HTMLImageElement>(`[data-render="${key}"]`);
      if (img) img.src = renderer.domElement.toDataURL('image/png');
    };
    for (const [label, yaw] of angles) shot(`${c.id}-${label}`, 600, 840, yaw, new THREE.Vector3(0, 1.45, 0), 7.2);
    // Close-ups: aimed at the head centre (head height in metres, from the model's rig).
    for (const expression of EXPRESSIONS as readonly Expression[]) {
      model.setExpression?.(expression);
      model.update(entity, frame);
      shot(`${c.id}-face-${expression}`, 300, 300, 0.25, new THREE.Vector3(0, c.headY - 0.05, 0), 1.25);
    }
    model.dispose?.();
  }
  renderer.dispose();
  document.body.dataset.ready = 'true';
}
