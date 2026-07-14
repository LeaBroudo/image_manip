# Collage Maker

A small, dependency-free browser app for building **print-ready photo collages**. Pick a
paper size, drop in images, freely move / scale / rotate / crop them, set the stacking
order, and export a **lossless PNG** at print resolution.

Live site: **https://leabroudo.github.io/image_manip/**

## Features

- **Multiple collages at once** — add as many collages as you like side by side, and drag
  images from one collage into another. Delete a collage (with a confirm prompt).
- **Paper sizes** — A3, A4, A5, US Letter, US Legal, with portrait/landscape toggle. Paper size,
  orientation, and DPI are shared across all collages.
- **Add images** from your computer (multiple at once), via the button or by dragging files onto
  a specific collage.
- **Free transform** — drag to move, corner handles to scale (aspect preserved), top handle
  to rotate (hold **Shift** to snap to 15°).
- **Non-destructive crop** — crop any image and **uncrop** later; the original is always kept.
- **Edge frame** — each collage shows a boundary frame on top of the images, so it's obvious where
  an image runs past the printable edge (only the part inside the frame is exported).
- **Stacking order** — bring to front / forward / backward / send to back.
- **Delete** — Delete/Backspace or the trash button.
- **Lossless export** — export a single collage or **all at once** (one PNG each), at
  150 / 300 / **600** DPI. Images are drawn straight from the originals (honoring crops), so there
  is no quality-reducing recompression.
- **Reload guard** — the browser warns before you reload/close with unsaved edits.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Arrow keys | Nudge selected image (Shift = larger step) |
| Delete / Backspace | Delete selected image |
| Esc | Deselect / cancel crop |

## Running locally

This is plain HTML/CSS/JavaScript (ES modules) — **no build step**. Because ES modules
require HTTP (not `file://`), serve the folder with any static server:

```sh
npx serve .
# or: python -m http.server 8000
```

Then open the printed URL (e.g. http://localhost:3000). Or use the VS Code **Live Server**
extension.

## Notes

- **Large exports:** A3 @ 600 DPI is ~7000 × 9900 px (~70 megapixels). Export can take a few
  seconds and use significant memory — this is inherent to that print resolution. Drop the
  DPI if you don't need it that high.
- The exported PNG uses a white background so transparent areas print white.

## Project layout

```
index.html          # entry; loads js/main.js as a module
css/style.css
js/
  papers.js         # paper size table + DPI/pixel math
  state.js          # collages, items, selection, dirty flag, z-order
  collageView.js    # per-collage DOM: paper, items, frame, selection overlay
  views.js          # collage-id -> view registry + drag layer
  transform.js      # move / scale / rotate (+ drag between collages)
  crop.js           # non-destructive crop editor
  exporter.js       # render to canvas + PNG download (single / all)
  main.js           # bootstrap + toolbar wiring
```
