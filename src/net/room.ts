const ROOM_PARAM = "r";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomSlug(): string {
  const out: string[] = ["KBL"];
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  let chunk = "";
  for (let i = 0; i < 6; i++) {
    chunk += ALPHABET[arr[i]! % ALPHABET.length];
  }
  out.push(chunk);
  return out.join("-");
}

export function getOrCreateRoom(): string {
  const url = new URL(window.location.href);
  let slug = url.searchParams.get(ROOM_PARAM);
  if (!slug || !/^KBL-[A-Z2-9]{6}$/.test(slug)) {
    slug = makeRoomSlug();
    url.searchParams.set(ROOM_PARAM, slug);
    history.replaceState({}, "", url.toString());
  }
  return slug;
}

export function newRoom(): string {
  const slug = makeRoomSlug();
  const url = new URL(window.location.href);
  url.searchParams.set(ROOM_PARAM, slug);
  history.replaceState({}, "", url.toString());
  return slug;
}

export function inviteUrl(slug: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(ROOM_PARAM, slug);
  return url.toString();
}
