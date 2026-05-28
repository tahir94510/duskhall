import type { BoardState } from "./types.js";

export interface DragHooks {
  getSelfSeat(): number;
  pointInSelfZone(x: number, y: number): boolean;
  pointInOpponentZone(x: number, y: number): number | null;
  /** Local-pixel cursor to canonical normalised board coords. */
  toCanonical(localX: number, localY: number): { nx: number; ny: number };
  /** Returns the cards under the pointer, tight overlap. */
  pickStackUnder(clientX: number, clientY: number): string[];
  /** Optional magnetic snap: nudge a single canonical (nx, ny) to nearest slot. */
  applySnap(ownerSeat: number, nx: number, ny: number): { nx: number; ny: number; snapped: boolean };
  onCardMoved(ids: string[]): void;
  onDragProgress(ids: string[]): void;
  onCardFlipped(id: string): void;
  onStackToggleFlip(id: string): void;
  setOwnerSeat(id: string, seat: number | null): void;
  showContextBar(id: string, x: number, y: number): void;
  hideContextBar(): void;
  emitCursor(x: number, y: number): void;
  playSfx(name: string): void;
}

const DRAG_THRESHOLD = 4;
const LONG_PRESS_MS = 280;

interface DragSession {
  pointerId: number;
  ids: string[];
  /** anchor offset between the seed card's canonical pos and the pointer canonical pos at grab */
  anchorDx: number;
  anchorDy: number;
  /** canonical position of pointer at grab */
  startNx: number;
  startNy: number;
  /** relative offsets of every grabbed card from the seed (canonical) */
  relOffsets: Map<string, { dx: number; dy: number }>;
  dragging: boolean;
  longPressTimer: number;
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
      // Right-click always flips the whole stack under the cursor; if it's a
      // lone card the stack has one element and behaves as a single flip.
      this.hooks.onStackToggleFlip(id);
      return;
    }

    const ids = e.ctrlKey || e.metaKey ? this.hooks.pickStackUnder(e.clientX, e.clientY) : [id];
    if (ids.length === 0) return;

    const seed = this.state.cards.get(ids[0]!);
    if (!seed) return;

    const rect = this.host.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const { nx: pointerNx, ny: pointerNy } = this.hooks.toCanonical(localX, localY);

    const anchorDx = seed.x - pointerNx;
    const anchorDy = seed.y - pointerNy;
    const relOffsets = new Map<string, { dx: number; dy: number }>();
    for (const cid of ids) {
      const c = this.state.cards.get(cid);
      if (!c) continue;
      relOffsets.set(cid, { dx: c.x - seed.x, dy: c.y - seed.y });
    }

    // bring all picked cards to top of z stack
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
      anchorDx,
      anchorDy,
      startNx: pointerNx,
      startNy: pointerNy,
      relOffsets,
      dragging: false,
      longPressTimer: window.setTimeout(() => {
        if (!this.session || this.session.dragging) return;
        if (e.pointerType === "touch") this.hooks.showContextBar(id, e.clientX, e.clientY);
      }, LONG_PRESS_MS)
    };
    // pickup sound fires only once drag actually starts (see onPointerMove)
  };

  private onPointerMove = (e: PointerEvent): void => {
    const s = this.session;
    if (!s || e.pointerId !== s.pointerId) return;
    const rect = this.host.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const { nx: pointerNx, ny: pointerNy } = this.hooks.toCanonical(localX, localY);

    if (!s.dragging) {
      const dx = (pointerNx - s.startNx) * rect.width;
      const dy = (pointerNy - s.startNy) * rect.height;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      s.dragging = true;
      window.clearTimeout(s.longPressTimer);
      this.hooks.hideContextBar();
      this.hooks.playSfx("pickup");
    }

    let seedNx = pointerNx + s.anchorDx;
    let seedNy = pointerNy + s.anchorDy;

    // Magnet snap. Run for self-zone (per-seat slots, currently empty) AND for
    // the central dock so cards "cuk" into the Deck / Discard piles.
    const opponentSeat = this.hooks.pointInOpponentZone(e.clientX, e.clientY);
    if (opponentSeat === null) {
      const inSelf = this.hooks.pointInSelfZone(e.clientX, e.clientY);
      const ownerSeat = inSelf ? this.hooks.getSelfSeat() : -1;
      const snap = this.hooks.applySnap(ownerSeat, seedNx, seedNy);
      seedNx = snap.nx;
      seedNy = snap.ny;
    }

    for (const id of s.ids) {
      const rel = s.relOffsets.get(id);
      const c = this.state.cards.get(id);
      if (!rel || !c) continue;
      c.x = seedNx + rel.dx;
      c.y = seedNy + rel.dy;
      const el = this.host.querySelector<HTMLDivElement>(`[data-id="${id}"]`);
      if (el) el.style.transform = `translate3d(${c.x * rect.width}px, ${c.y * rect.height}px, 0) rotate(${c.rot * 90}deg)`;
    }
    this.hooks.onDragProgress(s.ids);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const s = this.session;
    if (!s || e.pointerId !== s.pointerId) return;
    window.clearTimeout(s.longPressTimer);

    for (const id of s.ids) {
      const el = this.host.querySelector<HTMLDivElement>(`[data-id="${id}"]`);
      if (el) el.classList.remove("is-held");
    }

    if (!s.dragging) { this.session = null; return; }

    const selfSeat = this.hooks.getSelfSeat();
    let didSnapBack = false;
    let didPlace = false;
    const opponentSeat = this.hooks.pointInOpponentZone(e.clientX, e.clientY);
    for (const id of s.ids) {
      const c = this.state.cards.get(id);
      if (!c) continue;
      if (opponentSeat !== null && opponentSeat !== selfSeat) {
        const rel = s.relOffsets.get(id);
        if (rel) {
          c.x = s.startNx + s.anchorDx + rel.dx;
          c.y = s.startNy + s.anchorDy + rel.dy;
        }
        const el = this.host.querySelector<HTMLDivElement>(`[data-id="${id}"]`);
        if (el) {
          const rect = this.host.getBoundingClientRect();
          el.style.transform = `translate3d(${c.x * rect.width}px, ${c.y * rect.height}px, 0) rotate(${c.rot * 90}deg)`;
          el.classList.add("is-snapback");
          window.setTimeout(() => el.classList.remove("is-snapback"), 260);
        }
        didSnapBack = true;
      } else {
        const seat = this.hooks.pointInSelfZone(e.clientX, e.clientY) ? selfSeat : null;
        this.hooks.setOwnerSeat(id, seat);
        didPlace = true;
      }
    }

    this.hooks.onCardMoved(s.ids);
    if (didSnapBack) this.hooks.playSfx("snap");
    else if (didPlace) this.hooks.playSfx("place");
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
