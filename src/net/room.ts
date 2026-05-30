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
  const fromPath = url.pathname.replace(/^\//, "").toUpperCase();
  if (SLUG_RE.test(fromPath)) return fromPath;
  // Legacy ?r=KBL-XXXXXX support
  const legacy = url.searchParams.get("r");
  if (legacy) {
    const cleaned = legacy.replace(/^KBL-/i, "").toUpperCase();
    if (SLUG_RE.test(cleaned)) return cleaned;
  }
  return null;
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
