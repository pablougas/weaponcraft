import { QUALITY_SETTINGS, type EffectSettings, type QualityPreset, type QualitySetting, type SettingsStore } from '../engine/settings';
import { TIME_OF_DAY_LOCKS, type TimeOfDayLock } from '../sim/time';

const EFFECT_LABELS: Record<keyof EffectSettings, string> = {
  bloom: 'Bloom',
  godRays: 'God rays',
  outlines: 'Outlines',
  colorGrade: 'Color grade',
  particles: 'Particles',
};

const TIME_LABELS: Record<TimeOfDayLock, string> = {
  live: 'Live (follows real time)',
  golden: 'Always golden hour',
  night: 'Always night',
};

export interface SettingsMenu {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  /** Shows which preset "Auto" picked. */
  setAutoQuality(preset: QualityPreset): void;
}

export interface SettingsMenuOptions {
  store: SettingsStore;
  /** Called from the Resume click (a user gesture, so pointer lock can be requested). */
  onResume(): void;
  onNewGame(): void;
  /** "Reset level": back to the last bed with the level's encounters started over (progress is kept). */
  onResetLevel(): void;
}

type VolumeKey = 'master' | 'music' | 'sfx';
const VOLUME_KEYS: readonly VolumeKey[] = ['master', 'music', 'sfx'];
const VOLUME_LABELS: Readonly<Record<VolumeKey, string>> = { master: 'Master volume', music: 'Music', sfx: 'Sound effects' };

