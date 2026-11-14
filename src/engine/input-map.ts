/**
 * Rebindable input map. Every input action is looked up here; nothing else
 * hard-codes keys (CLAUDE.md accessibility rules). Gameplay actions (move,
 * attack, abilities...) are added in M3; remapping UI comes with settings.
 */
export type InputAction = 'devMenu';

/** Default bindings as `KeyboardEvent.code` values (layout-independent). */
export const DEFAULT_BINDINGS: Readonly<Record<InputAction, readonly string[]>> = {
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

  bind(action: InputAction, codes: readonly string[]): void {
    this.bindings[action] = [...codes];
  }

  codesFor(action: InputAction): readonly string[] {
    return this.bindings[action];
  }
}
