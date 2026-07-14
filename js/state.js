// Central application state: global config + a list of collages, each with its
// own image items. Transforms are stored in PAPER-RELATIVE units where
// 1.0 === paper width. Paper size is global, so every collage shares an aspect
// ratio and item coordinates transfer directly when moved between collages.

import { DEFAULT_PAPER_ID, DEFAULT_DPI, aspectRatio } from './papers.js';

let nextCollageId = 1;
let nextItemId = 1;

export const state = {
  config: {
    paperId: DEFAULT_PAPER_ID,
    orientation: 'portrait',
    dpi: DEFAULT_DPI,
  },
  collages: [], // [{ id, name, items: [] }]
  selection: null, // { collageId, itemId } | null
  activeCollageId: null, // target for "Add images"
  dirty: false,
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  for (const fn of listeners) fn();
}

export function markDirty() {
  state.dirty = true;
}

export function setConfig(patch) {
  Object.assign(state.config, patch);
  notify();
}

// Paper aspect ratio (w/h), used for default placement of new items.
function paperAspect() {
  return aspectRatio(state.config.paperId, state.config.orientation);
}

// ---------- Collages ----------
export function addCollage(makeActive = true) {
  const collage = { id: nextCollageId++, name: `Collage ${nextCollageId - 1}`, items: [] };
  state.collages.push(collage);
  if (makeActive) state.activeCollageId = collage.id;
  markDirty();
  notify();
  return collage;
}

export function getCollage(id) {
  return state.collages.find((c) => c.id === id) || null;
}

export function removeCollage(id) {
  const idx = state.collages.findIndex((c) => c.id === id);
  if (idx === -1) return;
  const [removed] = state.collages.splice(idx, 1);
  for (const it of removed.items) {
    if (it.srcUrl) URL.revokeObjectURL(it.srcUrl);
  }
  if (state.selection && state.selection.collageId === id) state.selection = null;
  if (state.activeCollageId === id) {
    state.activeCollageId = state.collages.length ? state.collages[0].id : null;
  }
  markDirty();
  notify();
}

export function setActiveCollage(id) {
  if (state.activeCollageId === id) return;
  state.activeCollageId = id;
  notify();
}

// ---------- Items ----------
export function addItem(collageId, img, srcUrl, aspect) {
  const collage = getCollage(collageId);
  if (!collage) return null;

  // Default width: 45% of paper width, shrunk so the whole image fits.
  let width = 0.45;
  const paperHeightUnits = 1 / paperAspect();
  const height = width / aspect;
  if (height > paperHeightUnits * 0.9) {
    width = paperHeightUnits * 0.9 * aspect;
  }

  const item = {
    id: nextItemId++,
    img,
    srcUrl,
    naturalW: img.naturalWidth,
    naturalH: img.naturalHeight,
    cx: 0.5,
    cy: paperHeightUnits / 2,
    width,
    rotation: 0,
    crop: { x: 0, y: 0, w: 1, h: 1 },
  };
  collage.items.push(item);
  state.selection = { collageId, itemId: item.id };
  state.activeCollageId = collageId;
  markDirty();
  notify();
  return item;
}

export function getItem(collageId, itemId) {
  const collage = getCollage(collageId);
  if (!collage) return null;
  return collage.items.find((it) => it.id === itemId) || null;
}

export function removeItem(collageId, itemId) {
  const collage = getCollage(collageId);
  if (!collage) return;
  const idx = collage.items.findIndex((it) => it.id === itemId);
  if (idx === -1) return;
  const [removed] = collage.items.splice(idx, 1);
  if (removed.srcUrl) URL.revokeObjectURL(removed.srcUrl);
  if (state.selection && state.selection.itemId === itemId) state.selection = null;
  markDirty();
  notify();
}

// Move an item to another collage (used for drag-between-collages).
export function moveItemToCollage(itemId, fromId, toId) {
  if (fromId === toId) return;
  const from = getCollage(fromId);
  const to = getCollage(toId);
  if (!from || !to) return;
  const idx = from.items.findIndex((it) => it.id === itemId);
  if (idx === -1) return;
  const [item] = from.items.splice(idx, 1);
  to.items.push(item);
  state.selection = { collageId: toId, itemId };
  state.activeCollageId = toId;
  markDirty();
}

// ---------- Selection ----------
export function select(collageId, itemId) {
  const next = itemId == null ? null : { collageId, itemId };
  const cur = state.selection;
  const same = (!cur && !next) || (cur && next && cur.collageId === next.collageId && cur.itemId === next.itemId);
  if (same) return;
  state.selection = next;
  if (collageId != null) state.activeCollageId = collageId;
  notify();
}

export function getSelected() {
  if (!state.selection) return null;
  const collage = getCollage(state.selection.collageId);
  if (!collage) return null;
  const item = collage.items.find((it) => it.id === state.selection.itemId);
  if (!item) return null;
  return { collage, item };
}

// ---------- Z-order (scoped to a collage) ----------
function reorder(collageId, itemId, fn) {
  const collage = getCollage(collageId);
  if (!collage) return;
  const items = collage.items;
  const i = items.findIndex((it) => it.id === itemId);
  if (i < 0) return;
  fn(items, i);
  markDirty();
  notify();
}

export function toFront(collageId, itemId) {
  reorder(collageId, itemId, (items, i) => {
    if (i === items.length - 1) return;
    const [it] = items.splice(i, 1);
    items.push(it);
  });
}

export function toBack(collageId, itemId) {
  reorder(collageId, itemId, (items, i) => {
    if (i === 0) return;
    const [it] = items.splice(i, 1);
    items.unshift(it);
  });
}

export function forward(collageId, itemId) {
  reorder(collageId, itemId, (items, i) => {
    if (i === items.length - 1) return;
    [items[i], items[i + 1]] = [items[i + 1], items[i]];
  });
}

export function backward(collageId, itemId) {
  reorder(collageId, itemId, (items, i) => {
    if (i === 0) return;
    [items[i], items[i - 1]] = [items[i - 1], items[i]];
  });
}
