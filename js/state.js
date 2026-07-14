// Central application state: collage config, image items, selection, dirty flag.
// Transforms are stored in PAPER-RELATIVE units where 1.0 === paper width.
// This keeps on-screen editing and high-res export identical up to a scalar.

import { DEFAULT_PAPER_ID, DEFAULT_DPI, aspectRatio } from './papers.js';

let nextId = 1;

export const state = {
  config: {
    paperId: DEFAULT_PAPER_ID,
    orientation: 'portrait',
    dpi: DEFAULT_DPI,
  },
  items: [], // draw order: index 0 = bottom, last = top
  selectedId: null,
  dirty: false,
};

const listeners = new Set();

// Subscribe to any state change. Returns an unsubscribe function.
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  for (const fn of listeners) fn();
}

// Mark the collage as having unsaved edits (drives the beforeunload guard).
export function markDirty() {
  state.dirty = true;
}

export function setConfig(patch) {
  Object.assign(state.config, patch);
  notify();
}

// Create an item from a loaded image, centered on the paper.
export function addItem(img, srcUrl, aspect) {
  // Default width: 45% of paper width, but shrink so the whole image fits.
  let width = 0.45;
  const height = width / aspect; // in paper-width units
  const paperHeightUnits = 1 / aspect_of_paper();
  if (height > paperHeightUnits * 0.9) {
    width = paperHeightUnits * 0.9 * aspect;
  }

  const item = {
    id: nextId++,
    img,
    srcUrl,
    naturalW: img.naturalWidth,
    naturalH: img.naturalHeight,
    cx: 0.5,
    cy: (1 / aspect_of_paper()) / 2, // vertical center in paper-width units
    width,
    rotation: 0,
    crop: { x: 0, y: 0, w: 1, h: 1 },
  };
  state.items.push(item);
  state.selectedId = item.id;
  markDirty();
  notify();
  return item;
}

// Paper aspect ratio (w/h), used for default placement of new items.
function aspect_of_paper() {
  return aspectRatio(state.config.paperId, state.config.orientation);
}

export function getItem(id) {
  return state.items.find((it) => it.id === id) || null;
}

export function getSelected() {
  return getItem(state.selectedId);
}

export function select(id) {
  if (state.selectedId === id) return;
  state.selectedId = id;
  notify();
}

export function removeItem(id) {
  const idx = state.items.findIndex((it) => it.id === id);
  if (idx === -1) return;
  const [removed] = state.items.splice(idx, 1);
  if (removed.srcUrl) URL.revokeObjectURL(removed.srcUrl);
  if (state.selectedId === id) state.selectedId = null;
  markDirty();
  notify();
}

// ---- Z-order operations (operate on the selected item) ----
function indexOf(id) {
  return state.items.findIndex((it) => it.id === id);
}

export function toFront(id) {
  const i = indexOf(id);
  if (i < 0 || i === state.items.length - 1) return;
  const [it] = state.items.splice(i, 1);
  state.items.push(it);
  markDirty();
  notify();
}

export function toBack(id) {
  const i = indexOf(id);
  if (i <= 0) return;
  const [it] = state.items.splice(i, 1);
  state.items.unshift(it);
  markDirty();
  notify();
}

export function forward(id) {
  const i = indexOf(id);
  if (i < 0 || i === state.items.length - 1) return;
  [state.items[i], state.items[i + 1]] = [state.items[i + 1], state.items[i]];
  markDirty();
  notify();
}

export function backward(id) {
  const i = indexOf(id);
  if (i <= 0) return;
  [state.items[i], state.items[i - 1]] = [state.items[i - 1], state.items[i]];
  markDirty();
  notify();
}
