// The loading screen markup is inline in index.html so it paints before JS.

export function setLoadingText(text: string): void {
  const element = document.getElementById('wc-loading-text');
  if (element) element.textContent = text;
}

export function hideLoadingScreen(): void {
  const screen = document.getElementById('wc-loading');
  if (!screen) return;
  screen.classList.add('done');
  screen.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => screen.remove(), 700);
}

/** Replaces the loading screen with an error message (e.g. no WebGL). */
export function showFatalError(title: string, detail: string): void {
  const screen = document.getElementById('wc-loading');
  if (!screen) return;
  screen.classList.remove('done');
  screen.setAttribute('role', 'alert');
  screen.innerHTML = '';
  const box = document.createElement('div');
  const heading = document.createElement('h1');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = detail;
  box.append(heading, text);
  screen.append(box);
}
