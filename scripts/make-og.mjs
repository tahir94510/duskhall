// Rasterize a designed SVG into the 1200x630 PNG that social scrapers need for link previews
// (they reject SVG). This is an OPTIONAL, manually-run tool: it is not part of `npm run build`
// and its dependency is not in package.json, so the build stays lean.
//
// Usage:
//   npm i -D @resvg/resvg-js            # one-time, only when you need to render an OG image
//   node scripts/make-og.mjs <input.svg> <output.png>
//
// Example:
//   node scripts/make-og.mjs public/modes/zan/brand/og.svg public/modes/zan/brand/og.png
//
// The SVG should be authored at 1200x630 (or any 40:21 ratio); it is fit to a 1200x630 canvas.

import { readFileSync, writeFileSync } from "node:fs";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("Usage: node scripts/make-og.mjs <input.svg> <output.png>");
  process.exit(1);
}

let Resvg;
try {
  ({ Resvg } = await import("@resvg/resvg-js"));
} catch {
  console.error("Missing dependency. Run:  npm i -D @resvg/resvg-js");
  process.exit(1);
}

const svg = readFileSync(input, "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 1200 },
  background: "#050505"
});
const png = resvg.render().asPng();
writeFileSync(output, png);
console.log(`Wrote ${output} (${png.length} bytes)`);
