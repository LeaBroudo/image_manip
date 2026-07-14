// Pointer-driven move / scale / rotate for collage items.
// All math is done against the item's center, so scaling and moving behave
// correctly at any rotation.

import { state, select, markDirty, notify } from './state.js';
import { paperRect, refreshItem } from './item.js';

const MIN_WIDTH = 0.02; // paper-width units

// Generic drag loop bound to a single pointer.
function beginDrag(e, onMove, onEnd) {
  const pointerId = e.pointerId;

  function move(ev) {
    if (ev.pointerId !== pointerId) return;
    onMove(ev);
  }
  function up(ev) {
    if (ev.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (onEnd) onEnd(ev);
    markDirty();
    notify();
  }

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// Item center in viewport coordinates. pw = paper width in px (1 unit = pw px).
function itemCenterClient(item, rect) {
  const pw = rect.width;
  return {
    x: rect.left + item.cx * pw,
    y: rect.top + item.cy * pw,
    pw,
  };
}

export function startMove(item, e) {
  select(item.id);
  const rect = paperRect();
  const pw = rect.width;
  const startX = e.clientX;
  const startY = e.clientY;
  const startCx = item.cx;
  const startCy = item.cy;

  beginDrag(e, (ev) => {
    item.cx = startCx + (ev.clientX - startX) / pw;
    item.cy = startCy + (ev.clientY - startY) / pw;
    refreshItem(item);
  });
}

export function startScale(item, e) {
  const rect = paperRect();
  const center = itemCenterClient(item, rect);
  const startDist = Math.hypot(e.clientX - center.x, e.clientY - center.y) || 1;
  const startWidth = item.width;

  beginDrag(e, (ev) => {
    const dist = Math.hypot(ev.clientX - center.x, ev.clientY - center.y);
    const factor = dist / startDist;
    item.width = Math.max(MIN_WIDTH, startWidth * factor);
    refreshItem(item);
  });
}

export function startRotate(item, e) {
  const rect = paperRect();
  const center = itemCenterClient(item, rect);
  const startAngle = Math.atan2(e.clientY - center.y, e.clientX - center.x);
  const startRot = item.rotation;

  beginDrag(e, (ev) => {
    const angle = Math.atan2(ev.clientY - center.y, ev.clientX - center.x);
    let deg = startRot + ((angle - startAngle) * 180) / Math.PI;
    if (ev.shiftKey) deg = Math.round(deg / 15) * 15; // snap with Shift
    item.rotation = deg;
    refreshItem(item);
  });
}

// Expose the state reference for keyboard nudges elsewhere if needed.
export function nudgeSelected(dxUnits, dyUnits) {
  const item = state.items.find((it) => it.id === state.selectedId);
  if (!item) return;
  item.cx += dxUnits;
  item.cy += dyUnits;
  markDirty();
  notify();
}
