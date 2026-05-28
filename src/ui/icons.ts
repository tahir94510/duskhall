// Hand-drawn SVG icons. Each function returns an <svg> string; consumers set color via CSS currentColor.

export function svgEl(content: string, viewBox = "0 0 24 24", extraAttrs = ""): string {
  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ${extraAttrs}>${content}</svg>`;
}

// Category sigils
const CAT_SEAL = svgEl(`<path d="M12 2.5l7.5 4.3v8.4L12 19.5 4.5 15.2V6.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="11" r="3" fill="currentColor"/>`);
const CAT_SPELL = svgEl(`<path d="M5 19L15 5l3 3L8 22z" fill="currentColor" opacity=".15"/><path d="M5 19L15 5l3 3L8 22z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M17 3l1.4 1.4M20 6l1.4 1.4M14 1.5l.6 1.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`);
const CAT_INTERVENTION = svgEl(`<path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".55"/>`);
const CAT_SERVANT = svgEl(`<path d="M12 3l8 4v6c0 4.5-3.5 7.5-8 8-4.5-.5-8-3.5-8-8V7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2.2 2.2L15 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`);

// Seal name icons
const NAME_TIMERIFT = svgEl(`<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M12 4l3 8-3 8-3-8z" fill="currentColor" opacity=".2"/><path d="M12 4l3 8-3 8-3-8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>`);
const NAME_VEILOFVOID = svgEl(`<path d="M3 12c4-7 14-7 18 0-4 7-14 7-18 0z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="4" fill="currentColor" opacity=".22"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/>`);
const NAME_CRIMSONMONOLITH = svgEl(`<rect x="9" y="3" width="6" height="18" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 8h6M9 13h6M9 18h6" stroke="currentColor" stroke-width="1.2" opacity=".7"/><path d="M3 22h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
const NAME_NECROMANCERSEYE = svgEl(`<path d="M2 12c4-6 16-6 20 0-4 6-16 6-20 0z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="3.4" fill="currentColor" opacity=".25"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1" fill="currentColor"/>`);

// Spell name icons
const NAME_ETHERSTRIKE = svgEl(`<path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="currentColor" opacity=".22"/><path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`);
const NAME_SHADOWTHEFT = svgEl(`<path d="M4 13l5-9 6 3-3 6 5 7-13-7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="9" cy="8" r="1.2" fill="currentColor"/>`);
const NAME_ANCIENTSIGHT = svgEl(`<path d="M12 3l2.5 5.3 5.5.8-4 4 1 5.6L12 16l-5 2.7 1-5.6-4-4 5.5-.8z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="11" r="1.2" fill="currentColor"/>`);
const NAME_MINDPARASITE = svgEl(`<circle cx="12" cy="9" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 14c-1 4-3 5-5 6M15 14c1 4 3 5 5 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9 9c0 1 .8 2 1.5 2.5M15 9c0 1-.8 2-1.5 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`);
const NAME_TWISTOFFATE = svgEl(`<path d="M4 8c4-4 12-4 16 0M20 16c-4 4-12 4-16 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 6l2 2-2 2M6 18l-2-2 2-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`);

// Intervention name icons
const NAME_SILENCE = svgEl(`<path d="M5 14V10l5-1 6-4v14l-6-4z" fill="currentColor" opacity=".2"/><path d="M5 14V10l5-1 6-4v14l-6-4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M18 8l4 8M22 8l-4 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
const NAME_KARMICREFLECTION = svgEl(`<path d="M12 2a10 10 0 1 0 7 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19 12l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`);
const NAME_BLOODATONEMENT = svgEl(`<path d="M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z" fill="currentColor" opacity=".2"/><path d="M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`);

// Servant name icons
const NAME_RUNICWARDEN = svgEl(`<rect x="6" y="3" width="12" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 8h6M9 12h6M9 16h6" stroke="currentColor" stroke-width="1.2"/>`);
const NAME_GLACIALABERRATION = svgEl(`<path d="M12 2v20M3 12h18M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="12" r="2" fill="currentColor"/>`);
const NAME_SHADOWSLAYER = svgEl(`<path d="M5 3l5 5-1 1 4 4 1-1 5 5-2 2-5-5 1-1-4-4-1 1-5-5z" fill="currentColor" opacity=".22"/><path d="M5 3l5 5-1 1 4 4 1-1 5 5-2 2-5-5 1-1-4-4-1 1-5-5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>`);

const REGISTRY: Record<string, string> = {
  "cat-seal": CAT_SEAL,
  "cat-spell": CAT_SPELL,
  "cat-intervention": CAT_INTERVENTION,
  "cat-servant": CAT_SERVANT,
  "name-timeRift": NAME_TIMERIFT,
  "name-veilOfVoid": NAME_VEILOFVOID,
  "name-crimsonMonolith": NAME_CRIMSONMONOLITH,
  "name-necromancersEye": NAME_NECROMANCERSEYE,
  "name-etherStrike": NAME_ETHERSTRIKE,
  "name-shadowTheft": NAME_SHADOWTHEFT,
  "name-ancientSight": NAME_ANCIENTSIGHT,
  "name-mindParasite": NAME_MINDPARASITE,
  "name-twistOfFate": NAME_TWISTOFFATE,
  "name-silence": NAME_SILENCE,
  "name-karmicReflection": NAME_KARMICREFLECTION,
  "name-bloodAtonement": NAME_BLOODATONEMENT,
  "name-runicWarden": NAME_RUNICWARDEN,
  "name-glacialAberration": NAME_GLACIALABERRATION,
  "name-shadowSlayer": NAME_SHADOWSLAYER
};

export function getIcon(id: string): string {
  return REGISTRY[id] || "";
}

// Decorative back sigil for card backs
export const BACK_SIGIL = svgEl(`
  <defs>
    <radialGradient id="g1" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="currentColor" stop-opacity=".25"/>
      <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="12" cy="12" r="10" fill="url(#g1)"/>
  <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width=".8" opacity=".7"/>
  <path d="M12 3l5 9-5 9-5-9z" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
  <path d="M3 12l9-5 9 5-9 5z" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
  <circle cx="12" cy="12" r="1.2" fill="currentColor"/>
`);

// UI icons
export const ICON_RULES = svgEl(`<path d="M5 4h11l3 3v13H5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`);
export const ICON_SUPPORT = svgEl(`<path d="M12 21s-7-4.4-7-10a4.5 4.5 0 0 1 7-3.6A4.5 4.5 0 0 1 19 11c0 5.6-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`);
export const ICON_LEAVE = svgEl(`<path d="M14 4h5v16h-5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 8l-4 4 4 4M6 12h9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
export const ICON_CLOSE = svgEl(`<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);
export const ICON_COPY = svgEl(`<rect x="9" y="3" width="12" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 7v12a2 2 0 0 0 2 2h10" fill="none" stroke="currentColor" stroke-width="1.5"/>`);
export const ICON_FLIP = svgEl(`<path d="M4 8a8 8 0 0 1 14-2M20 16a8 8 0 0 1-14 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 3v4h-4M6 21v-4h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`);
export const ICON_GATHER = svgEl(`<rect x="6" y="6" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`);
export const ICON_MIX = svgEl(`<path d="M3 7h4l10 10h4M3 17h4l10-10h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`);
export const ICON_OPEN = svgEl(`<path d="M3 12c3-4 6-7 9-7s6 3 9 7c-3 4-6 7-9 7s-6-3-9-7z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="currentColor" opacity=".3"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>`);
export const ICON_CLOSED = svgEl(`<path d="M3 12c3-4 6-7 9-7s6 3 9 7c-3 4-6 7-9 7s-6-3-9-7z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
export const ICON_LANG = svgEl(`<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 12h18M12 3c3 3 4.5 6.5 4.5 9S15 21 12 21s-4.5-2.5-4.5-9S9 6 12 3z" fill="none" stroke="currentColor" stroke-width="1.3"/>`);
