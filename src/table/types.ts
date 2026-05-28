export interface CardState {
  id: string;
  defId: string;
  x: number;
  y: number;
  z: number;
  rot: 0 | 1 | 2 | 3;
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
