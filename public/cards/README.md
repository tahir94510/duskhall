# Card front art

**Just drop one image per card here and it works.** A build step scans this
folder and regenerates `manifest.json` automatically (no manual editing). Name
the file with the card's `defId` and any accepted extension; the runtime loads
it on the card's front face. Cards with no image show a clean blank front, and
missing files never produce 404s.

Accepted formats: `.webp`, `.png`, `.jpg`, `.svg`, `.avif`.

After adding files, run `npm run build` (or restart `npm run dev`) so the
manifest regenerates. On Vercel this happens automatically on every deploy.

## Specification

- **Aspect ratio**: 1 : 1.45 (vertical). The runtime card frame uses this exact ratio.
- **Recommended size**: **640 × 928 px** (WebP, lossy, q=85), which keeps each file under ~100 KB.
- **Bleed**: design to the edges; the front face is clipped to the card's 8 px corner radius.
- **No transparency**: the back of the card is shown when the card is face-down, so the front art does not need transparency. Solid background recommended.
- **Naming**: lowercase `defId`. The full list is below.
- **Type colour cue**: optional. If you keep a coloured edge or sigil corner matching the category, prefer the canonical hue (Seal violet `#5b3f99`, Spell crimson `#a23a3f`, Intervention azure `#2e6396`, Servant verdant `#347459`). The rulebook explains the category palette so players still learn it.

## defId list (15 cards)

| File name (any allowed ext) | Card |
| --- | --- |
| `timeRift.webp` | Time Rift / Zaman Çatlağı (Seal) |
| `veilOfVoid.webp` | Veil of Void / Hiçlik Örtüsü (Seal) |
| `crimsonMonolith.webp` | Crimson Monolith / Kızıl Monolit (Seal) |
| `necromancersEye.webp` | Necromancer's Eye / Ölüçağıranın Gözü (Seal) |
| `etherStrike.webp` | Ether Strike / Eterik Çarpma (Spell) |
| `shadowTheft.webp` | Shadow Theft / Gölge Hırsızlığı (Spell) |
| `ancientSight.webp` | Ancient Sight / Kadim Görü (Spell) |
| `mindParasite.webp` | Mind Parasite / Zihin Paraziti (Spell) |
| `twistOfFate.webp` | Twist of Fate / Kaderin Cilvesi (Spell) |
| `silence.webp` | Silence! / Sustur! (Intervention) |
| `karmicReflection.webp` | Karmic Reflection / Karmik Yansıma (Intervention) |
| `bloodAtonement.webp` | Blood Atonement / Kan Kefareti (Intervention) |
| `runicWarden.webp` | Runic Warden / Rünik Bekçi (Servant) |
| `glacialAberration.webp` | Glacial Aberration / Buzul Ucube (Servant) |
| `shadowSlayer.webp` | Shadow Slayer / Gölge Katili (Servant) |

## Performance

The runtime loads each card art on demand and caches the resolved URL in memory. Browser cache headers from Vercel (`Cache-Control: public, max-age=31536000, immutable`) keep repeat loads instant.
