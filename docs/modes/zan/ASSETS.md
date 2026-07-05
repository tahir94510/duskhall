# ZAN Asset Specs & Generation Prompts

Everything you need to create ZAN's look: the table surface, the card back, the four card fronts,
the brand mark, and the music. Drop the files into the paths below and the Vite plugin picks them
up automatically (zero manual manifest editing, zero 404s if a file is missing).

## Where files go

| Asset | Path | Format | Notes |
|-------|------|--------|-------|
| Card fronts | `public/modes/zan/cards/{raven,skull,moon,eye}.webp` | WebP | 640 × 928 px, under ~100 KB each |
| Card back | `public/modes/zan/cards/back.webp` | WebP | 640 × 928 px; shared by all cards |
| Table surface | `public/modes/zan/background/tableSurface.webp` | WebP | 2560 × 1440 px (16:9), under ~400 KB |
| Brand mark | `public/modes/zan/brand/icon.svg` (+ `icon-dark.svg`, `icon-light.svg`) | SVG | A clean ZAN sigil is shipped; replace to taste |
| Share image | `public/modes/zan/brand/og.png` | PNG | 1200 × 630 px; used for link previews |
| Music | `public/modes/zan/audio/music/*.mp3` | MP3 | Any names; played in order, then looped |

Sound effects are shared across all games (`public/audio/sfx/`). To give ZAN its own effects
later, drop overrides into `public/modes/zan/audio/sfx/` with the same file names.

## Art direction

Mystic, dark, and atmospheric, but never muddy. Deep obsidian and charcoal grounds with a single
cool accent (silver, or a faint violet), one clean bone-white symbol per card. High contrast,
readable at a glance, no clutter. The four fronts, the back, and the table must read as one set.

## Prompts (Midjourney / DALL-E style)

**Table surface**

> Top-down view of a dark card game table mat. Deep obsidian and charcoal-grey surface with a
> subtle matte texture, faint ethereal silver mist pooling at the edges, completely empty in the
> center. Minimalist premium dark-fantasy aesthetic, cinematic low-key lighting, ultra-high
> resolution, seamless, 16:9 aspect ratio.

**Card back (the same for every card)**

> Playing card back design. Deep pitch-black ground with a very subtle, elegant dark-silver
> geometric labyrinth pattern centered on the card. Clean sharp border, matte finish, highly
> symmetrical, atmospheric, premium tabletop asset, 2:3 aspect ratio.

**Card fronts (shared base, swap the subject line)**

> Playing card front, dark-fantasy style. Deep charcoal textured slate ground. Center: {SUBJECT},
> drawn in solid bone-white as a sharp, minimalist, highly readable vector-like icon. Clean sharp
> border, premium UI game asset, matte finish, 2:3 aspect ratio.

Swap `{SUBJECT}` with:

- **Raven**: `a sharp minimalist silhouette of a raven facing left`
- **Skull**: `a stylized minimalist human skull, front on`
- **Moon**: `an elegant sharp crescent moon`
- **Eye**: `a mystic minimalist open eye symbol`

**Brand mark / share image**

> A single mystic sigil for a bluffing card game called ZAN: an unblinking eye rendered in fine
> bone-white line-work, centered on a pitch-black ground with a faint silver glow. Minimalist,
> symmetrical, iconic, high contrast. For the share image, place it on a 1200 × 630 canvas with
> generous dark margins and the wordmark "ZAN" beneath it.

## Music, 20 dark-ambient loops (Suno)

All original, AI-generated from these prompts, so there is no third-party copyright to clear. Keep
every track beatless, vocal-less, calm, and non-intrusive: a background bed for a 10-15 minute
game, atmospheric without being depressing. Aim for a 60-90 second loopable piece each.

1. Dark ambient, deep-space void, very low sub-bass drone, subtle eerie wind, no drums, no vocals, continuous tabletop background, suspenseful, 60 bpm.
2. Minimalist cinematic tension, slow cello scraping very softly, pitch-black atmosphere, deep drones, mystery, no rhythm, pure ambiance.
3. Ethereal dark fantasy, distant whispering wind, extremely slow swelling synth, cold obsidian feel, background texture, non-intrusive, no beats.
4. Psychological thriller background, low hum, occasional subtle metallic chime far away, dark ambient, absolute focus, tension without jumpscares.
5. Void atmosphere, ancient stone-temple acoustics, subtle low-frequency rumble, mysterious, floating feeling, seamless loop, ambient.
6. Tension-building drone, very quiet, slow shifting chords in a minor scale, deep grey atmosphere, psychological suspense, no percussion.
7. Cinematic dark soundscape, slow-moving synth pads, feeling of paranoia, shadow and mist, completely beatless, background game music.
8. Abyssal depths, very dark ambient, slow morphing sound textures, cold and lonely, subtle high-frequency shimmer, entirely atmospheric.
9. Tabletop roleplay background, dark investigation, faint ticking clock slowed a thousandfold, deep bass swells, mysterious and calm but tense.
10. Eerie near-silence, very minimal drone, feeling of being watched, psychological tension, dark ambient, no instruments, just sound design.
11. Dark-magic ambiance, subtle magical hum, deep violet audio aesthetic, very slow distant strings, no rhythm, floating.
12. Suspenseful void, low-end rumble, a dark choir reduced to a blurred whisper, completely ambient, slow breathing rhythm, no drums.
13. Cold winter night in space, icy synth pads, very slow progression, feeling of isolation, perfect for bluffing games, subtle focus music.
14. A very slow, muffled heartbeat-like pulse under a deep dark drone, mysterious and hypnotic, background ambient.
15. Forgotten ruins, wind whistling gently through stones, a single low sustained cello note, no melody, pure atmospheric tension.
16. Surreal dark dreamscape, reversed sounds played very softly, deep bass tones, confusing and mysterious, no beat, tabletop background.
17. Monochromatic soundscape, grey-and-black audio feel, slow shifting white noise, deep sub-bass, entirely ambient and passive.
18. Shadowy figures, low-frequency vibration, very slow subtle synth sweep, tension, waiting for a decision, cinematic background music.
19. Pitch-black room, subtle breathing textures, dark ambient drone, no percussion, no vocals, high suspense, minimalist sound design.
20. The edge of the abyss, very quiet, low rumbling, occasional soft glass-like resonance in the distance, deeply atmospheric, focus and paranoia.
