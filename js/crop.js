// Non-destructive crop editor. Entering crop mode shows the FULL image (dimmed)
// with a draggable/resizable crop rectangle. Applying stores the rectangle as a
// normalized crop {x,y,w,h}; the original image is never altered, so cropping is
// fully reversible (see resetCrop / the Uncrop button).

import { state, markDirty, notify, getSelected } from './state.js';
import { paperRect, getWrapper, updateSelectionOverlay } from './item.js';

const MIN_PX = 16; // minimum crop rectangle size on screen

let ctx = null; // active crop context, or null when not cropping

export function isCropping() {
  return ctx !== null;
}

export function enterCrop() {
  const item = getSelected();
  if (!item || ctx) return;

  const rect = paperRect();
  const pw = rect.width;
  const theta = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Full (uncropped) image display size, keeping the current pixel scale.
  const fullW = (item.width * pw) / item.crop.w;
  const fullH = fullW * (item.naturalH / item.naturalW);

  // Offset (local, unrotated) from the cropped-box center to the full-image
  // center, so the visible pixels don't jump when we reveal the whole image.
  const ox = fullW * (0.5 - item.crop.x - item.crop.w / 2);
  const oy = fullH * (0.5 - item.crop.y - item.crop.h / 2);
  const rx = ox * cos - oy * sin;
  const ry = ox * sin + oy * cos;

  // Full-image center, in paper-local px (relative to paper top-left).
  const centerLocalX = item.cx * pw + rx;
  const centerLocalY = item.cy * pw + ry;

  const wrapper = getWrapper(item.id);
  const img = wrapper.querySelector('img');
  wrapper.classList.add('cropping');
  wrapper.style.width = `${fullW}px`;
  wrapper.style.height = `${fullH}px`;
  wrapper.style.left = `${centerLocalX - fullW / 2}px`;
  wrapper.style.top = `${centerLocalY - fullH / 2}px`;
  wrapper.style.transform = `rotate(${item.rotation}deg)`;
  img.style.left = '0px';
  img.style.top = '0px';
  img.style.width = `${fullW}px`;
  img.style.height = `${fullH}px`;

  // Crop rectangle, in local px within the full image.
  const cr = {
    x: item.crop.x * fullW,
    y: item.crop.y * fullH,
    w: item.crop.w * fullW,
    h: item.crop.h * fullH,
  };

  const rectEl = buildCropRect();
  wrapper.appendChild(rectEl);

  ctx = {
    item,
    wrapper,
    img,
    rectEl,
    fullW,
    fullH,
    theta,
    cos,
    sin,
    pw,
    rx,
    ry,
    // Full-image center in viewport coords (for pointer → local conversion).
    centerClientX: rect.left + centerLocalX,
    centerClientY: rect.top + centerLocalY,
    cr,
  };

  updateCropDom();

  // Hide the selection overlay while cropping (it detects the "cropping" class).
  updateSelectionOverlay();
}

// Convert a viewport pointer position into full-image-local coordinates.
function toLocal(ev) {
  const dx = ev.clientX - ctx.centerClientX;
  const dy = ev.clientY - ctx.centerClientY;
  return {
    lx: dx * ctx.cos + dy * ctx.sin + ctx.fullW / 2,
    ly: -dx * ctx.sin + dy * ctx.cos + ctx.fullH / 2,
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function buildCropRect() {
  const rectEl = document.createElement('div');
  rectEl.className = 'crop-rect';

  for (const pos of ['tl', 'tr', 'br', 'bl', 'n', 's', 'e', 'w']) {
    const h = document.createElement('div');
    h.className = `crop-handle ${pos}`;
    h.dataset.pos = pos;
    rectEl.appendChild(h);
  }

  rectEl.addEventListener('pointerdown', onCropPointerDown);
  return rectEl;
}

const EDGE_MAP = {
  tl: { l: true, t: true },
  tr: { r: true, t: true },
  br: { r: true, b: true },
  bl: { l: true, b: true },
  n: { t: true },
  s: { b: true },
  w: { l: true },
  e: { r: true },
};

function onCropPointerDown(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const target = ev.target;
  const pos = target instanceof HTMLElement ? target.dataset.pos : undefined;
  const pointerId = ev.pointerId;

  const start = toLocal(ev);
  const startRect = { ...ctx.cr };

  const onMove = (e) => {
    if (e.pointerId !== pointerId) return;
    const cur = toLocal(e);
    if (pos && EDGE_MAP[pos]) {
      resize(EDGE_MAP[pos], cur, startRect);
    } else {
      move(cur, start, startRect);
    }
    updateCropDom();
  };
  const onUp = (e) => {
    if (e.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function move(cur, start, startRect) {
  const nx = clamp(startRect.x + (cur.lx - start.lx), 0, ctx.fullW - startRect.w);
  const ny = clamp(startRect.y + (cur.ly - start.ly), 0, ctx.fullH - startRect.h);
  ctx.cr.x = nx;
  ctx.cr.y = ny;
}

function resize(edges, cur, startRect) {
  let L = startRect.x;
  let T = startRect.y;
  let R = startRect.x + startRect.w;
  let B = startRect.y + startRect.h;
  if (edges.l) L = clamp(cur.lx, 0, R - MIN_PX);
  if (edges.r) R = clamp(cur.lx, L + MIN_PX, ctx.fullW);
  if (edges.t) T = clamp(cur.ly, 0, B - MIN_PX);
  if (edges.b) B = clamp(cur.ly, T + MIN_PX, ctx.fullH);
  ctx.cr = { x: L, y: T, w: R - L, h: B - T };
}

function updateCropDom() {
  const { rectEl, cr } = ctx;
  rectEl.style.left = `${cr.x}px`;
  rectEl.style.top = `${cr.y}px`;
  rectEl.style.width = `${cr.w}px`;
  rectEl.style.height = `${cr.h}px`;
}

export function applyCrop() {
  if (!ctx) return;
  const { item, fullW, fullH, cr, theta, pw, rx, ry } = ctx;

  const newCrop = {
    x: cr.x / fullW,
    y: cr.y / fullH,
    w: cr.w / fullW,
    h: cr.h / fullH,
  };

  // Preserve on-screen pixel scale: width tracks the crop width.
  const imgScale = item.width / item.crop.w; // paper units per full-image width
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Full-image center (paper-local px), then offset to the new crop's center.
  const centerLocalX = item.cx * pw + rx;
  const centerLocalY = item.cy * pw + ry;
  const offX = cr.x + cr.w / 2 - fullW / 2;
  const offY = cr.y + cr.h / 2 - fullH / 2;
  const rcx = offX * cos - offY * sin;
  const rcy = offX * sin + offY * cos;

  item.cx = (centerLocalX + rcx) / pw;
  item.cy = (centerLocalY + rcy) / pw;
  item.width = imgScale * newCrop.w;
  item.crop = newCrop;

  teardown();
  markDirty();
  notify();
}

export function cancelCrop() {
  if (!ctx) return;
  teardown();
  notify(); // re-render restores the original (pre-crop-mode) layout
}

// Reset the selected item's crop to the full image (Uncrop button).
export function resetCrop() {
  if (ctx) cancelCrop();
  const item = getSelected();
  if (!item) return;
  // Keep the image's pixel scale; expand the box back to the full image.
  const imgScale = item.width / item.crop.w;
  item.width = imgScale; // crop.w becomes 1
  item.crop = { x: 0, y: 0, w: 1, h: 1 };
  markDirty();
  notify();
}

function teardown() {
  if (!ctx) return;
  ctx.wrapper.classList.remove('cropping');
  ctx.rectEl.remove();
  ctx = null;
}
