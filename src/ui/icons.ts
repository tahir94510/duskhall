// SVG icons — clean, single-weight strokes, readable at 18px.

export function svgEl(content: string, viewBox = "0 0 24 24"): string {
  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${content}</svg>`;
}

// --- Category sigils (white-filled, simple) ---
const CAT_SEAL = svgEl(`<path d="M12 3 L20 8 L20 16 L12 21 L4 16 L4 8 Z" fill="currentColor" opacity=".95"/><circle cx="12" cy="12" r="3" fill="#000"/>`);
const CAT_SPELL = svgEl(`<path d="M14 2 L7 13 L11 13 L9 22 L17 11 L13 11 Z" fill="currentColor"/>`);
const CAT_INTERVENTION = svgEl(`<path d="M5 12 H19 M12 5 V19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`);
const CAT_SERVANT = svgEl(`<path d="M12 3 L20 7 V13 C20 17 16 20 12 21 C8 20 4 17 4 13 V7 Z" fill="currentColor"/>`);

// --- Name sigils (single-weight outline, no fine detail) ---
const NAME_TIMERIFT = svgEl(`<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 4 L13 11 L20 12 L13 13 L12 20 L11 13 L4 12 L11 11 Z" fill="currentColor"/>`);
const NAME_VEILOFVOID = svgEl(`<path d="M2 12 C 6 4, 18 4, 22 12 C 18 20, 6 20, 2 12 Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>`);
const NAME_CRIMSONMONOLITH = svgEl(`<path d="M9 3 L15 3 L15 21 L9 21 Z" fill="currentColor"/><path d="M3 21 H21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
const NAME_NECROMANCERSEYE = svgEl(`<path d="M2 12 C 5 6, 19 6, 22 12 C 19 18, 5 18, 2 12 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="#000"/>`);

const NAME_ETHERSTRIKE = svgEl(`<path d="M14 2 L5 14 L11 14 L10 22 L19 10 L13 10 Z" fill="currentColor"/>`);
const NAME_SHADOWTHEFT = svgEl(`<path d="M4 14 L10 4 L16 6 L13 12 L20 18 L4 14 Z" fill="currentColor"/>`);
const NAME_ANCIENTSIGHT = svgEl(`<path d="M12 3 L14.5 9 L21 10 L16 14.5 L17.5 21 L12 17.5 L6.5 21 L8 14.5 L3 10 L9.5 9 Z" fill="currentColor"/>`);
const NAME_MINDPARASITE = svgEl(`<circle cx="12" cy="9" r="5" fill="currentColor"/><path d="M9 13 C 8 18, 6 19, 4 20 M15 13 C 16 18, 18 19, 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
const NAME_TWISTOFFATE = svgEl(`<path d="M4 8 C 8 4, 16 4, 20 8 M20 16 C 16 20, 8 20, 4 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 5 L21 8 L18 11 M6 13 L3 16 L6 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);

const NAME_SILENCE = svgEl(`<path d="M5 9 H10 L16 4 V20 L10 15 H5 Z" fill="currentColor"/><path d="M18 8 L22 12 L18 16 M22 8 L18 12 L22 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>`);
const NAME_KARMICREFLECTION = svgEl(`<path d="M12 3 A 9 9 0 1 0 21 12" fill="none" stroke="currentColor" stroke-width="2"/><path d="M17 8 L21 12 L17 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
const NAME_BLOODATONEMENT = svgEl(`<path d="M12 3 C 16 9, 19 13, 19 16 A 7 7 0 0 1 5 16 C 5 13, 8 9, 12 3 Z" fill="currentColor"/>`);

const NAME_RUNICWARDEN = svgEl(`<path d="M12 3 L19 6 V12 C 19 16, 16 19, 12 21 C 8 19, 5 16, 5 12 V6 Z" fill="currentColor"/><path d="M9 11 H15 M9 14 H15" stroke="#000" stroke-width="1.4"/>`);
const NAME_GLACIALABERRATION = svgEl(`<path d="M12 2 V22 M3 12 H21 M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>`);
const NAME_SHADOWSLAYER = svgEl(`<path d="M5 3 L9 7 L8 8 L14 14 L15 13 L19 17 L17 19 L13 15 L14 14 L8 8 L9 7 L5 3 Z" fill="currentColor"/>`);

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

// Back face decoration: kept very plain, simply a vertical rhombus echo of the brand.
export const BACK_SIGIL = svgEl(`
  <path d="M12 2 L20 12 L12 22 L4 12 Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M12 2 L12 22" stroke="currentColor" stroke-width="0.9" opacity=".8"/>
  <circle cx="12" cy="12" r="1.6" fill="currentColor"/>
`);

// --- UI icons ---
export const ICON_RULES = svgEl(`<path d="M5 4 H16 L19 7 V20 H5 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 9 H16 M8 13 H16 M8 17 H13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`);
export const ICON_SUPPORT = svgEl(`<path d="M12 20.5 C 5 16, 4 12, 4 9 A 4 4 0 0 1 12 7 A 4 4 0 0 1 20 9 C 20 12, 19 16, 12 20.5 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`);
export const ICON_RESET = svgEl(`<path d="M5 12 A 7 7 0 1 1 12 19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M2 9 L5 12 L8 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
export const ICON_SETTINGS = svgEl(`<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3 V5 M12 19 V21 M3 12 H5 M19 12 H21 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M5.6 18.4 L7 17 M17 7 L18.4 5.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
export const ICON_CLOSE = svgEl(`<path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);
export const ICON_COPY = svgEl(`<rect x="9" y="3" width="12" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 7 V19 A 2 2 0 0 0 7 21 H17" fill="none" stroke="currentColor" stroke-width="1.5"/>`);
export const ICON_FLIP = svgEl(`<path d="M4 8 A 8 8 0 0 1 18 6 M20 16 A 8 8 0 0 1 6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 3 V7 H14 M6 21 V17 H10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`);
export const ICON_STACK_FLIP = svgEl(`<rect x="3" y="6" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="8" y="3" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".55"/><path d="M11 13 L13 15 L17 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
export const ICON_GATHER = svgEl(`<rect x="6" y="6" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 3 V6 M15 3 V6 M9 18 V21 M15 18 V21 M3 9 H6 M3 15 H6 M18 9 H21 M18 15 H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`);
export const ICON_MIX = svgEl(`<path d="M3 7 H7 L17 17 H21 M3 17 H7 L17 7 H21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M18 4 L21 7 L18 10 M18 14 L21 17 L18 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`);

// Wheel direction hints for the shortcuts panel
export const ICON_WHEEL_UP = svgEl(`<rect x="9" y="3" width="6" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 21 L12 18 L15 21" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7 V10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
export const ICON_WHEEL_DOWN = svgEl(`<rect x="9" y="3" width="6" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 21 L12 18 L15 21" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" transform="rotate(180 12 19.5)"/><path d="M12 6 V13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
