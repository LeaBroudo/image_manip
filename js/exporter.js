// Renders collages to offscreen canvases at full print resolution and downloads
// them as lossless PNGs. Images are drawn directly from the original decoded
// bitmaps (honoring each item's crop), so there is no re-compression.

import { state } from './state.js';
import { exportPx, getPaper } from './papers.js';

function slug(name) {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'collage';
}

// Render one collage to a PNG blob at the given config's print resolution.
function renderCollage(collage, config) {
  const { paperId, orientation, dpi } = config;
  const { w: outW, h: outH } = exportPx(paperId, orientation, dpi);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);

  const unit = outW; // 1 paper-width unit === outW export pixels

  for (const item of collage.items) {
    const boxW = item.width * unit;
    const cropAspect = (item.crop.w * item.naturalW) / (item.crop.h * item.naturalH);
    const boxH = boxW / cropAspect;
    const cx = item.cx * unit;
    const cy = item.cy * unit;
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

  return { canvas, outW, outH };
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function filenameFor(collage, config) {
  const paper = getPaper(config.paperId);
  return `${slug(collage.name)}-${paper.id}-${config.orientation}-${config.dpi}dpi.png`;
}

// Export a single collage. Returns dimensions + filename for status messages.
export function exportCollage(collage, config = state.config) {
  const { canvas, outW, outH } = renderCollage(collage, config);
  const filename = filenameFor(collage, config);
  canvas.toBlob((blob) => {
    if (blob) download(blob, filename);
  }, 'image/png');
  return { outW, outH, filename };
}

// Export every collage as its own PNG, staggered so the browser accepts the
// sequence of downloads.
export function exportAll(config = state.config) {
  const collages = state.collages;
  collages.forEach((collage, i) => {
    setTimeout(() => {
      const { canvas } = renderCollage(collage, config);
      canvas.toBlob((blob) => {
        if (blob) download(blob, filenameFor(collage, config));
      }, 'image/png');
    }, i * 400);
  });
  return { count: collages.length };
}
