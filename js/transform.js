// Pointer-driven move / scale / rotate for collage items. Each entry point takes
// the CollageView that owns the item. Move supports dragging an item from one
// collage into another via a floating copy in the shared drag layer.

import { select, markDirty, notify, getSelected, moveItemToCollage } from './state.js';
import { getView, getDragLayer } from './views.js';

const MIN_WIDTH = 0.02; // paper-width units
const DRAG_THRESHOLD = 3; // px before a move becomes a drag

// Generic single-pointer drag loop for scale/rotate.
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

function itemCenterClient(view, item) {
  const rect = view.paperRect();
  const pw = rect.width;
  return { x: rect.left + item.cx * pw, y: rect.top + item.cy * pw, pw };
}

// ---------- Move (with cross-collage drag) ----------
export function startMove(view, item, e) {
  select(view.collage.id, item.id);

  const rect = view.paperRect();
  const box = view.itemBox(item);
  const centerScreenX = rect.left + box.centerX;
  const centerScreenY = rect.top + box.centerY;
  const offsetX = e.clientX - centerScreenX;
  const offsetY = e.clientY - centerScreenY;

  const pointerId = e.pointerId;
  const origWrapper = view.getWrapper(item.id);
  let started = false;
  let ghost = null;
  let lastCenter = { x: centerScreenX, y: centerScreenY };

  const start = () => {
    started = true;
    // Build a floating copy that can travel above/between panels.
    ghost = origWrapper.cloneNode(true);
    ghost.classList.remove('selected');
    ghost.classList.add('drag-ghost');
    ghost.style.position = 'fixed';
    ghost.style.margin = '0';
    ghost.style.width = `${box.boxW}px`;
    ghost.style.height = `${box.boxH}px`;
    ghost.style.transform = `rotate(${item.rotation}deg)`;
    getDragLayer().appendChild(ghost);
    if (origWrapper) origWrapper.style.visibility = 'hidden';
    view.selectionEl.hidden = true;
  };

  const positionGhost = (cx, cy) => {
    ghost.style.left = `${cx - box.boxW / 2}px`;
    ghost.style.top = `${cy - box.boxH / 2}px`;
    lastCenter = { x: cx, y: cy };
  };

  const highlightTarget = (clientX, clientY) => {
    document.querySelectorAll('.collage-panel.drop-target').forEach((p) => p.classList.remove('drop-target'));
    const el = document.elementFromPoint(clientX, clientY);
    const panel = el && el.closest('.collage-panel');
    if (panel) panel.classList.add('drop-target');
  };

  const move = (ev) => {
    if (ev.pointerId !== pointerId) return;
    if (!started) {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
      start();
    }
    const cx = ev.clientX - offsetX;
    const cy = ev.clientY - offsetY;
    positionGhost(cx, cy);
    highlightTarget(ev.clientX, ev.clientY);
  };

  const up = (ev) => {
    if (ev.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);

    if (!started) return; // just a click/select, nothing moved

    document.querySelectorAll('.collage-panel.drop-target').forEach((p) => p.classList.remove('drop-target'));
    if (ghost) ghost.remove();
    if (origWrapper) origWrapper.style.visibility = '';

    // Find the collage under the drop point.
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const panel = el && el.closest('[data-collage-id]');
    const targetId = panel ? Number(panel.dataset.collageId) : null;
    const targetView = targetId != null ? getView(targetId) : null;

    if (targetView) {
      const tRect = targetView.paperRect();
      const pw = tRect.width;
      const newCx = (lastCenter.x - tRect.left) / pw;
      const newCy = (lastCenter.y - tRect.top) / pw;
      if (targetId !== view.collage.id) {
        moveItemToCollage(item.id, view.collage.id, targetId);
      }
      item.cx = newCx;
      item.cy = newCy;
    }
    // If dropped outside any collage, leave the item where it was.

    markDirty();
    notify();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// ---------- Scale (uniform, from center) ----------
export function startScale(view, item, e) {
  const center = itemCenterClient(view, item);
  const startDist = Math.hypot(e.clientX - center.x, e.clientY - center.y) || 1;
  const startWidth = item.width;
  beginDrag(e, (ev) => {
    const dist = Math.hypot(ev.clientX - center.x, ev.clientY - center.y);
    item.width = Math.max(MIN_WIDTH, startWidth * (dist / startDist));
    view.refreshItem(item);
  });
}

// ---------- Rotate ----------
export function startRotate(view, item, e) {
  const center = itemCenterClient(view, item);
  const startAngle = Math.atan2(e.clientY - center.y, e.clientX - center.x);
  const startRot = item.rotation;
  beginDrag(e, (ev) => {
    const angle = Math.atan2(ev.clientY - center.y, ev.clientX - center.x);
    let deg = startRot + ((angle - startAngle) * 180) / Math.PI;
    if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
    item.rotation = deg;
    view.refreshItem(item);
  });
}

// Keyboard nudge of the currently selected item.
export function nudgeSelected(dxUnits, dyUnits) {
  const sel = getSelected();
  if (!sel) return;
  sel.item.cx += dxUnits;
  sel.item.cy += dyUnits;
  markDirty();
  notify();
}
