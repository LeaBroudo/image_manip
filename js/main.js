// Bootstrap: builds the paper stage, wires the toolbar, loads images, handles
// keyboard shortcuts, and installs the reload guard.

import {
  state,
  subscribe,
  setConfig,
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
import { initItemLayer, render } from './item.js';
import { nudgeSelected } from './transform.js';
import { enterCrop, cancelCrop, applyCrop, resetCrop, isCropping } from './crop.js';
import { exportPng } from './exporter.js';

const $ = (id) => document.getElementById(id);

const paperEl = $('paper');
const stageEl = $('stage');
const emptyHint = $('emptyHint');
const statusbar = $('statusbar');

const els = {
  paperSize: $('paperSize'),
  orientation: $('orientation'),
  dpi: $('dpi'),
  addImages: $('addImages'),
  fileInput: $('fileInput'),
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
  exportBtn: $('exportBtn'),
};

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

function resizePaper() {
  const aspect = aspectRatio(state.config.paperId, state.config.orientation);
  const availW = stageEl.clientWidth - 48;
  const availH = stageEl.clientHeight - 48;
  let w = availW;
  let h = w / aspect;
  if (h > availH) {
    h = availH;
    w = h * aspect;
  }
  paperEl.style.width = `${Math.floor(w)}px`;
  paperEl.style.height = `${Math.floor(h)}px`;
}

// ---------- Toolbar state ----------
function setCropUI(on) {
  els.cropActions.hidden = !on;
  els.itemControls.hidden = on;
  // Lock paper config while cropping to avoid geometry surprises.
  els.paperSize.disabled = on;
  els.orientation.disabled = on;
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

function status(msg) {
  statusbar.textContent = msg;
}

// ---------- Rendering ----------
subscribe(() => {
  render();
  emptyHint.style.display = state.items.length ? 'none' : '';
  updateToolbar();
});

// ---------- Image loading ----------
function loadFiles(fileList) {
  const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight;
      addItem(img, url, aspect);
      status(`Added ${file.name} (${img.naturalWidth}×${img.naturalHeight})`);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      status(`Could not load ${file.name}`);
    };
    img.src = url;
  }
}

// ---------- Wiring ----------
function wire() {
  els.addImages.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', (e) => {
    loadFiles(e.target.files);
    els.fileInput.value = ''; // allow re-selecting the same file
  });

  els.paperSize.addEventListener('change', () => {
    setConfig({ paperId: els.paperSize.value });
    resizePaper();
    render();
  });
  els.orientation.addEventListener('change', () => {
    setConfig({ orientation: els.orientation.value });
    resizePaper();
    render();
  });
  els.dpi.addEventListener('change', () => {
    setConfig({ dpi: Number(els.dpi.value) });
  });

  // Z-order
  els.toFront.addEventListener('click', () => runOnSelected(toFront));
  els.forward.addEventListener('click', () => runOnSelected(forward));
  els.backward.addEventListener('click', () => runOnSelected(backward));
  els.toBack.addEventListener('click', () => runOnSelected(toBack));
  els.deleteBtn.addEventListener('click', () => runOnSelected(removeItem));

  // Crop
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

  // Export
  els.exportBtn.addEventListener('click', () => {
    if (isCropping()) {
      status('Finish or cancel cropping before exporting.');
      return;
    }
    const { outW, outH, filename } = exportPng();
    status(`Exporting ${filename} at ${outW}×${outH}px…`);
  });

  // Deselect when clicking empty paper.
  paperEl.addEventListener('pointerdown', (e) => {
    if (e.target === paperEl && !isCropping()) select(null);
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(t.tagName)) return;

    if (e.key === 'Escape') {
      if (isCropping()) {
        cancelCrop();
        setCropUI(false);
      } else {
        select(null);
      }
      return;
    }
    if (isCropping()) return;

    if ((e.key === 'Delete' || e.key === 'Backspace') && getSelected()) {
      e.preventDefault();
      removeItem(getSelected().id);
    } else if (e.key.startsWith('Arrow') && getSelected()) {
      e.preventDefault();
      const step = e.shiftKey ? 0.02 : 0.004; // paper-width units
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
    if (isCropping()) return; // don't disturb an active crop
    resizePaper();
    render();
  });

  // Reload / close guard while there are unsaved edits.
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

function runOnSelected(fn) {
  const sel = getSelected();
  if (sel) fn(sel.id);
}

// ---------- Init ----------
populatePaperSizes();
initItemLayer(paperEl);
resizePaper();
wire();
render();
status('Ready. Pick a paper size and add images.');
