import { weapons } from '../content/weapons';
import type { FixedStepLoop } from '../engine/loop';
import type { Session } from '../engine/session';
import type { SettingsStore } from '../engine/settings';
import { entityCount, formatWorldTime, TIME_OF_DAY_LOCKS, type TimeOfDayLock } from '../sim';

export interface DevMenu {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  toggle(open?: boolean): void;
  /** Refreshes the readouts (cheap; throttled internally). */
  update(nowMs: number): void;
}

const LOCK_LABELS: Record<TimeOfDayLock, string> = {
  live: 'Live (UTC)',
  golden: 'Always golden hour',
  night: 'Always night',
};

/**
 * Dev menu (backtick by default). Shown in dev builds, and in production only
 * with `#dev` in the URL. Every change it makes goes through intents or the
 * session, never by editing sim state directly.
 */
export function createDevMenu(
  parent: HTMLElement,
  session: Session,
  settings: SettingsStore,
  loop: FixedStepLoop,
  onNewGame: () => void,
): DevMenu {
  const element = document.createElement('aside');
  element.id = 'wc-dev';
  element.hidden = true;
  element.setAttribute('aria-label', 'Developer menu');
  element.innerHTML = `
    <h2>Dev menu</h2>
    <dl>
      <dt>Tick rate</dt><dd data-field="rate">–</dd>
      <dt>Tick</dt><dd data-field="tick">–</dd>
      <dt>World time</dt><dd data-field="time">–</dd>
      <dt>Entities</dt><dd data-field="entities">–</dd>
      <dt>Players</dt><dd data-field="players">–</dd>
      <dt>Seed</dt><dd data-field="seed">–</dd>
    </dl>
    <label>Time of day
      <select data-control="lock">
        ${TIME_OF_DAY_LOCKS.map((lock) => `<option value="${lock}">${LOCK_LABELS[lock]}</option>`).join('')}
      </select>
    </label>
    <label>Scrub time <input data-control="scrub" type="range" min="0" max="1" step="0.001" value="0.7"></label>
    <div class="wc-dev-buttons">
      <button type="button" data-action="clear-scrub">Stop scrubbing</button>
      <button type="button" data-action="spawn">Spawn marker</button>
      <button type="button" data-action="give-weapons">Give all weapons</button>
      <button type="button" data-action="save">Save now</button>
      <button type="button" data-action="new-game">New game</button>
    </div>`;
  parent.append(element);

  const field = (name: string) => element.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
  const lockSelect = element.querySelector<HTMLSelectElement>('[data-control="lock"]')!;
  const scrub = element.querySelector<HTMLInputElement>('[data-control="scrub"]')!;

  settings.subscribe((current) => {
    lockSelect.value = current.timeOfDay;
  });
  lockSelect.addEventListener('change', () => {
    settings.update((draft) => { draft.timeOfDay = lockSelect.value as TimeOfDayLock; });
  });
  scrub.addEventListener('input', () => {
    session.timeOverride = Number(scrub.value);
  });
  element.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'clear-scrub') session.timeOverride = null;
    if (action === 'spawn') session.sendIntent({ type: 'dev:spawn', defId: 'dev:marker' });
    if (action === 'give-weapons') {
      // Every base weapon (the inventory holds 12; extra gives are ignored).
      for (const weapon of weapons.filter((w) => !w.legendary)) session.sendIntent({ type: 'dev:give', weaponId: weapon.id });
    }
    if (action === 'save') session.save();
    if (action === 'new-game') onNewGame();
    lastUpdate = -Infinity;
  });

  let lastUpdate = -Infinity;
  const menu: DevMenu = {
    element,
    get isOpen() {
      return !element.hidden;
    },
    toggle(open = element.hidden) {
      element.hidden = !open;
      lastUpdate = -Infinity;
    },
    update(nowMs) {
      if (element.hidden || nowMs - lastUpdate < 250) return;
      lastUpdate = nowMs;
      const { world } = session;
      const time = session.worldTime();
      field('rate').textContent = `${loop.measuredTickRate(nowMs)} Hz`;
      field('tick').textContent = String(world.tick);
      field('time').textContent = `${formatWorldTime(time)} · ${time.phase} (${time.source})`;
      field('entities').textContent = String(entityCount(world));
      field('players').textContent = String(Object.keys(world.players).length);
      field('seed').textContent = String(world.seed);
    },
  };
  return menu;
}
