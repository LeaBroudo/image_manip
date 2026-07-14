// Registry mapping collage id -> CollageView, plus access to the shared drag
// layer. transform.js and crop.js resolve the right view through here.

const views = new Map();

export function setView(id, view) {
  views.set(id, view);
}

export function getView(id) {
  return views.get(id) || null;
}

export function deleteView(id) {
  views.delete(id);
}

export function allViews() {
  return [...views.values()];
}

// The full-viewport, fixed, pointer-events:none layer used to float an item
// while it is dragged (so it can travel above and across collage panels).
export function getDragLayer() {
  return document.getElementById('dragLayer');
}
