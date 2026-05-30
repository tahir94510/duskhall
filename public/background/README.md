# Table background art

**Drop one image here to set the table surface, and it works.** A build step
scans this folder and regenerates `manifest.json` automatically, so you never
edit it by hand. The image is painted on the rotating board, so it acts as the
shared table felt: every seat sees the same surface, simply turned to match
their own viewpoint.

This folder is intentionally separate from `public/cards/` (the card front art)
and from the card back, so the table surface never gets mixed up with a card
image. When this folder is empty the board keeps its default noble dark surface
and no request is made, so a fresh checkout shows zero 404s.

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
- **Composition**: keep important detail near the centre. The four seats rotate
  the board by 0°, 90°, 180°, and 270°, so a surface that reads well from any
  side (a texture, a vignette, a centred emblem) works best. Strong directional
  text or art will appear upside down or sideways for some seats.
- **Contrast**: cards sit on top of this surface, so prefer a calm, mid-to-dark
  background. Very bright or busy art reduces card legibility.

## How it loads

`src/table/Background.ts` reads `manifest.json` once, preloads the first image,
then fades it onto the `.board__bg` layer inside the rotating board. If the
image fails to load, the default surface stays in place and nothing is logged.
