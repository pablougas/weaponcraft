import type { Expression } from '../../../view/entity-model';

export const SKIN = '#e7b38a';

/**
 * Draws Zeus's face onto a 1024×512 canvas wrapped round the head sphere
 * (ported unchanged from the style test).
 */
export function drawFace(canvas: HTMLCanvasElement, expr: Expression): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = 1024;
  const H = 512;
  const cx = W / 2;
  const ey = 268;
  const dx = 64;
  g.fillStyle = SKIN;
  g.fillRect(0, 0, W, H);
  const blush = (x: number) => {
    const gr = g.createRadialGradient(x, ey + 38, 2, x, ey + 38, 30);
    gr.addColorStop(0, 'rgba(232,110,100,0.38)');
    gr.addColorStop(1, 'rgba(232,110,100,0)');
    g.fillStyle = gr;
    g.fillRect(x - 40, ey, 80, 80);
  };
  blush(cx - dx * 1.18);
  blush(cx + dx * 1.18);
  g.strokeStyle = 'rgba(150,80,55,0.55)';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx + 2, ey + 18);
  g.quadraticCurveTo(cx + 9, ey + 34, cx, ey + 38);
  g.stroke();
  const brow = (side: number, tilt: number, lift = 0) => {
    const x = cx + side * dx;
    g.strokeStyle = '#c9cfdc';
    g.lineWidth = 11;
    g.beginPath();
    g.moveTo(x - side * 30, ey - 44 - lift + tilt);
    g.quadraticCurveTo(x, ey - 54 - lift, x + side * 30, ey - 46 - lift - tilt * 0.4);
    g.stroke();
    g.strokeStyle = 'rgba(60,60,80,0.35)';
    g.lineWidth = 2;
    g.stroke();
  };
  const eye = (side: number, squint = 0) => {
    const x = cx + side * dx;
    const y = ey;
    g.save();
    g.beginPath();
    g.ellipse(x, y, 25, 31, 0, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#fbfbff';
    g.fillRect(x - 30, y - 35, 60, 70);
    const ig = g.createLinearGradient(0, y - 24, 0, y + 24);
    ig.addColorStop(0, '#1f4fae');
    ig.addColorStop(0.55, '#2f86e0');
    ig.addColorStop(1, '#9fe3ff');
    g.fillStyle = ig;
    g.beginPath();
    g.ellipse(x + side * 2, y + 3, 18, 24, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0d1530';
    g.beginPath();
    g.ellipse(x + side * 2, y + 4, 8, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x + side * 2 - 7, y - 8, 6, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(x + side * 2 + 6, y + 12, 3, 0, Math.PI * 2);
    g.fill();
    if (squint) {
      g.fillStyle = SKIN;
      g.fillRect(x - 30, y - 36, 60, 22 + squint);
    }
    g.restore();
    g.strokeStyle = '#2a1c1a';
    g.lineWidth = 7;
    g.beginPath();
    const top = y - 30 + (squint ? 20 + squint * 0.3 : 0);
    g.moveTo(x - 27, y - 2 + (squint ? 8 : 0));
    g.quadraticCurveTo(x, top - 6, x + 27 + side * 4, y - 6 + (squint ? 10 : 0));
    g.stroke();
  };
  const closedEye = (side: number) => {
    const x = cx + side * dx;
    g.strokeStyle = '#2a1c1a';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(x - 24, ey + 6);
    g.quadraticCurveTo(x, ey - 22, x + 24, ey + 6);
    g.stroke();
  };
  const xEye = (side: number) => {
    const x = cx + side * dx;
    g.strokeStyle = '#2a1c1a';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(x - 20, ey - 14);
    g.lineTo(x + 18, ey);
    g.lineTo(x - 20, ey + 14);
    g.stroke();
  };
  const my = ey + 64;
  g.lineWidth = 6;
  g.strokeStyle = '#7a3a2e';
  if (expr === 'neutral') {
    brow(-1, 0); brow(1, 0); eye(-1); eye(1);
    g.beginPath(); g.moveTo(cx - 14, my); g.quadraticCurveTo(cx, my + 4, cx + 14, my); g.stroke();
  }
  if (expr === 'determined') {
    brow(-1, 12); brow(1, 12); eye(-1, 6); eye(1, 6);
    g.beginPath(); g.moveTo(cx - 18, my + 2); g.lineTo(cx + 18, my - 1); g.stroke();
  }
  if (expr === 'happy') {
    brow(-1, -4, 6); brow(1, -4, 6); closedEye(-1); closedEye(1);
    g.fillStyle = '#6b2626';
    g.beginPath(); g.moveTo(cx - 24, my - 6); g.quadraticCurveTo(cx, my + 34, cx + 24, my - 6); g.closePath(); g.fill();
    g.fillStyle = '#e46a6a';
    g.beginPath(); g.ellipse(cx, my + 12, 11, 6, 0, 0, Math.PI * 2); g.fill();
  }
  if (expr === 'hurt') {
    brow(-1, -10, 4); brow(1, -10, 4); eye(-1, 2); xEye(1);
    g.beginPath(); g.moveTo(cx - 20, my + 4); g.quadraticCurveTo(cx - 10, my - 6, cx, my + 2); g.quadraticCurveTo(cx + 10, my + 10, cx + 20, my); g.stroke();
    g.fillStyle = '#a7dcff';
    g.beginPath(); g.moveTo(cx + dx + 44, ey - 52); g.quadraticCurveTo(cx + dx + 58, ey - 22, cx + dx + 44, ey - 18); g.quadraticCurveTo(cx + dx + 30, ey - 22, cx + dx + 44, ey - 52); g.fill();
  }
}
