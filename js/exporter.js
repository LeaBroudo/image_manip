// Renders the collage to an offscreen canvas at full print resolution and
// downloads it as a lossless PNG. Images are drawn directly from the original
// decoded bitmaps (honoring each item's crop), so there is no re-compression.

import { state } from './state.js';
import { exportPx, getPaper } from './papers.js';

export function exportPng() {
  const { paperId, orientation, dpi } = state.config;
  const { w: outW, h: outH } = exportPx(paperId, orientation, dpi);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // White background so transparent regions print white.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);

  // 1 paper-width unit === outW export pixels (same convention as on screen).
  const unit = outW;

  for (const item of state.items) {
    const boxW = item.width * unit;
    const cropAspect = (item.crop.w * item.naturalW) / (item.crop.h * item.naturalH);
    const boxH = boxW / cropAspect;
    const cx = item.cx * unit;
    const cy = item.cy * unit;

    // Source rectangle in the original image (crop is normalized 0..1).
    const sx = item.crop.x * item.naturalW;
    const sy = item.crop.y * item.naturalH;
    const sw = item.crop.w * item.naturalW;
    const sh = item.crop.h * item.naturalH;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((item.rotation * Math.PI) / 180);
    ctx.drawImage(item.img, sx, sy, sw, sh, -boxW / 2, -boxH / 2, boxW, boxH);
    ctx.restore();
  }

  const paper = getPaper(paperId);
  const filename = `collage-${paper.id}-${orientation}-${dpi}dpi.png`;

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');

  return { outW, outH, filename };
}
