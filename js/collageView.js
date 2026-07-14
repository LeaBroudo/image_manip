// A CollageView owns the DOM for a single collage: a panel (header with title +
// per-collage Export/Delete buttons) and a .paper containing the image items, a
// boundary frame (drawn on top of images), and a selection overlay.

import { startMove, startScale, startRotate } from './transform.js';
import { select, setActiveCollage } from './state.js';

// Shared on-screen paper size (all collages share the global paper size).
let displayW = 0;
let displayH = 0;
export function setPaperDisplaySize(w, h) {
  displayW = w;
  displayH = h;
}

export class CollageView {
  constructor(collage, handlers) {
    this.collage = collage;
    this.handlers = handlers || {};
    this.elements = new Map(); // itemId -> { wrapper, img }
    this.selectedItem = null;
    this._build();
  }

  _build() {
    const panel = document.createElement('section');
    panel.className = 'collage-panel';
    panel.dataset.collageId = String(this.collage.id);

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    const title = document.createElement('span');
    title.className = 'panel-title';
    title.textContent = this.collage.name;
    const spacer = document.createElement('span');
    spacer.className = 'panel-spacer';
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'panel-export';
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', () => this.handlers.onExport?.(this.collage.id));
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'panel-delete';
    delBtn.title = 'Delete collage';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => this.handlers.onDelete?.(this.collage.id));
    header.append(title, spacer, exportBtn, delBtn);

    // Paper
    const paper = document.createElement('div');
    paper.className = 'paper';
    paper.dataset.collageId = String(this.collage.id);

    const frame = document.createElement('div');
    frame.className = 'paper-frame';

    const hint = document.createElement('p');
    hint.className = 'empty-hint';
    hint.textContent = 'Add or drop images here';

    const selectionEl = this._buildSelectionOverlay();

    paper.append(hint, frame, selectionEl);
    this.hintEl = hint;

    // Clicking empty paper (or its panel) selects/deselects & activates.
    paper.addEventListener('pointerdown', (e) => {
      setActiveCollage(this.collage.id);
      if (e.target === paper && !paper.querySelector('.item.cropping')) {
        select(this.collage.id, null);
      }
    });

    panel.append(header, paper);

    this.panel = panel;
    this.paperEl = paper;
    this.frameEl = frame;
    this.selectionEl = selectionEl;
    this.titleEl = title;
  }

  mount(container) {
    container.appendChild(this.panel);
  }

  destroy() {
    this.panel.remove();
    this.elements.clear();
  }

  // ---------- Geometry ----------
  paperMetrics() {
    return { w: this.paperEl.clientWidth, h: this.paperEl.clientHeight };
  }

  paperRect() {
    return this.paperEl.getBoundingClientRect();
  }

  cropAspect(item) {
    const cw = item.crop.w * item.naturalW;
    const ch = item.crop.h * item.naturalH;
    return cw / ch;
  }

  itemBox(item) {
    const { w: pw } = this.paperMetrics();
    const boxW = item.width * pw;
    const boxH = boxW / this.cropAspect(item);
    const centerX = item.cx * pw;
    const centerY = item.cy * pw;
    return { boxW, boxH, centerX, centerY, left: centerX - boxW / 2, top: centerY - boxH / 2 };
  }

  getWrapper(itemId) {
    const refs = this.elements.get(itemId);
    return refs ? refs.wrapper : null;
  }

  // ---------- Rendering ----------
  _buildElement(item) {
    const wrapper = document.createElement('div');
    wrapper.className = 'item';
    wrapper.dataset.id = String(item.id);

    const img = document.createElement('img');
    img.src = item.srcUrl;
    img.alt = '';
    wrapper.appendChild(img);

    wrapper.addEventListener('pointerdown', (e) => {
      if (wrapper.classList.contains('cropping')) return;
      e.preventDefault();
      setActiveCollage(this.collage.id);
      startMove(this, item, e);
    });

    this.paperEl.appendChild(wrapper);
    return { wrapper, img };
  }

  _applyLayout(item, refs) {
    const { boxW, boxH, left, top } = this.itemBox(item);
    const { wrapper, img } = refs;
    wrapper.style.width = `${boxW}px`;
    wrapper.style.height = `${boxH}px`;
    wrapper.style.left = `${left}px`;
    wrapper.style.top = `${top}px`;
    wrapper.style.transform = `rotate(${item.rotation}deg)`;

    const imgDisplayW = boxW / item.crop.w;
    const imgDisplayH = imgDisplayW * (item.naturalH / item.naturalW);
    img.style.width = `${imgDisplayW}px`;
    img.style.height = `${imgDisplayH}px`;
    img.style.left = `${-item.crop.x * imgDisplayW}px`;
    img.style.top = `${-item.crop.y * imgDisplayH}px`;
  }

  render(selectedItemId) {
    // Keep the paper at the shared display size.
    if (displayW) {
      this.paperEl.style.width = `${displayW}px`;
      this.paperEl.style.height = `${displayH}px`;
    }
    this.titleEl.textContent = this.collage.name;

    const items = this.collage.items;
    this.hintEl.style.display = items.length ? 'none' : '';

    // Remove DOM for items no longer in this collage.
    for (const [id, refs] of this.elements) {
      if (!items.some((it) => it.id === id)) {
        refs.wrapper.remove();
        this.elements.delete(id);
      }
    }

    this.selectedItem = null;
    items.forEach((item, index) => {
      let refs = this.elements.get(item.id);
      if (!refs) {
        refs = this._buildElement(item);
        this.elements.set(item.id, refs);
      }
      this._applyLayout(item, refs);
      refs.wrapper.style.zIndex = String(index + 1);
      const isSel = item.id === selectedItemId;
      refs.wrapper.classList.toggle('selected', isSel);
      if (isSel) this.selectedItem = item;
    });

    // Frame sits above images, below the selection handles.
    this.frameEl.style.zIndex = String(items.length + 5);
    this.updateSelectionOverlay(selectedItemId);
  }

  refreshItem(item) {
    const refs = this.elements.get(item.id);
    if (refs) this._applyLayout(item, refs);
    this.updateSelectionOverlay(this.selectedItem ? this.selectedItem.id : null);
  }

  // ---------- Selection overlay ----------
  _buildSelectionOverlay() {
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

    sel.addEventListener('pointerdown', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const role = target.dataset.role;
      if (!role || !this.selectedItem) return;
      e.preventDefault();
      e.stopPropagation();
      if (role === 'scale') startScale(this, this.selectedItem, e);
      else if (role === 'rotate') startRotate(this, this.selectedItem, e);
    });

    return sel;
  }

  updateSelectionOverlay(selectedItemId) {
    const sel = this.selectionEl;
    const item = selectedItemId != null ? this.collage.items.find((it) => it.id === selectedItemId) : null;
    const cropping = item && this.getWrapper(item.id)?.classList.contains('cropping');
    if (!item || cropping) {
      sel.hidden = true;
      return;
    }
    const { boxW, boxH, left, top } = this.itemBox(item);
    sel.hidden = false;
    sel.style.left = `${left}px`;
    sel.style.top = `${top}px`;
    sel.style.width = `${boxW}px`;
    sel.style.height = `${boxH}px`;
    sel.style.transform = `rotate(${item.rotation}deg)`;
    sel.style.zIndex = String(this.collage.items.length + 10);
  }

  setActive(on) {
    this.panel.classList.toggle('active', on);
  }
}
