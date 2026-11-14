import type { IntentInput, PlayerAction } from '../sim/intents';
import { mouseCode, type InputAction, type InputMap } from './input-map';

/** Input actions that become a `player:action` intent when pressed. */
const PRESS_ACTIONS: Partial<Record<InputAction, PlayerAction>> = {
  jump: 'jump',
  dodge: 'dodge',
  lightAttack: 'lightAttack',
  heavyAttack: 'heavyAttack',
  godAbility: 'godAbility',
  lockOn: 'lockOn',
};

/**
 * Turns keyboard and mouse into intents (CLAUDE.md rule 2). Held keys become
 * one `player:move` intent per tick, relative to the camera; presses become
 * `player:action` intents. Nothing here changes game state.
 */
export class InputController {
  private readonly held = new Set<string>();
  private readonly pressed: PlayerAction[] = [];
  private lastMoveSent = '';

  constructor(
    private readonly map: InputMap,
    canvas: HTMLElement,
    /** Gameplay input only counts while this is true (playing, no menu open). */
    private readonly enabled: () => boolean,
  ) {
    const gameCodes = map.allCodes();
    window.addEventListener('keydown', (event) => {
      if (!this.enabled()) return;
      if (gameCodes.has(event.code) && !['Escape', 'Backquote'].includes(event.code)) event.preventDefault();
      if (event.repeat) return;
      this.press(event.code);
    });
    window.addEventListener('keyup', (event) => {
      this.held.delete(event.code);
      // Firefox shows its menu bar on a lone Alt release; Alt is our dodge.
      if (this.enabled() && event.code.startsWith('Alt')) event.preventDefault();
    });
    canvas.addEventListener('mousedown', (event) => {
      if (!this.enabled()) return;
      this.press(mouseCode(event.button));
    });
    window.addEventListener('mouseup', (event) => this.held.delete(mouseCode(event.button)));
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('blur', () => this.held.clear());
  }

  private press(code: string): void {
    this.held.add(code);
    for (const action of this.map.actionsFor(code)) {
      const playerAction = PRESS_ACTIONS[action];
      if (playerAction) this.pressed.push(playerAction);
    }
  }

  private isHeld(action: InputAction): boolean {
    return this.map.codesFor(action).some((code) => this.held.has(code));
  }

  /**
   * Intents for the next tick. `cameraYaw` turns W into "away from the
   * camera". Held input is resent only when it changes.
   */
  takeIntents(cameraYaw: number): IntentInput[] {
    const intents: IntentInput[] = [];
    const on = this.enabled();
    if (!on) {
      this.held.clear();
      this.pressed.length = 0;
    }
    const forward = (on && this.isHeld('moveForward') ? 1 : 0) - (on && this.isHeld('moveBack') ? 1 : 0);
    const right = (on && this.isHeld('moveRight') ? 1 : 0) - (on && this.isHeld('moveLeft') ? 1 : 0);
    let x = Math.sin(cameraYaw) * forward - Math.cos(cameraYaw) * right;
    let z = Math.cos(cameraYaw) * forward + Math.sin(cameraYaw) * right;
    const length = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }
    const move = {
      type: 'player:move' as const,
      x: Math.round(x * 1000) / 1000,
      z: Math.round(z * 1000) / 1000,
      sprint: on && this.isHeld('sprint'),
      jumpHeld: on && this.isHeld('jump'),
    };
    const key = JSON.stringify(move);
    if (key !== this.lastMoveSent) {
      intents.push(move);
      this.lastMoveSent = key;
    }
    for (const action of this.pressed.splice(0)) intents.push({ type: 'player:action', action });
    return intents;
  }
}
