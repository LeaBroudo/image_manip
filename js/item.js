// Renders collage items into the paper element and keeps a selection overlay
// (bounding box + scale/rotate handles) in sync with the selected item.

import { state } from './state.js';
import { startMove, startScale, startRotate } from './transform.js';

let paperEl = null;
const elements = new Map(); // id -> { wrapper, img }
let selectionEl = null;

export function initItemLayer(el) {
  paperEl = el;
  selectionEl = buildSelectionOverlay();
  paperEl.appendChild(selectionEl);
}

// Current on-screen paper size in CSS pixels.
export function paperMetrics() {
  return { w: paperEl.clientWidth, h: paperEl.clientHeight };
}

// Paper position + size in viewport coordinates (for pointer math).
export function paperRect() {
  return paperEl.getBoundingClientRect();
}

// Cropped-region aspect ratio (w/h) in natural pixels.
export function cropAspect(item) {
  const cw = item.crop.w * item.naturalW;
  const ch = item.crop.h * item.naturalH;
  return cw / ch;
}

// Layout geometry (in px) for an item's display box on the current paper.
export function itemBox(item) {
  const { w: pw } = paperMetrics();
  const boxW = item.width * pw;
  const boxH = boxW / cropAspect(item);
  const centerX = item.cx * pw;
  const centerY = item.cy * pw;
  return { boxW, boxH, centerX, centerY, left: centerX - boxW / 2, top: centerY - boxH / 2 };
}

function buildElement(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'item';
  wrapper.dataset.id = String(item.id);

  const img = document.createElement('img');
  img.src = item.srcUrl;
  img.alt = '';
  wrapper.appendChild(img);

  // Select + begin move on press (unless we're in crop mode, handled elsewhere).
  wrapper.addEventListener('pointerdown', (e) => {
    if (wrapper.classList.contains('cropping')) return;
    e.preventDefault();
    startMove(item, e);
  });

  paperEl.appendChild(wrapper);
  return { wrapper, img };
}

function applyLayout(item, refs) {
  const { boxW, boxH, left, top } = itemBox(item);
  const { wrapper, img } = refs;

  wrapper.style.width = `${boxW}px`;
  wrapper.style.height = `${boxH}px`;
  wrapper.style.left = `${left}px`;
  wrapper.style.top = `${top}px`;
  wrapper.style.transform = `rotate(${item.rotation}deg)`;

  // Scale the full image so the cropped region exactly fills the box.
  const imgDisplayW = boxW / item.crop.w;
  const imgDisplayH = imgDisplayW * (item.naturalH / item.naturalW);
  img.style.width = `${imgDisplayW}px`;
  img.style.height = `${imgDisplayH}px`;
  img.style.left = `${-item.crop.x * imgDisplayW}px`;
  img.style.top = `${-item.crop.y * imgDisplayH}px`;
}

export function render() {
  if (!paperEl) return;

  // Remove DOM for deleted items.
  for (const [id, refs] of elements) {
    if (!state.items.some((it) => it.id === id)) {
      refs.wrapper.remove();
      elements.delete(id);
    }
  }

  // Create/update items in draw order.
  state.items.forEach((item, index) => {
    let refs = elements.get(item.id);
    if (!refs) {
      refs = buildElement(item);
      elements.set(item.id, refs);
    }
    applyLayout(item, refs);
    refs.wrapper.style.zIndex = String(index + 1);
    refs.wrapper.classList.toggle('selected', item.id === state.selectedId);
  });

  updateSelectionOverlay();
}

// Force a specific item's DOM to update during a drag without a full render.
export function refreshItem(item) {
  const refs = elements.get(item.id);
  if (refs) applyLayout(item, refs);
  updateSelectionOverlay();
}

export function getWrapper(id) {
  const refs = elements.get(id);
  return refs ? refs.wrapper : null;
}

// ---------- Selection overlay ----------
function buildSelectionOverlay() {
  const sel = document.createElement('div');
  sel.className = 'selection';
  sel.hidden = true;

  const box = document.createElement('div');
  box.className = 'box';
  sel.appendChild(box);

  const stem = document.createElement('div');
  stem.className = 'rotate-stem';
  sel.appendChild(stem);

  const rotate = document.createElement('div');
  rotate.className = 'handle rotate';
  rotate.dataset.role = 'rotate';
  sel.appendChild(rotate);

  for (const corner of ['tl', 'tr', 'br', 'bl']) {
    const h = document.createElement('div');
    h.className = `handle scale ${corner}`;
    h.dataset.role = 'scale';
    h.dataset.corner = corner;
    sel.appendChild(h);
  }

  // Delegate handle presses to the transform helpers.
  sel.addEventListener('pointerdown', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const role = target.dataset.role;
    if (!role) return;
    const item = state.items.find((it) => it.id === state.selectedId);
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    if (role === 'scale') startScale(item, e);
    else if (role === 'rotate') startRotate(item, e);
  });

  return sel;
}

export function updateSelectionOverlay() {
  if (!selectionEl) return;
  const item = state.items.find((it) => it.id === state.selectedId);
  const cropping = item && getWrapper(item.id)?.classList.contains('cropping');
  if (!item || cropping) {
    selectionEl.hidden = true;
    return;
  }
  const { boxW, boxH, left, top } = itemBox(item);
  selectionEl.hidden = false;
  selectionEl.style.left = `${left}px`;
  selectionEl.style.top = `${top}px`;
  selectionEl.style.width = `${boxW}px`;
  selectionEl.style.height = `${boxH}px`;
  selectionEl.style.transform = `rotate(${item.rotation}deg)`;
  // Keep overlay above every item.
  selectionEl.style.zIndex = String(state.items.length + 10);
}
