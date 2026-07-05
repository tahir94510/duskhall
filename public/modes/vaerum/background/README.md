# Table background art

**Drop one image here to set the backdrop, and it works.** A build step scans
this folder and regenerates `manifest.json` automatically, so you never edit it
by hand. The image is painted full-bleed and fixed behind everything, so it
covers the whole screen at every seat with no black bars. It does not rotate with
the board; a thin scrim above it keeps cards legible.

This folder is intentionally separate from `public/modes/vaerum/cards/` (the card front art)
and from the card back, so the backdrop never gets mixed up with a card image.
When this folder is empty an elegant built-in gradient backdrop is used and no
request is made, so a fresh checkout shows zero 404s.

Accepted formats: `.webp`, `.png`, `.jpg`, `.svg`, `.avif`.

After adding a file, run `npm run build` (or restart `npm run dev`) so the
manifest regenerates. On Vercel this happens automatically on every deploy.

## Specification

- **Only the first image is used.** If you drop several, the first entry in the
  generated manifest becomes the active surface; keep a single file to be sure.
- **Aspect ratio**: the board area is close to square but resizes with the
  window. Use a large, roughly square image; it is scaled with `cover`, so the
  centre is always shown and the edges may be cropped on extreme shapes.
- **Recommended size**: at least **1600 × 1600 px**, exported as WebP (lossy,
  q≈82) to keep the file small while staying crisp on large screens.
- **Orientation**: the backdrop is fixed and does NOT rotate per seat, so normal
  upright art is fine. Aim for full-screen coverage; with `cover` the centre is
  always shown and the edges may crop on extreme window shapes.
- **Contrast**: cards sit on top of the backdrop, so prefer a calm, mid-to-dark
  image. A scrim already darkens the edges, but very bright or busy art still
  reduces card legibility.

## How it loads

`src/table/Background.ts` reads `manifest.json` once, preloads the first image,
then fades it onto the full-bleed fixed `.app-bg` layer. If the image fails to
load, the built-in gradient backdrop stays in place and nothing is logged.
