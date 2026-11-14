import './style.css';

const is3d = new URLSearchParams(window.location.search).get('demo') === '3d';
const label = document.querySelector<HTMLElement>('#demo-label');
const description = document.querySelector<HTMLElement>('#demo-description');
const score = document.querySelector<HTMLElement>('#score');
const restart = document.querySelector<HTMLButtonElement>('#restart');
const instructions = document.querySelector<HTMLElement>('#instructions');
const host = document.querySelector<HTMLElement>('#game');
const editHint = document.querySelector<HTMLElement>('#edit-hint');

if (!label || !description || !score || !restart || !instructions || !host || !editHint) {
  throw new Error('The game page is missing a required element.');
}

if (is3d) {
  label.textContent = 'WEAPONCRAFT / THREE.JS 3D';
  description.textContent = 'A small Three.js scene to use as a 3D starting point.';
  host.setAttribute('aria-label', 'Weaponcraft 3D scene. Drag to rotate and scroll to zoom.');
  score.hidden = true;
  restart.hidden = true;
  instructions.textContent = 'Drag to rotate the scene. Scroll to zoom.';
  editHint.textContent = 'Start creating in src/three-game.ts.';
  document.title = 'Weaponcraft · Three.js demo';
  void import('./three-game').then(({ startThreeDemo }) => startThreeDemo(host));
} else {
  editHint.textContent = 'Start creating in src/game.ts.';
  void import('./game').then(({ startGame }) => {
    const game = startGame(host, (collected, total) => {
      score.textContent = collected === total
        ? `All ${total} ore collected!`
        : `Ore: ${collected} / ${total}`;
    });
    restart.addEventListener('click', () => game.scene.start('ForgeScene'));
  });
}
