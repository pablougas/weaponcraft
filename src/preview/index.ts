import '@fontsource/cinzel/700.css';
import * as THREE from 'three';
import { FUSIONS, weapons } from '../content/weapons';
import { ARCHETYPES } from '../content/weapons/build';
import { MATERIALS } from '../content/weapons/materials';
import '../ui/ui.css';
import { elementChip, escapeHtml } from '../ui/weapon-card';
import { weaponIconSvg } from '../ui/weapon-icon';
import { createLook } from '../view/look';
import { buildWeaponModel } from '../view/weapon-model';
import './preview.css';

const TYPES = ['weapons'] as const;

/**
 * Dev preview pages (`?preview=<type>`): every item of a registry, approved
 * or not, for the team to review before flipping `approved: true`.
 */
export function startPreview(root: HTMLElement, type: string): void {
  document.documentElement.classList.remove('wc-fullscreen');
  document.title = `Weaponcraft · Preview · ${type}`;
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
