const SLUG_LEN = 6;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SLUG_RE = /^[A-Z0-9]{6}$/;

export function makeSlug(): string {
  const arr = new Uint8Array(SLUG_LEN);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < SLUG_LEN; i++) {
    out += ALPHABET[arr[i]! % ALPHABET.length];
  }
  return out;
}

function readSlugFromUrl(): string | null {
  const url = new URL(window.location.href);
  // Tolerate leading/trailing slashes so "/P86B3T/" still resolves.
  const fromPath = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "").toUpperCase();
  if (SLUG_RE.test(fromPath)) return fromPath;
  // Legacy ?r=KBL-XXXXXX support
  const legacy = url.searchParams.get("r");
  if (legacy) {
    const cleaned = legacy.replace(/^KBL-/i, "").toUpperCase();
    if (SLUG_RE.test(cleaned)) return cleaned;
  }
  return null;
}

// A non-empty URL PATH that does not resolve to a valid room code is a broken link
// (e.g. "/abc!!" or a half-copied invite). The root "/" is fine (it opens a new room),
// and a legacy "?r=" query is handled leniently. Used to send broken links to the 404
// page instead of silently opening an unrelated fresh room.
function hasMalformedPath(): boolean {
  const url = new URL(window.location.href);
  const path = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!path) return false;                 // root → new room, not an error
  if (SLUG_RE.test(path.toUpperCase())) return false; // valid slug
  if (url.searchParams.get("r")) return false;        // legacy query link, be lenient
  return true;
}

function writeSlugToUrl(slug: string): void {
  const url = new URL(window.location.href);
  url.pathname = `/${slug}`;
  url.searchParams.delete("r");
  history.replaceState({}, "", url.pathname + url.search);
}

export function getOrCreateRoom(): string {
  const existing = readSlugFromUrl();
  if (existing) {
    writeSlugToUrl(existing); // normalize legacy URL
    return existing;
  }
  // A broken room link (non-empty path that isn't a valid code) goes to the 404 page
  // rather than quietly dropping the player into an unrelated new room.
  if (hasMalformedPath()) {
    window.location.replace("/404.html");
    return "";
  }
  const slug = makeSlug();
  writeSlugToUrl(slug);
  return slug;
}

export function newRoom(): string {
  const slug = makeSlug();
  writeSlugToUrl(slug);
  return slug;
}

// Switch the URL to an explicit room code (used by "join by code"). Returns the
// normalised slug, or null if the code is not a valid 6-char room code.
export function setRoomSlug(slug: string): string | null {
  const s = slug.trim().toUpperCase();
  if (!SLUG_RE.test(s)) return null;
  writeSlugToUrl(s);
  return s;
}

export function inviteUrl(slug: string): string {
  const origin = window.location.origin;
  return `${origin}/${slug}`;
}

// Accept anything a user might paste and extract a valid room code from it:
//  - a bare 6-char code ("P86B3T"), case/space tolerant
//  - a full invite link ("https://host/P86B3T")
//  - a legacy query link ("https://host/?r=KBL-P86B3T" or "?r=P86B3T")
// Returns the normalised uppercase slug, or null if no valid code is found.
export function parseRoomInput(text: string): string | null {
  if (!text) return null;
  const raw = text.trim();

  // Bare code (optionally with surrounding whitespace/quotes).
  const bare = raw.replace(/['"]/g, "").trim().toUpperCase();
  if (SLUG_RE.test(bare)) return bare;

  // Try to parse it as a URL and read the path / ?r= just like the address bar.
  try {
    const url = new URL(raw);
    // Tolerate leading/trailing slashes so ".../P86B3T/" resolves from the path
    // (matching readSlugFromUrl) instead of falling through to the loose scan,
    // which could otherwise pick a 6-letter token out of the hostname.
    const fromPath = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "").toUpperCase();
    if (SLUG_RE.test(fromPath)) return fromPath;
    const legacy = url.searchParams.get("r");
    if (legacy) {
      const cleaned = legacy.replace(/^KBL-/i, "").toUpperCase();
      if (SLUG_RE.test(cleaned)) return cleaned;
    }
  } catch {
    /* not a URL — fall through to a loose scan */
  }

  // Last resort: scan for a STANDALONE 6-char code in the string, tolerating a
  // "KBL-" prefix from old links. The token must be bounded by a non-alphanumeric
  // (or the string ends), so a longer run like "MYLONGUSERNAME" is rejected rather
  // than silently truncated to its first six characters ("MYLONG") — which would
  // light the Join button and drop the player into an unrelated/garbage room.
  const m = raw.toUpperCase().match(/(?:^|[^A-Z0-9])(?:KBL-)?([A-Z0-9]{6})(?![A-Z0-9])/);
  if (m && SLUG_RE.test(m[1]!)) return m[1]!;
  return null;
}
