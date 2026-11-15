import type { InputAction } from '../engine/input-map';
import { nextTutorialStep, TUTORIAL_STEPS, type TutorialStepId } from '../sim/tutorial';
import type { WorldState } from '../sim/types';
import { escapeHtml } from './weapon-card';

const OBJECTIVES: Record<string, string> = {
  'find-the-others': 'Find the others. Survive.',
  'find-and-free-cerberus': 'Find and free Cerberus.',
  'defeat-the-warden': 'Defeat the Warden.',
  'release-cerberus': 'Release Cerberus: break his chains.',
  'cerberus-freed': 'Cerberus is free. His Three-Fold Howl is yours.',
  'brothers-reunited': 'Cerberus is free, and Poseidon has found you.',
};

const STEP_NAMES: Record<TutorialStepId, string> = {
  move: 'Move',
  sprint: 'Sprint',
  jump: 'Jump',
  roll: 'Roll',
  attack: 'Attack',
  ability: 'Chain Lightning',
  pickup: 'Pick up a weapon',
  fuse: 'Fuse two weapons',
};

/** The key hints shown beside each checklist item (the full prompt explains the action). */
const STEP_ACTIONS: Record<TutorialStepId, readonly InputAction[]> = {
  move: ['moveForward', 'moveBack', 'moveLeft', 'moveRight'],
  sprint: ['sprint'],
  jump: ['jump'],
  roll: ['dodge'],
  attack: ['punch', 'weaponStrike'],
  ability: ['godAbility'],
  pickup: ['interact'],
  fuse: ['interact'],
};

export interface TutorialPanel {
  update(world: WorldState, visible: boolean): void;
}

/**
 * Soft prompts for the prologue (SPEC §3.1), with the player's own keys, and
 * the objective once the prologue is over. During a skippable cinematic it
 * shows how to skip.
 */
export function createTutorialPanel(parent: HTMLElement, key: (action: InputAction) => string): TutorialPanel {
  const panel = document.createElement('section');
  panel.id = 'wc-tutorial';
  panel.setAttribute('aria-live', 'polite');
  panel.hidden = true;
  parent.append(panel);
  const skip = document.createElement('p');
  skip.id = 'wc-skip';
  skip.hidden = true;
  parent.append(skip);

  const prompt = (step: TutorialStepId): string => {
    const k = (action: InputAction) => `<kbd>${escapeHtml(key(action))}</kbd>`;
    switch (step) {
      case 'move': return `Move with ${k('moveForward')} ${k('moveBack')} ${k('moveLeft')} ${k('moveRight')}. Look around with the mouse, or ${k('cameraLeft')} and ${k('cameraRight')}.`;
      case 'sprint': return `Hold ${k('sprint')} while moving to sprint.`;
      case 'roll': return `Press ${k('dodge')} to roll out of harm's way. You can't be hit mid-roll.`;
      case 'jump': return `Press ${k('jump')} to jump. Hold it while falling to hover.`;
      case 'attack': return `Hit a practice dummy or a sheep behind the rock: ${k('punch')} to punch, ${k('weaponStrike')} for your spear.`;
      case 'ability': return `Press ${k('godAbility')} to call Chain Lightning.`;
      case 'pickup': return `Find a weapon glowing in the meadow and press ${k('interact')} to pick it up.`;
      case 'fuse': return `Fuse two weapons at the Fusion Altar east of the rock: walk up and press ${k('interact')}.`;
      default: return '';
    }
  };

  let rendered = '';
  return {
    update(world, visible) {
      const inCutscene = !!world.cutscene;
      skip.hidden = !(inCutscene && world.cutscene?.skippable);
      if (!skip.hidden) skip.innerHTML = `<kbd>${escapeHtml(key('skipCutscene'))}</kbd> Skip`;
      const step = world.flags.prologueDone ? null : nextTutorialStep(world);
      const objective = world.objective ? OBJECTIVES[world.objective] ?? world.objective : null;
      panel.hidden = !visible || inCutscene || (!step && !objective);
      if (panel.hidden) return;
      const signature = JSON.stringify([step, world.tutorial.done, objective]);
      if (signature === rendered) return;
      rendered = signature;
      if (step) {
        const list = TUTORIAL_STEPS.map((id) => {
          const classes = world.tutorial.done.includes(id) ? 'wc-done' : id === step ? 'wc-current' : '';
          const keys = STEP_ACTIONS[id].map((action) => `<kbd>${escapeHtml(key(action))}</kbd>`).join(' ');
          return `<li class="${classes}" data-step="${id}"><span>${STEP_NAMES[id]}</span><span class="wc-step-keys">${keys}</span></li>`;
        }).join('');
        panel.innerHTML = `<h2>The Last Calm Day</h2><p class="wc-tutorial-prompt">${prompt(step)}</p><ol class="wc-tutorial-steps">${list}</ol>`;
      } else {
        panel.innerHTML = `<h2>Objective</h2><p class="wc-tutorial-prompt">${escapeHtml(objective ?? '')}</p>`;
      }
    },
  };
}
