export interface TitleScreenOptions {
  /** A save exists: offer "Continue" plus "New game". */
  resumed: boolean;
  /**
   * Called synchronously from the click, so anything that needs a user gesture
   * (audio unlock, pointer lock) works. `newGame` is true for "New game".
   */
  onStart(newGame: boolean): void;
}

/**
 * Click-to-start title screen. Clicking anywhere (or Enter/Space on the
 * focused button) starts or continues; "New game" wipes the save first.
 */
export function showTitleScreen(parent: HTMLElement, options: TitleScreenOptions): HTMLElement {
  const screen = document.createElement('div');
  screen.id = 'wc-title';
  screen.innerHTML = `
    <div class="wc-title-card">
      <h1>WEAPONCRAFT</h1>
      <p class="wc-title-tagline">The gods have fallen. Forge, fuse, and take back Olympus.</p>
      <button type="button" class="wc-title-start">${options.resumed ? 'Continue' : 'Click to start'}</button>
      ${options.resumed ? '<button type="button" class="wc-title-new">New game</button>' : ''}
      <p class="wc-title-hint">Mouse and keyboard · Best in fullscreen</p>
    </div>`;
  parent.append(screen);

  let started = false;
  const start = (event: Event, newGame: boolean) => {
    if (started) return;
    started = true;
    event.preventDefault();
    event.stopPropagation();
    screen.classList.add('done');
    screen.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => screen.remove(), 500);
    options.onStart(newGame);
  };
  screen.querySelector('.wc-title-new')?.addEventListener('click', (event) => start(event, true));
  screen.addEventListener('click', (event) => start(event, false));
  screen.querySelector<HTMLButtonElement>('.wc-title-start')?.focus();
  return screen;
}
