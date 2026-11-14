// Entry point. The 3D game is the default page; the old Phaser demo stays
// reachable at ?demo=2d until the team decides to delete it. ?preview=<type>
// shows a content contact sheet for review.
const params = new URLSearchParams(window.location.search);
const demo = params.get('demo');
const preview = params.get('preview');

if (preview) {
  // Dev content previews (?preview=weapons): every registry item, approved or not.
  document.getElementById('wc-loading')?.remove();
  void import('./preview').then(({ startPreview }) => startPreview(document.body, preview));
} else if (demo === '2d') {
  document.documentElement.classList.remove('wc-fullscreen');
  document.getElementById('wc-loading')?.remove();
  void import('./demo2d').then(({ startDemo2d }) => startDemo2d(document.body));
} else {
  void import('./engine/boot').then(({ boot }) => boot());
}
