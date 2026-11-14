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
  | 'lightAttack'
  | 'heavyAttack'
  | 'godAbility'
  | 'lockOn'
  | 'settings'
  | 'devMenu';

/**
 * SPEC §5 controls. Dodge defaults to Alt rather than the spec's Ctrl:
 * Ctrl+W (dodge while running forward) closes the browser tab on Windows and
 * Linux and pages can't block it. See docs/DECISIONS.md.
 */
export const DEFAULT_BINDINGS: Readonly<Record<InputAction, readonly string[]>> = {
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  dodge: ['AltLeft', 'AltRight'],
  lightAttack: ['Mouse0'],
  heavyAttack: ['Mouse2'],
  godAbility: ['KeyQ'],
  lockOn: ['Tab'],
  settings: ['Escape'],
  devMenu: ['Backquote'],
};

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
