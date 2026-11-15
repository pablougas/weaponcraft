import type { Expression } from '../../../view/entity-model';

/** Ash-grey skin (SPEC §5, approved concept `docs/reference/hades-concept.html`). */
export const SKIN = '#878b95';

/**
 * Draws Hades's face onto a 1024×512 canvas wrapped round the head sphere, and
 * his soul-fire eye glow onto a matching emissive canvas. Same layout as
 * Zeus's face; the "happy" slot is Hades's smirk.
 */
export function drawFace(face: HTMLCanvasElement, glow: HTMLCanvasElement, expr: Expression): void {
  const g = face.getContext('2d');
  const k = glow.getContext('2d');
  if (!g || !k) return;
  const W = 1024;
  const H = 512;
  const cx = W / 2;
  const ey = 266;
  const dx = 62;
  g.fillStyle = SKIN;
  g.fillRect(0, 0, W, H);
  k.fillStyle = '#000';
  k.fillRect(0, 0, W, H);

  // Gaunt cheekbones and shadowed eyes: regal, older than Zeus.
  for (const s of [-1, 1]) {
    const cheek = g.createRadialGradient(cx + s * dx * 1.35, ey + 52, 2, cx + s * dx * 1.35, ey + 52, 46);
    cheek.addColorStop(0, 'rgba(60,50,80,0.35)');
    cheek.addColorStop(1, 'rgba(60,50,80,0)');
    g.fillStyle = cheek;
    g.fillRect(cx + s * dx * 1.35 - 50, ey, 100, 110);
    const under = g.createRadialGradient(cx + s * dx, ey + 18, 2, cx + s * dx, ey + 18, 34);
    under.addColorStop(0, 'rgba(50,30,80,0.45)');
    under.addColorStop(1, 'rgba(50,30,80,0)');
    g.fillStyle = under;
    g.fillRect(cx + s * dx - 40, ey - 10, 80, 60);
  }
  g.strokeStyle = 'rgba(55,50,70,0.6)';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx + 3, ey + 14);
  g.lineTo(cx + 8, ey + 38);
  g.quadraticCurveTo(cx + 2, ey + 44, cx - 6, ey + 40);
  g.stroke();

  const brow = (s: number, tilt: number, lift = 0) => {
    const x = cx + s * dx;
    g.strokeStyle = '#1a1520';
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(x - s * 32, ey - 38 - lift + tilt);
    g.quadraticCurveTo(x, ey - 52 - lift, x + s * 34, ey - 50 - lift - tilt * 0.3);
    g.stroke();
  };
  const eye = (s: number, squint = 0) => {
    const x = cx + s * dx;
    const y = ey;
    g.save();
    g.beginPath();
    g.ellipse(x, y, 26, 24, 0, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#e8e6f0';
    g.fillRect(x - 30, y - 30, 60, 60);
    const iris = g.createRadialGradient(x + s * 2, y + 2, 2, x + s * 2, y + 2, 20);
    iris.addColorStop(0, '#d8fffb');
    iris.addColorStop(0.35, '#4ff0e0');
    iris.addColorStop(0.75, '#7a52c7');
    iris.addColorStop(1, '#2a1650');
    g.fillStyle = iris;
    g.beginPath();
    g.ellipse(x + s * 2, y + 2, 17, 19, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#12081f'; // slit pupil
    g.beginPath();
    g.ellipse(x + s * 2, y + 2, 4, 11, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x + s * 2 - 6, y - 7, 4.5, 0, Math.PI * 2);
    g.fill();
    if (squint) {
      g.fillStyle = SKIN;
      g.fillRect(x - 30, y - 30, 60, 12 + squint);
    }
    g.restore();
    // Heavy upper lid.
    g.strokeStyle = '#120d18';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(x - s * 28, y + 4);
    g.quadraticCurveTo(x - s * 4, y - 26 + squint * 0.6, x + s * 30, y - 10 + squint * 0.4);
    g.stroke();
    // Soul-fire glow, on the emissive canvas.
    const fire = k.createRadialGradient(x + s * 2, y + 2, 1, x + s * 2, y + 2, 22);
    fire.addColorStop(0, 'rgba(160,255,245,1)');
    fire.addColorStop(0.5, 'rgba(79,240,224,0.85)');
    fire.addColorStop(1, 'rgba(110,70,200,0)');
    k.fillStyle = fire;
    k.beginPath();
    k.ellipse(x + s * 2, y + 2, 22, 22, 0, 0, Math.PI * 2);
    k.fill();
  };

  const my = ey + 70;
  g.lineWidth = 6;
  g.strokeStyle = '#3a2430';
  if (expr === 'neutral') {
    brow(-1, 8); brow(1, 8); eye(-1, 4); eye(1, 4);
    g.beginPath(); g.moveTo(cx - 16, my); g.lineTo(cx + 16, my); g.stroke();
  } else if (expr === 'determined') {
    brow(-1, 18); brow(1, 18); eye(-1, 10); eye(1, 10);
    g.beginPath(); g.moveTo(cx - 18, my + 3); g.quadraticCurveTo(cx, my - 4, cx + 18, my + 3); g.stroke();
  } else if (expr === 'happy') {
    // Hades's version of pleased: a one-sided smirk.
    brow(-1, 4, 2); brow(1, 14); eye(-1, 2); eye(1, 8);
    g.beginPath(); g.moveTo(cx - 16, my + 2); g.quadraticCurveTo(cx + 4, my + 4, cx + 20, my - 8); g.stroke();
  } else {
    brow(-1, -10, 6); brow(1, -10, 6); eye(-1, 14); eye(1, 2);
    g.beginPath();
    g.moveTo(cx - 20, my + 4);
    g.quadraticCurveTo(cx - 8, my - 8, cx + 2, my + 2);
    g.quadraticCurveTo(cx + 12, my + 10, cx + 20, my);
    g.stroke();
  }
}
