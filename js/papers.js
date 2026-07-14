// Paper size definitions and DPI/pixel math.
// All dimensions are in millimetres, portrait orientation (width < height).

export const MM_PER_INCH = 25.4;

export const PAPER_SIZES = [
  { id: 'a3', label: 'A3 (297 × 420 mm)', w: 297, h: 420 },
  { id: 'a4', label: 'A4 (210 × 297 mm)', w: 210, h: 297 },
  { id: 'a5', label: 'A5 (148 × 210 mm)', w: 148, h: 210 },
  { id: 'letter', label: 'US Letter (8.5 × 11 in)', w: 215.9, h: 279.4 },
  { id: 'legal', label: 'US Legal (8.5 × 14 in)', w: 215.9, h: 355.6 },
];

export const DEFAULT_PAPER_ID = 'letter';
export const DEFAULT_DPI = 600;

export function getPaper(id) {
  return PAPER_SIZES.find((p) => p.id === id) || PAPER_SIZES[1];
}

// Returns paper dimensions in mm, taking orientation into account.
export function paperMm(paperId, orientation) {
  const p = getPaper(paperId);
  if (orientation === 'landscape') {
    return { w: p.h, h: p.w };
  }
  return { w: p.w, h: p.h };
}

export function aspectRatio(paperId, orientation) {
  const { w, h } = paperMm(paperId, orientation);
  return w / h;
}

// Export pixel dimensions for the given paper/orientation/DPI.
export function exportPx(paperId, orientation, dpi) {
  const { w, h } = paperMm(paperId, orientation);
  return {
    w: Math.round((w / MM_PER_INCH) * dpi),
    h: Math.round((h / MM_PER_INCH) * dpi),
  };
}