/** Esc settings menu: effects, audio volumes, reduce motion, quality, time of day, New game. */
export function createSettingsMenu(parent: HTMLElement, options: SettingsMenuOptions): SettingsMenu {
  const { store } = options;
  const element = document.createElement('div');
  element.id = 'wc-settings';
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-labelledby', 'wc-settings-title');
  element.innerHTML = `
    <div class="wc-panel">
      <h2 id="wc-settings-title">Settings</h2>
      <section>
        <h3>Display</h3>
        <label class="wc-row">Quality
          <select data-setting="quality">
            ${QUALITY_SETTINGS.map((q) => `<option value="${q}">${q === 'auto' ? 'Auto' : q[0].toUpperCase() + q.slice(1)}</option>`).join('')}
          </select>
        </label>
        <label class="wc-row">Time of day
          <select data-setting="timeOfDay">
            ${TIME_OF_DAY_LOCKS.map((t) => `<option value="${t}">${TIME_LABELS[t]}</option>`).join('')}
          </select>
        </label>
      </section>
      <section>
        <h3>Effects</h3>
        <div class="wc-checks">
          ${(Object.keys(EFFECT_LABELS) as (keyof EffectSettings)[]).map((key) => `
            <label><input type="checkbox" data-effect="${key}"> ${EFFECT_LABELS[key]}</label>`).join('')}
        </div>
      </section>
      <section>
        <h3>Controls</h3>
        <label class="wc-row">Mouse sensitivity
          <span class="wc-range"><input type="range" min="0.2" max="3" step="0.1" data-setting="mouseSensitivity"><output data-output="mouseSensitivity"></output></span>
        </label>
        <label class="wc-check"><input type="checkbox" data-setting="invertY"> Invert mouse Y</label>
        <label class="wc-check"><input type="checkbox" data-setting="cameraAutoFollow"> Camera auto-follow</label>
      </section>
      <section>
        <h3>Audio</h3>
        ${VOLUME_KEYS.map((key) => `
        <label class="wc-row">${VOLUME_LABELS[key]}
          <span class="wc-range"><input type="range" min="0" max="1" step="0.05" data-volume="${key}"><output data-volume-output="${key}"></output></span>
        </label>`).join('')}
      </section>
      <section>
        <h3>Accessibility</h3>
        <label class="wc-check"><input type="checkbox" data-setting="reduceMotion"> Reduce motion &amp; flashes</label>
      </section>
      <div class="wc-actions">
        <button type="button" class="wc-primary" data-action="resume">Resume</button>
        <button type="button" data-action="reset-level" title="Back to the last bed; enemies start over. Your progress is kept.">Reset level</button>
        <button type="button" data-action="new-game">New game</button>
      </div>
      <p class="wc-hint">Move ↑ ↓ ← → · Sprint Shift · Jump Space (hold to hover) · Roll X · Punch A · Weapon S (hold for heavy) · Lightning Fist D (hold, release) · Chain Lightning Q (hold to keep firing) · Sky Strike R · Bolt Step W · Switch god V · Lock on Tab · Pick up / use F · Inventory I · Codex C · Map M · Turn camera , . or mouse. Settings are saved in this browser.</p>
    </div>`;
  parent.append(element);

  const quality = element.querySelector<HTMLSelectElement>('[data-setting="quality"]')!;
  const timeOfDay = element.querySelector<HTMLSelectElement>('[data-setting="timeOfDay"]')!;
  const reduceMotion = element.querySelector<HTMLInputElement>('[data-setting="reduceMotion"]')!;
  const sensitivity = element.querySelector<HTMLInputElement>('[data-setting="mouseSensitivity"]')!;
  const sensitivityOutput = element.querySelector<HTMLOutputElement>('[data-output="mouseSensitivity"]')!;
  const invertY = element.querySelector<HTMLInputElement>('[data-setting="invertY"]')!;
  const autoFollow = element.querySelector<HTMLInputElement>('[data-setting="cameraAutoFollow"]')!;
  const effectBoxes = [...element.querySelectorAll<HTMLInputElement>('[data-effect]')];
  const volumeSliders = [...element.querySelectorAll<HTMLInputElement>('[data-volume]')];
  const newGameButton = element.querySelector<HTMLButtonElement>('[data-action="new-game"]')!;
  const autoOption = quality.querySelector<HTMLOptionElement>('option[value="auto"]')!;

  store.subscribe((settings) => {
    quality.value = settings.quality;
    timeOfDay.value = settings.timeOfDay;
    reduceMotion.checked = settings.reduceMotion;
    sensitivity.value = String(settings.mouseSensitivity);
    sensitivityOutput.textContent = `${settings.mouseSensitivity.toFixed(1)}×`;
    invertY.checked = settings.invertY;
    autoFollow.checked = settings.cameraAutoFollow;
    for (const box of effectBoxes) box.checked = settings.effects[box.dataset.effect as keyof EffectSettings];
    for (const slider of volumeSliders) {
      const key = slider.dataset.volume as VolumeKey;
      slider.value = String(settings.volume[key]);
      element.querySelector<HTMLOutputElement>(`[data-volume-output="${key}"]`)!.textContent = `${Math.round(settings.volume[key] * 100)}%`;
    }
  });

  quality.addEventListener('change', () => store.update((s) => { s.quality = quality.value as QualitySetting; }));
  timeOfDay.addEventListener('change', () => store.update((s) => { s.timeOfDay = timeOfDay.value as TimeOfDayLock; }));
  reduceMotion.addEventListener('change', () => store.update((s) => { s.reduceMotion = reduceMotion.checked; }));
  sensitivity.addEventListener('input', () => store.update((s) => { s.mouseSensitivity = Number(sensitivity.value); }));
  invertY.addEventListener('change', () => store.update((s) => { s.invertY = invertY.checked; }));
  autoFollow.addEventListener('change', () => store.update((s) => { s.cameraAutoFollow = autoFollow.checked; }));
  for (const slider of volumeSliders) {
    slider.addEventListener('input', () => store.update((s) => { s.volume[slider.dataset.volume as VolumeKey] = Number(slider.value); }));
  }
  for (const box of effectBoxes) {
    box.addEventListener('change', () => store.update((s) => { s.effects[box.dataset.effect as keyof EffectSettings] = box.checked; }));
  }

  // New game asks for a second click so it can't wipe a save by accident.
  let confirming = false;
  const resetNewGame = () => {
    confirming = false;
    newGameButton.textContent = 'New game';
    newGameButton.classList.remove('wc-danger');
  };

  const menu: SettingsMenu = {
    element,
    get isOpen() {
      return !element.hidden;
    },
    open() {
      if (!element.hidden) return;
      resetNewGame();
      element.hidden = false;
      element.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus();
    },
    close() {
      element.hidden = true;
    },
    setAutoQuality(preset) {
      autoOption.textContent = `Auto (${preset[0].toUpperCase()}${preset.slice(1)})`;
    },
  };

  element.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'resume') {
      menu.close();
      options.onResume();
    } else if (action === 'reset-level') {
      menu.close();
      options.onResetLevel();
      options.onResume();
    } else if (action === 'new-game') {
      if (!confirming) {
        confirming = true;
        newGameButton.textContent = 'Click again to start over';
        newGameButton.classList.add('wc-danger');
        return;
      }
      resetNewGame();
      menu.close();
      options.onNewGame();
      options.onResume();
    }
  });
  return menu;
}
