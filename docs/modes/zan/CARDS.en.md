# ZAN Card Reference (4 faces, 40 cards)

ZAN has four suits, ten copies each, for 40 cards total. The suits have no rank and no powers.
Names and flavor mirror `public/locales/modes/zan.en.json` (`cards.*`); art lives in
`public/modes/zan/cards/<id>.<ext>`.

| id | Name | Copies | Flavor |
|----|------|-------:|--------|
| `raven` | Raven | 10 | It waits on the black branch, counting the lies as they pass. |
| `skull` | Skull | 10 | What is left of everyone who trusted the wrong claim. |
| `moon` | Moon | 10 | Cold light, just bright enough to make you doubt. |
| `eye` | Eye | 10 | It never blinks, and it has already seen your tell. |

Card art convention: drop `raven.webp`, `skull.webp`, `moon.webp`, `eye.webp` into
`public/modes/zan/cards/`, and optionally `back.webp` for the shared card back (ZAN declares
`hasCardBackImage: true`). The Vite plugin regenerates the manifest; missing files fall back to a
placeholder face and the built-in CSS back, so a fresh checkout produces zero 404s.
