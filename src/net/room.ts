import { isModeId, DEFAULT_MODE_ID } from "../modes/registry.js";
import { getActiveModeId, readStoredModeId } from "../modes/active.js";

const SLUG_LEN = 6;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SLUG_RE = /^[A-Z0-9]{6}$/;

// URL scheme: /{mode}/{SLUG}. The mode segment is a registered mode id (lowercase, e.g.
// "zan"/"vaerum"); the slug is a 6-char room code (uppercase A-Z + 2-9, no confusables). The
// two never collide: mode ids are lowercase words, slugs are the fixed uppercase alphabet, and
// the mode segment is always parsed first. A legacy bare /{SLUG} link (pre-multimode) is a
// Vaerum room and is redirected to /vaerum/{SLUG}.

export function makeSlug(): string {
  const arr = new Uint8Array(SLUG_LEN);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < SLUG_LEN; i++) {
    out += ALPHABET[arr[i]! % ALPHABET.length];
  }
  return out;
}

function pathSegments(pathname: string): string[] {
  return pathname.split("/").map((s) => s.trim()).filter(Boolean);
}

function legacySlugFromQuery(url: URL): string | null {
  const legacy = url.searchParams.get("r");
  if (legacy) {
    const cleaned = legacy.replace(/^KBL-/i, "").toUpperCase();
    if (SLUG_RE.test(cleaned)) return cleaned;
  }
  return null;
}

export interface ResolvedLocation {
  /** The active mode id to boot into. */
  mode: string;
  /** The room slug to join, or null to open a fresh room. */
  slug: string | null;
  /** When set, the caller must window.location.replace() here instead of booting. */
  redirect: string | null;
}

// Resolve the mode + room from the current address. This is the single entry point boot uses to
// decide which game to open and which room to join, and to migrate legacy links.
export function resolveLocation(): ResolvedLocation {
  const url = new URL(window.location.href);
  const segs = pathSegments(url.pathname);
  const seg0 = segs[0] ?? "";
  const seg1 = segs[1] ?? "";

  // /{mode} or /{mode}/{slug}
  if (isModeId(seg0)) {
    const slugCandidate = seg1.toUpperCase();
    const slug = SLUG_RE.test(slugCandidate) ? slugCandidate : null;
    // A mode path with a trailing segment that is not a valid slug is a broken link.
    if (seg1 && !slug) return { mode: seg0, slug: null, redirect: "/404.html" };
    return { mode: seg0, slug, redirect: null };
  }

  // Legacy bare /{SLUG}: a pre-multimode Vaerum room link. Send it to /vaerum/{SLUG}.
  const bareSlug = seg0.toUpperCase();
  if (segs.length === 1 && SLUG_RE.test(bareSlug)) {
    return { mode: "vaerum", slug: bareSlug, redirect: `/vaerum/${bareSlug}` };
  }

  // Legacy ?r= query link: also a Vaerum room.
  const q = legacySlugFromQuery(url);
  if (q) return { mode: "vaerum", slug: q, redirect: `/vaerum/${q}` };

  // Root "/": open the remembered (or default) mode with a fresh room.
  if (segs.length === 0) {
    return { mode: readStoredModeId(), slug: null, redirect: null };
  }

  // Anything else is a broken link.
  return { mode: DEFAULT_MODE_ID, slug: null, redirect: "/404.html" };
}

// Write the canonical /{mode}/{slug} path without a navigation. Defaults to the active mode.
export function writeLocation(slug: string, mode = getActiveModeId()): void {
  const url = new URL(window.location.href);
  url.pathname = `/${mode}/${slug}`;
  url.searchParams.delete("r");
  history.replaceState({}, "", url.pathname + url.search);
}

// Ensure a room for the active mode: normalise an existing slug into the URL, or mint a new one.
export function ensureRoom(slug: string | null): string {
  const s = (slug ?? "").toUpperCase();
  if (SLUG_RE.test(s)) {
    writeLocation(s);
    return s;
  }
  const fresh = makeSlug();
  writeLocation(fresh);
  return fresh;
}

export function newRoom(): string {
  const slug = makeSlug();
  writeLocation(slug);
  return slug;
}

// Switch the URL to an explicit room code in the active mode (used by "join by code"). Returns
// the normalised slug, or null if the code is not a valid 6-char room code.
export function setRoomSlug(slug: string): string | null {
  const s = slug.trim().toUpperCase();
  if (!SLUG_RE.test(s)) return null;
  writeLocation(s);
  return s;
}

export function inviteUrl(slug: string, mode = getActiveModeId()): string {
  const origin = window.location.origin;
  return `${origin}/${mode}/${slug}`;
}

// Accept anything a user might paste and extract a valid room code from it:
//  - a bare 6-char code ("P86B3T"), case/space tolerant
//  - a full invite link ("https://host/vaerum/P86B3T" or a legacy "https://host/P86B3T")
//  - a legacy query link ("https://host/?r=KBL-P86B3T" or "?r=P86B3T")
// Returns the normalised uppercase slug, or null if no valid code is found. The room's MODE is
// not returned here: join-by-code joins within the current game. To open a different game, the
// player follows the full /{mode}/{slug} link, which resolveLocation handles.
export function parseRoomInput(text: string): string | null {
  if (!text) return null;
  const raw = text.trim();

  // Bare code (optionally with surrounding whitespace/quotes).
  const bare = raw.replace(/['"]/g, "").trim().toUpperCase();
  if (SLUG_RE.test(bare)) return bare;

  // Try to parse it as a URL and read the LAST path segment (the slug), skipping a leading mode
  // segment, or the ?r= query, just like the address bar. Taking the last segment is what stops
  // a 6-letter mode word like "vaerum" from being misread as the room code.
  try {
    const url = new URL(raw);
    const segs = pathSegments(url.pathname);
    const last = (segs[segs.length - 1] ?? "").toUpperCase();
    if (SLUG_RE.test(last)) return last;
    const legacy = legacySlugFromQuery(url);
    if (legacy) return legacy;
  } catch {
    /* not a URL, fall through to a loose scan */
  }

  // Last resort: scan for a STANDALONE 6-char code in the string, tolerating a "KBL-" prefix
  // from old links. The token must be bounded by a non-alphanumeric (or the string ends), so a
  // longer run like "MYLONGUSERNAME" is rejected rather than silently truncated.
  const m = raw.toUpperCase().match(/(?:^|[^A-Z0-9])(?:KBL-)?([A-Z0-9]{6})(?![A-Z0-9])/);
  if (m && SLUG_RE.test(m[1]!)) return m[1]!;
  return null;
}
