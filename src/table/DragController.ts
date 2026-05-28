import type { BoardState } from "./types.js";

export interface DragHooks {
  getSelfSeat(): number;
  isOpponentZone(seat: number): boolean;
  zoneRectForSeat(seat: number): DOMRect | null;
  pointInSelfZone(x: number, y: number): boolean;
  pointInOpponentZone(x: number, y: number): number | null;
  pickStack(centerId: string): string[];
  onCardMoved(ids: string[]): void;
  onCardFlipped(id: string): void;
  setOwnerSeat(id: string, seat: number | null): void;
  showContextBar(id: string, x: number, y: number): void;
  hideContextBar(): void;
  emitCursor(x: number, y: number): void;
}

const DRAG_THRESHOLD = 4;
const LONG_PRESS_MS = 280;

interface DragSession {
  pointerId: number;
  ids: string[];
  startClientX: number;
  startClientY: number;
  origin: Map<string, { x: number; y: number }>;
  dragging: boolean;
  rightButton: boolean;
  longPressTimer: number;
  startedAt: number;
}

export class DragController {
  private session: DragSession | null = null;
  constructor(
    private readonly host: HTMLElement,
    private readonly state: BoardState,
    private readonly hooks: DragHooks
  ) {
    this.bindEvents();
  }

  private bindEvents(): void {
    this.host.addEventListener("pointerdown", this.onPointerDown, { passive: false });
    this.host.addEventListener("pointermove", this.onPointerMoveAlways, { passive: true });
    window.addEventListener("pointermove", this.onPointerMove, { passive: false });
    window.addEventListener("pointerup", this.onPointerUp, { passive: false });
    window.addEventListener("pointercancel", this.onPointerUp, { passive: false });
    this.host.addEventListener("contextmenu", (e) => e.preventDefault());
    this.host.addEventListener("dragstart", (e) => e.preventDefault());
  }

  private cardFromTarget(target: EventTarget | null): HTMLDivElement | null {
    if (!(target instanceof Element)) return null;
    return target.closest<HTMLDivElement>(".card");
  }

  private onPointerMoveAlways = (e: PointerEvent): void => {
    this.hooks.emitCursor(e.clientX, e.clientY);
  };

  private onPointerDown = (e: PointerEvent): void => {
    const cardEl = this.cardFromTarget(e.target);
    if (!cardEl) return;
    if (e.button !== 0 && e.button !== 2) return;
    const id = cardEl.dataset.id;
    if (!id) return;

    e.preventDefault();

    if (e.button === 2) {
      this.hooks.onCardFlipped(id);
      return;
    }

    const ids = e.ctrlKey || e.metaKey ? this.hooks.pickStack(id) : [id];
    const origin = new Map<string, { x: number; y: number }>();
    for (const cid of ids) {
      const c = this.state.cards.get(cid);
      if (c) origin.set(cid, { x: c.x, y: c.y });
    }

    this.state.topZ++;
    for (const cid of ids) {
      const c = this.state.cards.get(cid);
      if (!c) continue;
      this.state.topZ++;
      c.z = this.state.topZ;
      const el = this.host.querySelector<HTMLDivElement>(`[data-id="${cid}"]`);
      if (el) {
        el.style.zIndex = String(c.z);
        el.classList.add("is-held");
      }
    }

    this.session = {
      pointerId: e.pointerId,
      ids,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origin,
      dragging: false,
      rightButton: false,
      longPressTimer: window.setTimeout(() => {
        if (!this.session || this.session.dragging) return;
        // Long-press on touch = open context bar
        if (e.pointerType === "touch") {
          this.hooks.showContextBar(id, e.clientX, e.clientY);
        }
      }, LONG_PRESS_MS),
      startedAt: performance.now()
    };
  };

  private onPointerMove = (e: PointerEvent): void => {
    const s = this.session;
    if (!s || e.pointerId !== s.pointerId) return;
    const dx = e.clientX - s.startClientX;
    const dy = e.clientY - s.startClientY;
    if (!s.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      s.dragging = true;
      window.clearTimeout(s.longPressTimer);
      this.hooks.hideContextBar();
    }
    for (const id of s.ids) {
      const origin = s.origin.get(id);
      const c = this.state.cards.get(id);
      if (!origin || !c) continue;
      c.x = origin.x + dx;
      c.y = origin.y + dy;
      const el = this.host.querySelector<HTMLDivElement>(`[data-id="${id}"]`);
      if (el) {
        el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0)`;
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const s = this.session;
    if (!s || e.pointerId !== s.pointerId) return;
    window.clearTimeout(s.longPressTimer);

    for (const id of s.ids) {
      const el = this.host.querySelector<HTMLDivElement>(`[data-id="${id}"]`);
      if (el) el.classList.remove("is-held");
    }

    if (!s.dragging) {
      // simple tap on a card, no movement
      this.session = null;
      return;
    }

    const selfSeat = this.hooks.getSelfSeat();
    const moved = s.ids.slice();
    for (const id of s.ids) {
      const c = this.state.cards.get(id);
      if (!c) continue;
      const opponentSeat = this.hooks.pointInOpponentZone(e.clientX, e.clientY);
      if (opponentSeat !== null && opponentSeat !== selfSeat) {
        // snap back to origin
        const origin = s.origin.get(id);
        if (origin) {
          c.x = origin.x;
          c.y = origin.y;
        }
        const el = this.host.querySelector<HTMLDivElement>(`[data-id="${id}"]`);
        if (el) {
          el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0)`;
          el.classList.add("is-snapback");
          window.setTimeout(() => el.classList.remove("is-snapback"), 280);
        }
      } else if (this.hooks.pointInSelfZone(e.clientX, e.clientY)) {
        this.hooks.setOwnerSeat(id, selfSeat);
      } else {
        this.hooks.setOwnerSeat(id, null);
      }
    }

    this.hooks.onCardMoved(moved);
    this.session = null;
  };

  destroy(): void {
    this.host.removeEventListener("pointerdown", this.onPointerDown);
    this.host.removeEventListener("pointermove", this.onPointerMoveAlways);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
  }
}
