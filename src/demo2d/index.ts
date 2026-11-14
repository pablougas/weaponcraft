import './style.css';
import { startGame } from './game';

// The original Phaser 2D starter, kept at ?demo=2d (with its touch support).
export function startDemo2d(root: HTMLElement): void {
  document.title = 'Weaponcraft · Phaser 2D demo';
  root.innerHTML = `
    <main>
      <nav aria-label="Game demos">
        <a href="./">3D game</a>
        <a href="?demo=2d">Phaser 2D demo</a>
      </nav>
      <header>
        <p class="eyebrow">WEAPONCRAFT / PHASER 2D</p>
        <h1>Weapon<span>craft</span></h1>
        <p class="lead">Gather the glowing ore. Move with the arrow keys or WASD.</p>
      </header>
      <div class="toolbar">
        <p id="score" role="status" aria-live="polite">Ore: 0 / 5</p>
        <button id="restart" type="button">Restart game</button>
      </div>
      <div
        id="game"
        role="application"
        aria-label="Weaponcraft game. Move with arrow keys or W A S D, or touch the game area."
      ></div>
      <p class="instructions">
        Move with <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> or
        <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>. On touch screens,
        tap where you want to go.
      </p>
      <footer>Phaser demo code lives in <code>src/demo2d/game.ts</code>.</footer>
    </main>`;

  const score = root.querySelector<HTMLElement>('#score');
  const restart = root.querySelector<HTMLButtonElement>('#restart');
  const host = root.querySelector<HTMLElement>('#game');
  if (!score || !restart || !host) {
    throw new Error('The 2D demo page is missing a required element.');
  }

  const game = startGame(host, (collected, total) => {
    score.textContent = collected === total
      ? `All ${total} ore collected!`
      : `Ore: ${collected} / ${total}`;
  });
  restart.addEventListener('click', () => game.scene.start('ForgeScene'));
}
