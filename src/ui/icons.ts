// SVG icons. Clean, single-weight strokes, readable at 18 px.

export function svgEl(content: string, viewBox = "0 0 24 24"): string {
  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${content}</svg>`;
}

// Back face decoration: minimal rhombus echo.
export const BACK_SIGIL = svgEl(`
  <path d="M12 2 L20 12 L12 22 L4 12 Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M12 2 L12 22" stroke="currentColor" stroke-width="0.9" opacity=".8"/>
  <circle cx="12" cy="12" r="1.6" fill="currentColor"/>
`);

// UI icons (used by the header popover and modals)
export const ICON_MORE = svgEl(`<circle cx="6" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="18" cy="12" r="1.7" fill="currentColor"/>`);
export const ICON_RULES = svgEl(`<path d="M5 4 H16 L19 7 V20 H5 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 9 H16 M8 13 H16 M8 17 H13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`);
export const ICON_SUPPORT = svgEl(`<path d="M12 20.5 C 5 16, 4 12, 4 9 A 4 4 0 0 1 12 7 A 4 4 0 0 1 20 9 C 20 12, 19 16, 12 20.5 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`);
export const ICON_RESET = svgEl(`<path d="M5 12 A 7 7 0 1 1 12 19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M2 9 L5 12 L8 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
export const ICON_RESET_DECK = svgEl(`<rect x="5" y="4" width="11" height="15" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="8" y="6" width="11" height="15" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/><path d="M2 11 A 5 5 0 0 1 10 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2 8 V11 H5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`);
export const ICON_SETTINGS = svgEl(`<path d="M4 7 H20 M4 12 H20 M4 17 H20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="17" r="2" fill="currentColor"/>`);
export const ICON_SHORTCUTS = svgEl(`<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 9 A 3 3 0 1 1 12 13 V15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="18" r="0.6" fill="currentColor"/>`);
export const ICON_CLOSE = svgEl(`<path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);
export const ICON_COPY = svgEl(`<rect x="9" y="3" width="12" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 7 V19 A 2 2 0 0 0 7 21 H17" fill="none" stroke="currentColor" stroke-width="1.5"/>`);
export const ICON_TIMER = svgEl(`<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7 V13 L16 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 3 H15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
export const ICON_ROOM = svgEl(`<circle cx="9" cy="10" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11.4 11.6 L19 19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16.5 16.5 L18.5 14.5 M18 18 L20 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
export const ICON_JOIN = svgEl(`<path d="M13 4 H18 A2 2 0 0 1 20 6 V18 A2 2 0 0 1 18 20 H13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12 H14 M10 8 L14 12 L10 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
