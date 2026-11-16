/** How long a caption stays up, seconds. */
const CAPTION_SECONDS = 3.2;

export interface Captions {
  readonly element: HTMLElement;
  /** Shows `text`; the same text again while it's up just extends it. */
  show(text: string, seconds?: number): void;
}

/**
 * Captions for dialogue and important sound cues (CLAUDE.md accessibility).
 * Announced to screen readers through a polite live region. `onLine` hears
 * each new line once (the gods' voices speak theirs).
 */
export function createCaptions(parent: HTMLElement, onLine?: (text: string) => void): Captions {
  const element = document.createElement('div');
  element.id = 'wc-captions';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  parent.append(element);
  const timers = new Map<string, { line: HTMLElement; timer: number }>();
  return {
    element,
    show(text, seconds = CAPTION_SECONDS) {
      const existing = timers.get(text);
      if (existing) {
        window.clearTimeout(existing.timer);
        existing.timer = window.setTimeout(() => remove(text), seconds * 1000);
        return;
      }
      const line = document.createElement('p');
      line.textContent = text;
      element.append(line);
      timers.set(text, { line, timer: window.setTimeout(() => remove(text), seconds * 1000) });
      // A new line (not one already up): the gods speak theirs (engine/voices.ts).
      onLine?.(text);
    },
  };
  function remove(text: string) {
    const entry = timers.get(text);
    if (!entry) return;
    entry.line.remove();
    timers.delete(text);
  }
}
