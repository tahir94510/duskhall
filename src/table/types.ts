export interface CardState {
  id: string;
  defId: string;
  x: number;
  y: number;
  z: number;
  // Cumulative quarter-turn count. Each Shift+scroll or rotate adds ±1; the
  // CSS rotation is `rot * 90deg`, so going past 270° continues forward to
  // 360° / 450° instead of snapping backwards through modulo.
  rot: number;
  faceUp: boolean;
  ownerSeat: number | null;
  // Last-write-wins logical stamp: wall-clock ms of the last edit to this card.
  // A patch is applied to a card only when its stamp is >= the local one, so a
  // late/out-of-order packet can never clobber a newer state. (Replaces the old
  // unused `v` field, which was set but never compared.)
  ts: number;
}

export interface BoardState {
  cards: Map<string, CardState>;
  topZ: number;
}

export interface SelfPlayer {
  id: string;
  seat: number;
  color: string;
  name: string;
}
