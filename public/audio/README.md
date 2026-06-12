# Audio assets

**Just drop a file in the right folder and it works.** A build step scans these
folders and regenerates `manifest.json` automatically, so you never edit
anything by hand. Missing sounds fall back to a synthesised placeholder tone
(the game always has sound) and never produce 404s.

Accepted formats: `.mp3`, `.ogg`, `.wav`, `.m4a`, `.aac`.

## Two folders: effects vs. music

```
public/audio/
  sfx/     ← effect sounds (file name MUST match a sound name below)
  music/   ← background music (any file name; tracks play in order, then loop)
```

### `sfx/`: effect sounds

The file name (without extension) must match one of these. Anything else is
ignored.

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
| `your-turn` | The Guide hands the turn to this player (local only) |

Example: `public/audio/sfx/flip.mp3`.

### `music/`: background music

Drop **any number** of tracks with **any names**: `public/audio/music/intro.mp3`,
`public/audio/music/theme.mp3`, … They play in natural-sorted order (so
`track2` comes before `track10`) and loop back to the first when the last
finishes. A single track loops itself seamlessly.

After adding files, run `npm run build` (or restart `npm run dev`) so the
manifest regenerates. On Vercel this happens automatically on every deploy.

> Backwards compatibility: flat files dropped straight into `public/audio/`
> (e.g. `flip.mp3`, `music.mp3`, `music1.mp3`) are still recognised, but the
> `sfx/` and `music/` folders are the recommended layout.

## Mixing & quality

- Keep individual SFX shorter than ~250 ms for a snappy feel.
- The runtime applies a master limiter and briefly ducks the music under each
  effect, so effects never get buried and nothing clips.
- Rapid repeats of the same effect are debounced (~45 ms) so they never stack
  into a harsh doubled blast, and a global voice cap fades the oldest sound out
  gracefully rather than cutting it, so there are no clicks or chopped audio.
- In-game **Settings** has Master / Music / Effects sliders plus an
  **Auto-balance** button that resets a clean music-vs-effects mix.
