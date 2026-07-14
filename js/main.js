// Bootstrap: builds the collage panels, wires the toolbar, loads images, handles
// keyboard shortcuts and drag-and-drop, and installs the reload guard.

import {
  state,
  subscribe,
  setConfig,
  addCollage,
  removeCollage,
  getCollage,
  setActiveCollage,
  addItem,
  removeItem,
  getSelected,
  select,
  toFront,
  toBack,
  forward,
  backward,
} from './state.js';
import { PAPER_SIZES, DEFAULT_PAPER_ID, aspectRatio } from './papers.js';
import { CollageView, setPaperDisplaySize } from './collageView.js';
import { setView, getView, deleteView } from './views.js';
import { nudgeSelected } from './transform.js';
import { enterCrop, cancelCrop, applyCrop, resetCrop, isCropping } from './crop.js';
import { exportCollage, exportAll } from './exporter.js';

const $ = (id) => document.getElementById(id);

const stageEl = $('stage');
const collagesEl = $('collages');
const statusbar = $('statusbar');

const els = {
  paperSize: $('paperSize'),
  orientation: $('orientation'),
  dpi: $('dpi'),
  addImages: $('addImages'),
  fileInput: $('fileInput'),
  addCollage: $('addCollage'),
  cropBtn: $('cropBtn'),
  uncropBtn: $('uncropBtn'),
  toFront: $('toFront'),
  forward: $('forward'),
  backward: $('backward'),
  toBack: $('toBack'),
  deleteBtn: $('deleteBtn'),
  itemControls: $('itemControls'),
  cropActions: $('cropActions'),
  cropApply: $('cropApply'),
  cropCancel: $('cropCancel'),
  exportAllBtn: $('exportAllBtn'),
};

// Callbacks handed to every CollageView.
const viewHandlers = {
  onExport: (collageId) => {
    const collage = getCollage(collageId);
    if (!collage) return;
    const { outW, outH, filename } = exportCollage(collage);
    status(`Exporting ${filename} at ${outW}×${outH}px…`);
  },
  onDelete: (collageId) => {
    if (state.collages.length <= 1) {
      status('Keep at least one collage.');
      return;
    }
    if (window.confirm('Delete this collage? This cannot be undone.')) {
      removeCollage(collageId);
      status('Collage deleted.');
    }
  },
  onActivate: (collageId) => setActiveCollage(collageId),
};

function status(msg) {
  statusbar.textContent = msg;
}

// ---------- Paper sizing ----------
function populatePaperSizes() {
  for (const p of PAPER_SIZES) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    els.paperSize.appendChild(opt);
  }
  els.paperSize.value = DEFAULT_PAPER_ID;
}

function computeDisplaySize() {
  const aspect = aspectRatio(state.config.paperId, state.config.orientation);
  const stageW = Math.max(240, stageEl.clientWidth - 48);
  let h = Math.min(0.72 * window.innerHeight, 820);
  let w = h * aspect;
  // Let ~2 papers sit per row once there is more than one.
  const maxW = stageW * (state.collages.length <= 1 ? 0.62 : 0.46);
  if (w > maxW) {
    w = maxW;
    h = w / aspect;
  }
  setPaperDisplaySize(Math.round(w), Math.round(h));
}

// ---------- Reconcile views with state.collages ----------
function reconcileViews() {
  const wanted = new Set(state.collages.map((c) => c.id));
  // Remove views for deleted collages.
  for (const c of [...document.querySelectorAll('.collage-panel')]) {
    const id = Number(c.dataset.collageId);
    if (!wanted.has(id)) {
      const v = getView(id);
      if (v) v.destroy();
      deleteView(id);
    }
  }
  // Create + (re)append in state order.
  for (const collage of state.collages) {
    let view = getView(collage.id);
    if (!view) {
      view = new CollageView(collage, viewHandlers);
      setView(collage.id, view);
    }
    collagesEl.appendChild(view.panel); // keeps DOM order aligned to state
  }
}

function renderAll() {
  computeDisplaySize();
  reconcileViews();
  const sel = state.selection;
  for (const collage of state.collages) {
    const view = getView(collage.id);
    const selectedItemId = sel && sel.collageId === collage.id ? sel.itemId : null;
    view.render(selectedItemId);
    view.setActive(collage.id === state.activeCollageId);
  }
  updateToolbar();
}

// ---------- Toolbar ----------
function setCropUI(on) {
  els.cropActions.hidden = !on;
  els.itemControls.hidden = on;
  els.paperSize.disabled = on;
  els.orientation.disabled = on;
  els.addCollage.disabled = on;
}

function updateToolbar() {
  const has = !!getSelected();
  for (const btn of [
    els.cropBtn,
    els.uncropBtn,
    els.toFront,
    els.forward,
    els.backward,
    els.toBack,
    els.deleteBtn,
  ]) {
    btn.disabled = !has;
  }
}

