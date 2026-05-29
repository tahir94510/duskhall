# Audio assets

**Just drop a file here — it works.** A build step scans this folder and
regenerates `manifest.json` automatically, so you never edit anything by hand.
Files that aren't present fall back to a synthesised placeholder tone (so the
game always has sound), and missing files never produce 404s.

Accepted formats: `.mp3`, `.ogg`, `.wav`, `.m4a`, `.aac` (any one per name).

| File name (any accepted ext) | When it plays |
| --- | --- |
| `flip` | A card is flipped (single or stack) |
| `pickup` | A card is grabbed |
| `place` | A card is dropped |
| `shuffle` | A stack is shuffled |
| `gather` | A stack is gathered |
| `snap` | A card snaps back from a rival zone |
| `ui-click` | A generic UI button click |
| `ui-open` | A modal opens |
| `ui-close` | A modal closes |
| `music` | Background loop (auto-loops) |

After adding files, run `npm run build` (or restart `npm run dev`) so the
manifest regenerates. On Vercel this happens automatically on every deploy.

## Mixing

- Keep individual SFX shorter than ~250 ms for a snappy feel.
- The runtime applies a master limiter and briefly ducks the music under each
  effect, so effects never get buried and nothing clips.
- In-game **Settings** has Master / Music / Effects sliders plus an
  **Auto-balance** button that resets a clean music-vs-effects mix.
