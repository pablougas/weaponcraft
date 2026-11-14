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
}

/** Esc settings menu: effects, reduce motion, quality, time of day, New game. */
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
      </section>
      <section>
        <h3>Accessibility</h3>
        <label class="wc-check"><input type="checkbox" data-setting="reduceMotion"> Reduce motion &amp; flashes</label>
      </section>
      <div class="wc-actions">
        <button type="button" class="wc-primary" data-action="resume">Resume</button>
        <button type="button" data-action="new-game">New game</button>
      </div>
      <p class="wc-hint">Move WASD · Sprint Shift · Jump Space (hold to hover) · Dodge Alt · Attack left/right mouse · Chain Lightning Q · Lock on Tab. Settings are saved in this browser.</p>
    </div>`;
  parent.append(element);

  const quality = element.querySelector<HTMLSelectElement>('[data-setting="quality"]')!;
  const timeOfDay = element.querySelector<HTMLSelectElement>('[data-setting="timeOfDay"]')!;
  const reduceMotion = element.querySelector<HTMLInputElement>('[data-setting="reduceMotion"]')!;
  const sensitivity = element.querySelector<HTMLInputElement>('[data-setting="mouseSensitivity"]')!;
  const sensitivityOutput = element.querySelector<HTMLOutputElement>('[data-output="mouseSensitivity"]')!;
  const invertY = element.querySelector<HTMLInputElement>('[data-setting="invertY"]')!;
  const effectBoxes = [...element.querySelectorAll<HTMLInputElement>('[data-effect]')];
  const newGameButton = element.querySelector<HTMLButtonElement>('[data-action="new-game"]')!;
  const autoOption = quality.querySelector<HTMLOptionElement>('option[value="auto"]')!;

  store.subscribe((settings) => {
    quality.value = settings.quality;
    timeOfDay.value = settings.timeOfDay;
    reduceMotion.checked = settings.reduceMotion;
    sensitivity.value = String(settings.mouseSensitivity);
    sensitivityOutput.textContent = `${settings.mouseSensitivity.toFixed(1)}×`;
    invertY.checked = settings.invertY;
    for (const box of effectBoxes) box.checked = settings.effects[box.dataset.effect as keyof EffectSettings];
  });

  quality.addEventListener('change', () => store.update((s) => { s.quality = quality.value as QualitySetting; }));
  timeOfDay.addEventListener('change', () => store.update((s) => { s.timeOfDay = timeOfDay.value as TimeOfDayLock; }));
  reduceMotion.addEventListener('change', () => store.update((s) => { s.reduceMotion = reduceMotion.checked; }));
  sensitivity.addEventListener('input', () => store.update((s) => { s.mouseSensitivity = Number(sensitivity.value); }));
  invertY.addEventListener('change', () => store.update((s) => { s.invertY = invertY.checked; }));
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