subscribe(renderAll);

// ---------- Image loading ----------
function activeCollageId() {
  if (state.activeCollageId && getCollage(state.activeCollageId)) return state.activeCollageId;
  if (state.collages.length) return state.collages[0].id;
  return addCollage().id;
}

// placeAt (optional): { cx, cy } in paper-width units for the target collage.
function loadFiles(fileList, collageId, placeAt) {
  const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
  files.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight;
      const item = addItem(collageId, img, url, aspect);
      if (item && placeAt) {
        const offset = i * 0.03;
        item.cx = placeAt.cx + offset;
        item.cy = placeAt.cy + offset;
        renderAll();
      }
      status(`Added ${file.name} (${img.naturalWidth}×${img.naturalHeight})`);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      status(`Could not load ${file.name}`);
    };
    img.src = url;
  });
}

// Which collage a drop landed on, and where (paper-width units) — or null.
function dropTarget(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const panel = el && el.closest('[data-collage-id]');
  if (!panel) return null;
  const id = Number(panel.dataset.collageId);
  const view = getView(id);
  if (!view) return null;
  const r = view.paperRect();
  const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  const placeAt = over ? { cx: (e.clientX - r.left) / r.width, cy: (e.clientY - r.top) / r.width } : null;
  return { id, placeAt };
}

// ---------- Wiring ----------
function wire() {
  els.addImages.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', (e) => {
    loadFiles(e.target.files, activeCollageId());
    els.fileInput.value = '';
  });

  els.addCollage.addEventListener('click', () => {
    const c = addCollage();
    status(`Added ${c.name}.`);
  });

  els.paperSize.addEventListener('change', () => setConfig({ paperId: els.paperSize.value }));
  els.orientation.addEventListener('change', () => setConfig({ orientation: els.orientation.value }));
  els.dpi.addEventListener('change', () => setConfig({ dpi: Number(els.dpi.value) }));

  els.toFront.addEventListener('click', () => runOnSelected(toFront));
  els.forward.addEventListener('click', () => runOnSelected(forward));
  els.backward.addEventListener('click', () => runOnSelected(backward));
  els.toBack.addEventListener('click', () => runOnSelected(toBack));
  els.deleteBtn.addEventListener('click', () => runOnSelected(removeItem));

  els.cropBtn.addEventListener('click', () => {
    if (!getSelected()) return;
    enterCrop();
    setCropUI(true);
    status('Crop mode: drag the rectangle, then Apply.');
  });
  els.uncropBtn.addEventListener('click', () => {
    resetCrop();
    status('Crop reset to full image.');
  });
  els.cropApply.addEventListener('click', () => {
    applyCrop();
    setCropUI(false);
    status('Crop applied.');
  });
  els.cropCancel.addEventListener('click', () => {
    cancelCrop();
    setCropUI(false);
    status('Crop cancelled.');
  });

  els.exportAllBtn.addEventListener('click', () => {
    if (isCropping()) {
      status('Finish or cancel cropping before exporting.');
      return;
    }
    const { count } = exportAll();
    status(count ? `Exporting ${count} collage${count > 1 ? 's' : ''}…` : 'Nothing to export.');
  });

  // OS file drag & drop onto a specific collage (or the active one).
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    dragDepth++;
    document.body.classList.add('dragging');
  });
  window.addEventListener('dragover', (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) document.body.classList.remove('dragging');
  });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    if (isCropping()) {
      status('Finish or cancel cropping before adding images.');
      return;
    }
    const target = dropTarget(e);
    if (target) loadFiles(e.dataTransfer.files, target.id, target.placeAt);
    else loadFiles(e.dataTransfer.files, activeCollageId());
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(t.tagName)) return;

    if (e.key === 'Escape') {
      if (isCropping()) {
        cancelCrop();
        setCropUI(false);
      } else if (state.selection) {
        select(state.selection.collageId, null);
      }
      return;
    }
    if (isCropping()) return;

    const sel = getSelected();
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      e.preventDefault();
      removeItem(sel.collage.id, sel.item.id);
    } else if (e.key.startsWith('Arrow') && sel) {
      e.preventDefault();
      const step = e.shiftKey ? 0.02 : 0.004;
      const map = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const [dx, dy] = map[e.key];
      nudgeSelected(dx, dy);
    }
  });

  window.addEventListener('resize', () => {
    if (isCropping()) return;
    renderAll();
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

function runOnSelected(fn) {
  const sel = getSelected();
  if (sel) fn(sel.collage.id, sel.item.id);
}

// ---------- Init ----------
populatePaperSizes();
wire();
addCollage(); // start with one collage (fires the first render)
status('Ready. Add images, or add another collage.');
