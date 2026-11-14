import { godDef } from '../sim/defs';
import { enemyDef } from '../sim/defs';
import type { Entity, WorldState } from '../sim/types';

export interface Hud {
  readonly element: HTMLElement;
  setVisible(visible: boolean): void;
  update(world: WorldState, heroId: string | null): void;
}

/**
 * Health and stamina bars, the Q ability with its cooldown, and the lock-on
 * target. Reads state only.
 */
export function createHud(parent: HTMLElement): Hud {
  const element = document.createElement('div');
  element.id = 'wc-hud';
  element.hidden = true;
  element.innerHTML = `
    <section class="wc-hud-vitals" aria-label="Player status">
      <h2 class="wc-hud-name" data-hud="name">Zeus</h2>
      <div class="wc-bar wc-bar-health" role="meter" aria-label="Health" aria-valuemin="0" data-hud="health-meter">
        <span class="wc-bar-fill" data-hud="health"></span>
      </div>
      <div class="wc-bar wc-bar-stamina" role="meter" aria-label="Stamina" aria-valuemin="0" data-hud="stamina-meter">
        <span class="wc-bar-fill" data-hud="stamina"></span>
      </div>
    </section>
    <section class="wc-hud-abilities" aria-label="Abilities">
      <div class="wc-ability" data-hud="ability">
        <span class="wc-ability-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26"><path d="M13.5 2 5 13.2h5.6L9.2 22l9.8-12.6h-5.9z" fill="currentColor"/></svg>
        </span>
        <span class="wc-ability-cooldown" data-hud="cooldown"></span>
        <kbd>Q</kbd>
        <span class="wc-ability-name" data-hud="ability-name">Chain Lightning</span>
      </div>
    </section>
    <section class="wc-hud-target" data-hud="target" hidden aria-live="polite">
      <h3 data-hud="target-name"></h3>
      <div class="wc-bar wc-bar-target"><span class="wc-bar-fill" data-hud="target-health"></span></div>
    </section>`;
  parent.append(element);

  const get = (name: string) => element.querySelector<HTMLElement>(`[data-hud="${name}"]`)!;
  const nameEl = get('name');
  const health = get('health');
  const healthMeter = get('health-meter');
  const stamina = get('stamina');
  const staminaMeter = get('stamina-meter');
  const ability = get('ability');
  const cooldown = get('cooldown');
  const abilityName = get('ability-name');
  const target = get('target');
  const targetName = get('target-name');
  const targetHealth = get('target-health');

  const setMeter = (meter: HTMLElement, fill: HTMLElement, current: number, max: number) => {
    fill.style.transform = `scaleX(${max > 0 ? Math.max(0, current / max) : 0})`;
    meter.setAttribute('aria-valuemax', String(max));
    meter.setAttribute('aria-valuenow', String(Math.round(current)));
  };

  return {
    element,
    setVisible(visible) {
      element.hidden = !visible;
    },
    update(world, heroId) {
      const hero: Entity | undefined = heroId ? world.entities[heroId] : undefined;
      if (!hero?.hero) return;
      const god = godDef(hero.defId);
      nameEl.textContent = god.name;
      setMeter(healthMeter, health, hero.health?.current ?? 0, hero.health?.max ?? 0);
      setMeter(staminaMeter, stamina, hero.stamina?.current ?? 0, hero.stamina?.max ?? 0);

      abilityName.textContent = god.ability.name;
      const left = hero.hero.cooldowns[god.ability.id] ?? 0;
      const fraction = left / god.ability.cooldownTicks;
      cooldown.style.setProperty('--cooldown', String(fraction));
      ability.classList.toggle('wc-cooling', left > 0);

      const locked = hero.hero.lockTarget ? world.entities[hero.hero.lockTarget] : undefined;
      target.hidden = !locked;
      if (locked?.health) {
        targetName.textContent = enemyName(locked.defId);
        targetHealth.style.transform = `scaleX(${locked.health.current / locked.health.max})`;
      }
    },
  };
}

function enemyName(defId: string): string {
  try {
    return enemyDef(defId).name;
  } catch {
    return defId;
  }
}
