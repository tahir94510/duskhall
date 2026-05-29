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
  v: number;
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
