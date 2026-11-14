/**
 * Rebindable input map. Every input action is looked up here; nothing else
 * hard-codes keys (CLAUDE.md accessibility rules). Bindings are
 * `KeyboardEvent.code` values (layout-independent) or `Mouse0`/`Mouse1`/`Mouse2`.
 */
export type InputAction =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'jump'
  | 'dodge'
  | 'punch'
  | 'weaponStrike'
  | 'heavyAttack'
  | 'chargedMove'
  | 'godAbility'
  | 'ultimate'
  | 'lockOn'
  | 'interact'
  | 'inventory'
  | 'codex'
  | 'cameraLeft'
  | 'cameraRight'
  | 'settings'
  | 'devMenu';

/**
 * SPEC §5 controls (M3.1): the arrow keys move and letters are actions, so the
 * right hand stays on the arrows and the game plays without a mouse. The mouse
 * still works for looking, punching (left) and heavy strikes (right). Alt is a
 * second dodge key (Ctrl+W would close the tab; see docs/DECISIONS.md).
 */
export const DEFAULT_BINDINGS: Readonly<Record<InputAction, readonly string[]>> = {
  moveForward: ['ArrowUp'],
  moveBack: ['ArrowDown'],
  moveLeft: ['ArrowLeft'],
  moveRight: ['ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  dodge: ['KeyX', 'AltLeft', 'AltRight'],
  punch: ['KeyA', 'Mouse0'],
  weaponStrike: ['KeyS'],
  heavyAttack: ['Mouse2'],
  chargedMove: ['KeyD'],
  godAbility: ['KeyQ'],
  ultimate: ['KeyR'],
  lockOn: ['Tab'],
  interact: ['KeyF'],
  inventory: ['KeyI'],
  codex: ['KeyC'],
  cameraLeft: ['Comma'],
  cameraRight: ['Period'],
  settings: ['Escape'],
  devMenu: ['Backquote'],
};

/** Short label for a key code, for the HUD and prompts ("KeyQ" → "Q", "ArrowUp" → "↑"). */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const named: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift',
    AltLeft: 'Alt', AltRight: 'Alt', Tab: 'Tab', Escape: 'Esc', Comma: ',', Period: '.', Backquote: '`',
    Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB',
  };
  return named[code] ?? code;
}

export class InputMap {
  private bindings: Record<InputAction, string[]>;

  constructor(overrides: Partial<Record<InputAction, readonly string[]>> = {}) {
    this.bindings = Object.fromEntries(
      Object.entries(DEFAULT_BINDINGS).map(([action, codes]) => [
        action,
        [...(overrides[action as InputAction] ?? codes)],
      ]),
    ) as Record<InputAction, string[]>;
  }

  matches(action: InputAction, event: Pick<KeyboardEvent, 'code'>): boolean {
    return this.bindings[action].includes(event.code);
  }

  /** Actions bound to a key or mouse code. */
  actionsFor(code: string): InputAction[] {
    return (Object.keys(this.bindings) as InputAction[]).filter((action) => this.bindings[action].includes(code));
  }

  bind(action: InputAction, codes: readonly string[]): void {
    this.bindings[action] = [...codes];
  }

  codesFor(action: InputAction): readonly string[] {
    return this.bindings[action];
  }

  /** Every code used by any binding (to stop the browser's default for them). */
  allCodes(): Set<string> {
    return new Set(Object.values(this.bindings).flat());
  }
}

/** The `Mouse<n>` code for a mouse button. */
export const mouseCode = (button: number): string => `Mouse${button}`;
