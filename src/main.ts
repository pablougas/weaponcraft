// Entry point. The 3D game is the default page; the old Phaser demo stays
// reachable at ?demo=2d until the team decides to delete it.
const demo = new URLSearchParams(window.location.search).get('demo');

if (demo === '2d') {
  document.documentElement.classList.remove('wc-fullscreen');
  document.getElementById('wc-loading')?.remove();
  void import('./demo2d').then(({ startDemo2d }) => startDemo2d(document.body));
} else {
  void import('./engine/boot').then(({ boot }) => boot());
}
