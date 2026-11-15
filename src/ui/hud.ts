import { DEFAULT_BINDINGS, keyLabel, type InputAction, type InputMap } from '../engine/input-map';
import type { SpiritDef } from '../content/spirits';
import { activeSpirit } from '../sim/systems/spirits';
import { enemyDef, godDef } from '../sim/defs';
import type { Entity, WorldState } from '../sim/types';
import { DODGE_STAMINA } from '../sim/systems/hero';
import { isKnownWeapon, weaponData } from '../sim/weapons';
import { weaponIconSvg } from './weapon-icon';

const GLYPHS: Record<string, string> = {
  bolt: '<path d="M13.5 2 5 13.2h5.6L9.2 22l9.8-12.6h-5.9z" fill="currentColor"/>',
  fist: '<path d="M7 9.5V7a1.5 1.5 0 0 1 3 0V6a1.5 1.5 0 0 1 3 0v.5a1.5 1.5 0 0 1 3 0V8a1.5 1.5 0 0 1 3 0v5.5c0 4-2.7 7.5-6.5 7.5S7 18 7 15.5V12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  sky: '<path d="M4 9a5 5 0 0 1 9.6-2A4 4 0 1 1 17 15H6a3 3 0 0 1-2-6z" fill="currentColor" opacity=".55"/><path d="M12.5 12 9 17h3l-1 5 4.5-6.5h-3l1-3.5z" fill="currentColor"/>',
  punch: '<circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h3M18 12h3M12 3v3M12 18v3" stroke="currentColor" stroke-width="2"/>',
  blink: '<path d="M3 15h6M2 11h5M4 19h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".7"/><path d="M16.5 2 10 11.5h4.2L12.5 22l8-12h-4.4z" fill="currentColor"/>',
  roll: '<path d="M18 8a7 7 0 1 0 1.2 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="m19.5 3.5-.8 5.3-5.2-1.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  // Hades's moves (M6): a bony hand rising, a hooded shade with trails, a soul-flame, a skull behind bars.
  grasp: '<path d="M3 21h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7.5 21v-5.5L5 11.5M10.5 21V8.5M13.5 21V7M16.5 21V8.5M18.5 21v-4.5l1.5-3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M9.5 18h8" stroke="currentColor" stroke-width="1.4" opacity=".6"/>',
  shadow: '<path d="M15 2.5a3.2 3.2 0 0 1 3.2 3.2V8l2.3 13.5H10.2L12.4 8V5.7A3.2 3.2 0 0 1 15 2.5z" fill="currentColor"/><path d="M2.5 10h6M2 14h6.5M3.5 18h5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>',
  soul: '<path d="M12 2.5c1 3 6 5.5 6 10.5a6 6 0 0 1-12 0c0-2.4 1.2-3.8 2.3-4.8.1 1.8.9 3 2 3.3-.7-3.3.1-6.4 1.7-9z" fill="currentColor"/><circle cx="10" cy="14.5" r="1.25" fill="#141019"/><circle cx="14" cy="14.5" r="1.25" fill="#141019"/>',
  cage: '<path d="M4 3v18M9 3v3M15 3v3M20 3v18M3 3h18M3 21h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".75"/><path d="M12 7.5a5 5 0 0 0-5 5v2.2h2V17h6v-2.3h2v-2.2a5 5 0 0 0-5-5z" fill="currentColor"/><circle cx="10" cy="12.6" r="1.1" fill="#141019"/><circle cx="14" cy="12.6" r="1.1" fill="#141019"/>',
  // Three-Fold Howl: three rings of sound.
  howl: '<circle cx="6" cy="12" r="2.4" fill="currentColor"/><path d="M10 7.5a6 6 0 0 1 0 9M13.5 5a9.5 9.5 0 0 1 0 14M17 2.8a13 13 0 0 1 0 18.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};

/** An ability's own icon if the HUD has it, else the slot's default. */
const glyphOr = (icon: string | undefined, fallback: string): string => (icon && GLYPHS[icon] ? icon : fallback);

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
  /** Element of the ability, if any: it's boosted when the equipped weapon matches. */
  element?: string;
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
      <div class="wc-hud-weapon" data-hud="weapon">
        <span class="wc-hud-weapon-icon" data-hud="weapon-icon" aria-hidden="true"></span>
        <span class="wc-hud-weapon-name" data-hud="weapon-name"></span>
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
  const weaponIcon = get('weapon-icon');
  const weaponName = get('weapon-name');
  let shownWeapon = '';
  let slots: Array<AbilitySlot & { el: HTMLElement; cooldown: HTMLElement; key: HTMLElement }> = [];
  let builtFor = '';
  let codesFor: (action: InputAction) => readonly string[] = (action) => DEFAULT_BINDINGS[action];

  const buildSlots = (godId: string, spirit: SpiritDef | undefined) => {
    const god = godDef(godId);
    const defs: AbilitySlot[] = [
      { hud: 'punch', action: 'punch', glyph: 'punch', name: 'Punch', staminaNeeded: () => 3 },
      { hud: 'dodge', action: 'dodge', glyph: 'roll', name: 'Roll', staminaNeeded: () => DODGE_STAMINA },
    ];
    if (god.chargedMove) {
      const move = god.chargedMove;
      defs.push({ hud: 'charged', action: 'chargedMove', glyph: glyphOr(move.icon, 'fist'), name: move.name, cooldownId: move.id, cooldownTicks: move.cooldownTicks, staminaNeeded: () => move.staminaMin, element: move.element });
    }
    if (god.blink) {
      const blink = god.blink;
      defs.push({ hud: 'blink', action: 'blink', glyph: glyphOr(blink.icon, 'blink'), name: blink.name, cooldownId: blink.id, cooldownTicks: blink.cooldownTicks, staminaNeeded: () => blink.staminaCost, element: blink.element });
    }
    defs.push({ hud: 'ability', action: 'godAbility', glyph: glyphOr(god.ability.icon, 'bolt'), name: god.ability.name, cooldownId: god.ability.id, cooldownTicks: god.ability.cooldownTicks, staminaNeeded: () => god.ability.staminaCost, element: god.ability.element });
    if (god.ultimate) {
      const ultimate = god.ultimate;
      defs.push({ hud: 'ultimate', action: 'ultimate', glyph: glyphOr(ultimate.icon, 'sky'), name: ultimate.name, cooldownId: ultimate.id, cooldownTicks: ultimate.cooldownTicks, staminaNeeded: (max) => max * ultimate.minStaminaFraction, element: ultimate.element });
    }
    // A freed spirit's gift (M7: Cerberus's Three-Fold Howl), the same for both gods.
    if (spirit) {
      const gift = spirit.ability;
      defs.push({ hud: 'spirit', action: 'spiritAbility', glyph: 'howl', name: gift.name, cooldownId: gift.id, cooldownTicks: gift.cooldownTicks, staminaNeeded: () => gift.staminaCost });
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
    builtFor = godId + (spirit ? `+${spirit.id}` : '');
    refreshKeys();
  };
  const refreshKeys = () => {
    for (const slot of slots) {
      const code = codesFor(slot.action).find((c) => !c.startsWith('Mouse') && !c.startsWith('Alt')) ?? codesFor(slot.action)[0];
      slot.key.textContent = code ? keyLabel(code) : '';
    }
  };
  // The other god in the party (M6): a small portrait chip with his health and the switch key.
  const ally = document.createElement('div');
  ally.className = 'wc-ally';
  ally.hidden = true;
  ally.innerHTML = '<span class="wc-ally-name"></span><span class="wc-ally-bar"><span></span></span><kbd></kbd>';
  (element.querySelector('.wc-hud-vitals') ?? element).append(ally);
  const allyName = ally.querySelector<HTMLElement>('.wc-ally-name')!;
  const allyFill = ally.querySelector<HTMLElement>('.wc-ally-bar > span')!;
  const allyKey = ally.querySelector<HTMLElement>('kbd')!;
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

      const spirit = activeSpirit(world);
      if (builtFor !== hero.defId + (spirit ? `+${spirit.id}` : '')) buildSlots(hero.defId, spirit);
      const player = Object.values(world.players).find((p) => p.entityId === hero.id);
      const otherId = player?.party?.find((id) => id !== hero.id);
      const other = otherId ? world.entities[otherId] : undefined;
      ally.hidden = !other?.hero;
      if (other?.hero) {
        allyName.textContent = godDef(other.defId).name + (other.hero.down != null ? ' (down)' : '');
        allyFill.style.transform = `scaleX(${other.health ? Math.max(0, other.health.current / other.health.max) : 0})`;
        allyKey.textContent = keyLabel(codesFor('switchCharacter')[0] ?? 'KeyV');
      }
      const weapon = isKnownWeapon(world, hero.hero.weaponId) ? weaponData(world, hero.hero.weaponId) : undefined;
      if (weapon && weapon.id !== shownWeapon) {
        shownWeapon = weapon.id;
        weaponIcon.innerHTML = weaponIconSvg(weapon, 34);
        weaponName.textContent = weapon.name;
        weaponName.classList.toggle('wc-legendary', weapon.legendary);
      }
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
        // A weapon of the same element boosts the ability (+25%, SPEC §8).
        slot.el.classList.toggle('wc-boosted', !!slot.element && slot.element === weapon?.element);
      }

      // The Warden's fight (M7) takes over the bar as a boss bar; otherwise it follows your lock-on.
      const boss = Object.values(world.entities).find((e) => e.warden?.mode === 'fight' && (e.health?.current ?? 0) > 0 && e.region === hero.region);
      const locked = boss ?? (hero.hero.lockTarget ? world.entities[hero.hero.lockTarget] : undefined);
      target.hidden = !locked;
      target.classList.toggle('wc-boss', !!boss);
      target.classList.toggle('wc-enraged', !!boss?.warden?.enraged);
      if (locked?.health) {
        targetName.textContent = enemyName(locked.defId);
        targetHealth.style.transform = `scaleX(${locked.health.current / locked.health.max})`;
      }
    },
  };
}

/** Names for hittable things that aren't in the enemy registry. */
const PART_NAMES: Readonly<Record<string, string>> = { 'mech-plating': 'Mk. II rear plating', barricade: 'Barricade' };

function enemyName(defId: string): string {
  if (PART_NAMES[defId]) return PART_NAMES[defId];
  try {
    return enemyDef(defId).name;
  } catch {
    return defId;
  }
}
