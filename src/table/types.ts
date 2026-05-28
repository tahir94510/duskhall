export interface CardState {
  id: string;
  defId: string;
  x: number;
  y: number;
  z: number;
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
