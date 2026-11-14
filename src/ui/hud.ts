import { DEFAULT_BINDINGS, keyLabel, type InputAction, type InputMap } from '../engine/input-map';
import { enemyDef, godDef } from '../sim/defs';
import type { Entity, WorldState } from '../sim/types';

const GLYPHS: Record<string, string> = {
  bolt: '<path d="M13.5 2 5 13.2h5.6L9.2 22l9.8-12.6h-5.9z" fill="currentColor"/>',
  fist: '<path d="M7 9.5V7a1.5 1.5 0 0 1 3 0V6a1.5 1.5 0 0 1 3 0v.5a1.5 1.5 0 0 1 3 0V8a1.5 1.5 0 0 1 3 0v5.5c0 4-2.7 7.5-6.5 7.5S7 18 7 15.5V12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  sky: '<path d="M4 9a5 5 0 0 1 9.6-2A4 4 0 1 1 17 15H6a3 3 0 0 1-2-6z" fill="currentColor" opacity=".55"/><path d="M12.5 12 9 17h3l-1 5 4.5-6.5h-3l1-3.5z" fill="currentColor"/>',
  punch: '<circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h3M18 12h3M12 3v3M12 18v3" stroke="currentColor" stroke-width="2"/>',
  roll: '<path d="M18 8a7 7 0 1 0 1.2 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="m19.5 3.5-.8 5.3-5.2-1.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
};

interface AbilitySlot {
  hud: string;
  action: InputAction;
  glyph: keyof typeof GLYPHS;
  /** Ability ID in `hero.cooldowns`, if it has a cooldown. */
  cooldownId?: string;
  cooldownTicks?: number;
  /** Stamina needed to use it now. */
  staminaNeeded: (max: number) => number;
  name: string;
}

export interface Hud {
  readonly element: HTMLElement;
  setVisible(visible: boolean): void;
  update(world: WorldState, heroId: string | null): void;
  /** Shows the player's actual key bindings on the ability slots. */
  setBindings(map: InputMap): void;
}

/**
 * Health and stamina bars, the ability bar (keys, cooldowns, stamina), and the lock-on
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
    <section class="wc-hud-abilities" aria-label="Abilities" data-hud="abilities"></section>
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
  const abilitiesEl = get('abilities');
  let slots: Array<AbilitySlot & { el: HTMLElement; cooldown: HTMLElement; key: HTMLElement }> = [];
  let builtFor = '';
  let codesFor: (action: InputAction) => readonly string[] = (action) => DEFAULT_BINDINGS[action];

  const buildSlots = (godId: string) => {
    const god = godDef(godId);
    const defs: AbilitySlot[] = [
      { hud: 'punch', action: 'punch', glyph: 'punch', name: 'Punch', staminaNeeded: () => 3 },
      { hud: 'dodge', action: 'dodge', glyph: 'roll', name: 'Roll', staminaNeeded: () => 18 },
    ];
    if (god.chargedMove) {
      const move = god.chargedMove;
      defs.push({ hud: 'charged', action: 'chargedMove', glyph: 'fist', name: move.name, cooldownId: move.id, cooldownTicks: move.cooldownTicks, staminaNeeded: () => move.staminaMin });
    }
    defs.push({ hud: 'ability', action: 'godAbility', glyph: 'bolt', name: god.ability.name, cooldownId: god.ability.id, cooldownTicks: god.ability.cooldownTicks, staminaNeeded: () => god.ability.staminaCost });
    if (god.ultimate) {
      const ultimate = god.ultimate;
      defs.push({ hud: 'ultimate', action: 'ultimate', glyph: 'sky', name: ultimate.name, cooldownId: ultimate.id, cooldownTicks: ultimate.cooldownTicks, staminaNeeded: (max) => max * ultimate.minStaminaFraction });
    }
    abilitiesEl.replaceChildren();
    slots = defs.map((def) => {
      const el = document.createElement('div');
      el.className = 'wc-ability';
      el.dataset.hud = def.hud;
      el.innerHTML = `
        <span class="wc-ability-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26">${GLYPHS[def.glyph]}</svg></span>
        <span class="wc-ability-cooldown"></span>
        <kbd></kbd>
        <span class="wc-ability-name">${def.name}</span>`;
      abilitiesEl.append(el);
      return { ...def, el, cooldown: el.querySelector<HTMLElement>('.wc-ability-cooldown')!, key: el.querySelector<HTMLElement>('kbd')! };
    });
    builtFor = godId;
    refreshKeys();
  };
  const refreshKeys = () => {
    for (const slot of slots) {
      const code = codesFor(slot.action).find((c) => !c.startsWith('Mouse') && !c.startsWith('Alt')) ?? codesFor(slot.action)[0];
      slot.key.textContent = code ? keyLabel(code) : '';
    }
  };
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
    setBindings(map) {
      codesFor = (action) => map.codesFor(action);
      refreshKeys();
    },
    update(world, heroId) {
      const hero: Entity | undefined = heroId ? world.entities[heroId] : undefined;
      if (!hero?.hero) return;
      const god = godDef(hero.defId);
      nameEl.textContent = god.name;
      setMeter(healthMeter, health, hero.health?.current ?? 0, hero.health?.max ?? 0);
      setMeter(staminaMeter, stamina, hero.stamina?.current ?? 0, hero.stamina?.max ?? 0);

      if (builtFor !== hero.defId) buildSlots(hero.defId);
      const staminaNow = hero.stamina?.current ?? 0;
      const staminaMax = hero.stamina?.max ?? 0;
      for (const slot of slots) {
        const left = slot.cooldownId ? hero.hero.cooldowns[slot.cooldownId] ?? 0 : 0;
        slot.cooldown.style.setProperty('--cooldown', String(slot.cooldownTicks ? left / slot.cooldownTicks : 0));
        slot.el.classList.toggle('wc-cooling', left > 0);
        slot.el.classList.toggle('wc-no-stamina', left === 0 && staminaNow < slot.staminaNeeded(staminaMax));
        const active = (slot.hud === 'charged' && hero.hero.charge != null) || (slot.hud === 'ultimate' && !!hero.hero.ultimate)
          || (slot.hud === 'ability' && !!hero.hero.abilityHeld);
        slot.el.classList.toggle('wc-active', active);
      }

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
