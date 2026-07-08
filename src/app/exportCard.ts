/**
 * Compose a shareable "my network" card from the live WebGL canvas + HUD stats.
 * Downloads a PNG; returns false if the canvas isn't ready yet.
 */
import { MODE_COLOR } from '@render/palette';
import type { UiState } from '@host/protocol';
import { getRenderer } from './rendererBridge';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

export interface NetworkCardMeta {
  cityLabel: string;
  ui: UiState;
}

export async function exportNetworkCard(meta: NetworkCardMeta): Promise<boolean> {
  const renderer = getRenderer();
  if (!renderer) return false;
  const src = renderer.captureCanvas();
  if (!src) return false;

  const W = 1200;
  const H = 675;
  const BAR = 88;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  if (!ctx) return false;

  // void background
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, W, H);

  // cover-fit the game frame into the card body
  const bodyH = H - BAR;
  const scale = Math.max(W / src.width, bodyH / src.height);
  const dw = src.width * scale;
  const dh = src.height * scale;
  const dx = (W - dw) / 2;
  const dy = (bodyH - dh) / 2;
  ctx.drawImage(src, dx, dy, dw, dh);

  // soft vignette so the chrome reads cleanly
  const vig = ctx.createRadialGradient(W / 2, bodyH / 2, bodyH * 0.25, W / 2, bodyH / 2, W * 0.7);
  vig.addColorStop(0, 'rgba(11,13,16,0)');
  vig.addColorStop(1, 'rgba(11,13,16,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, bodyH);

  // bottom bar
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, bodyH, W, BAR);
  ctx.fillStyle = 'rgba(255,182,61,0.35)';
  ctx.fillRect(0, bodyH, W, 2);

  // interchange mark
  const mx = 36;
  const my = bodyH + BAR / 2;
  const arms: [number, number, number][] = [
    [-10, -10, MODE_COLOR.rail],
    [10, -10, MODE_COLOR.tram],
    [10, 10, MODE_COLOR.bus],
    [-10, 10, MODE_COLOR.metro],
  ];
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  for (const [ax, ay, col] of arms) {
    ctx.strokeStyle = hex(col);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + ax, my + ay);
    ctx.stroke();
  }
  ctx.fillStyle = '#0b0d10';
  ctx.beginPath();
  ctx.arc(mx, my, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f4f4f5';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#f4f4f5';
  ctx.font = '600 22px "DM Sans", system-ui, sans-serif';
  ctx.fillText('MetroForge', 58, bodyH + 34);
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '500 14px "DM Sans", system-ui, sans-serif';
  ctx.fillText(meta.cityLabel, 58, bodyH + 56);

  const { ui } = meta;
  const stats = [
    `${Math.round(ui.dailyTransitTrips).toLocaleString()} riders/day`,
    `${(ui.transitShare * 100).toFixed(0)}% share`,
    `${(ui.coverage * 100).toFixed(0)}% covered`,
    `Day ${ui.day}`,
  ];
  ctx.textAlign = 'right';
  ctx.fillStyle = '#d4d4d8';
  ctx.font = '500 14px "DM Sans", system-ui, sans-serif';
  ctx.fillText(stats.join('  ·  '), W - 28, bodyH + 42);
  ctx.textAlign = 'left';

  const url = out.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  const slug = meta.cityLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'network';
  a.download = `metroforge-${slug}-day${ui.day}.png`;
  a.click();
  return true;
}
