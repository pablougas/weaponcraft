/**
 * Click-to-start title screen. Resolves on the first click (or Enter/Space on
 * the focused button). Callers must do anything that needs a user gesture
 * (audio unlock, pointer lock) inside `onStart`, synchronously from the click.
 */
export function showTitleScreen(parent: HTMLElement, onStart: () => void): HTMLElement {
  const screen = document.createElement('div');
  screen.id = 'wc-title';
  screen.innerHTML = `
    <div class="wc-title-card">
      <h1>WEAPONCRAFT</h1>
      <p class="wc-title-tagline">The gods have fallen. Forge, fuse, and take back Olympus.</p>
      <button type="button" class="wc-title-start">Click to start</button>
      <p class="wc-title-hint">Mouse and keyboard · Best in fullscreen</p>
    </div>`;
  parent.append(screen);

  const button = screen.querySelector<HTMLButtonElement>('.wc-title-start');
  let started = false;
  const start = (event: Event) => {
    if (started) return;
    started = true;
    event.preventDefault();
    screen.classList.add('done');
    screen.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => screen.remove(), 500);
    onStart();
  };
  screen.addEventListener('click', start);
  button?.focus();
  return screen;
}
