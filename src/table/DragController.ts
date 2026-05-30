import type { BoardState } from "./types.js";

export interface DragHooks {
  /** False for spectators (room full), blocks all card manipulation. */
  canInteract(): boolean;
  getSelfSeat(): number;
  pointInSelfZone(x: number, y: number): boolean;
  pointInOpponentZone(x: number, y: number): number | null;
  /** Viewport-pixel cursor to canonical normalised board coords (handles the
   *  per-seat board rotation correctly, including non-square boards). */
  toCanonical(clientX: number, clientY: number): { nx: number; ny: number };
  /** Unrotated cards-layer pixel size, used to scale canonical -> in-layer
   *  pixels. Must match the basis the render loop uses (clientWidth/Height). */
  boardMetrics(): { width: number; height: number };
  /** Returns the cards under the pointer, tight overlap. */
  pickStackUnder(clientX: number, clientY: number): string[];
  /** Optional magnetic snap: nudge a single canonical (nx, ny) to nearest slot. */
  applySnap(ownerSeat: number, nx: number, ny: number): { nx: number; ny: number; snapped: boolean };
  onCardMoved(ids: string[]): void;
  /** Pointer released over (x, y): re-arm the hover tooltip without a re-enter. */
  onReleased(x: number, y: number): void;
  onDragProgress(ids: string[]): void;
  onCardFlipped(id: string): void;
  onStackToggleFlip(id: string): void;
  setOwnerSeat(id: string, seat: number | null): void;
  /** Broadcast that we've grabbed / released these cards (ephemeral lock). */
  beginHold(ids: string[]): void;
  endHold(ids: string[]): void;
  /** True if a peer currently holds this card, block local interaction. */
  isLocked(id: string): boolean;
  showContextBar(id: string, x: number, y: number): void;
  hideContextBar(): void;
  emitCursor(x: number, y: number): void;
  playSfx(name: string): void;
}

const DRAG_THRESHOLD = 4;
const LONG_PRESS_MS = 280;
// Elevated z-band for cards in hand: above the table (--z-card: 10) and zones
// (--z-zone: 2) but below peer cursors (--z-cursor: 600), so a held card always
// renders over an opponent's area yet never covers their cursor or the header.
// Mirrors ANIM_Z_BASE in Game.ts.
const HELD_Z_BASE = 500;

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
    if (!this.hooks.canInteract()) return;
    const cardEl = this.cardFromTarget(e.target);
    if (!cardEl) return;
    if (e.button !== 0 && e.button !== 2) return;
    const id = cardEl.dataset.id;
    if (!id) return;

    // Ownership guard: a card claimed by a rival seat cannot be picked up or
    // flipped by anyone else. Sahipsiz (ownerSeat=null) kart serbest kalır.
    // Rejection is SILENT: no sound, no flip, no effect, so clicking a rival's
    // private card does nothing at all.
    const seedCard = this.state.cards.get(id);
    if (seedCard && seedCard.ownerSeat != null && seedCard.ownerSeat !== this.hooks.getSelfSeat()) {
      e.preventDefault();
      return;
    }
    // Hold-lock: a card a peer is actively holding is off-limits until released.
    if (this.hooks.isLocked(id)) {
      e.preventDefault();
      return;
    }

    e.preventDefault();

    if (e.button === 2) {
      // Right-click always flips the whole stack under the cursor; if it's a
      // lone card the stack has one element and behaves as a single flip.
      this.hooks.onStackToggleFlip(id);
      return;
    }

    // Grab sound fires NOW, on press, so it always precedes the place/snap sound
    // even on a very fast tap-release (it used to fire on the first move, which
    // could land after "place" and sound inverted).
    this.hooks.playSfx("pickup");

    const ids = e.ctrlKey || e.metaKey ? this.hooks.pickStackUnder(e.clientX, e.clientY) : [id];
    if (ids.length === 0) return;

    const seed = this.state.cards.get(ids[0]!);
    if (!seed) return;

    const { nx: pointerNx, ny: pointerNy } = this.hooks.toCanonical(e.clientX, e.clientY);

    const anchorDx = seed.x - pointerNx;
    const anchorDy = seed.y - pointerNy;
    const relOffsets = new Map<string, { dx: number; dy: number }>();
    for (const cid of ids) {
      const c = this.state.cards.get(cid);
      if (!c) continue;
      relOffsets.set(cid, { dx: c.x - seed.x, dy: c.y - seed.y });
    }

    // Bring all picked cards to the top: bump their resting z (so the order
    // persists after the drop) but paint them in the elevated held band while
    // in hand, preserving their internal order.
    let heldIdx = 0;
    for (const cid of ids) {
      const c = this.state.cards.get(cid);
      if (!c) continue;
      this.state.topZ++;
      c.z = this.state.topZ;
      const el = this.host.querySelector<HTMLDivElement>(`[data-id="${cid}"]`);
      if (el) {
        el.style.zIndex = String(HELD_Z_BASE + heldIdx++);
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
    // Claim the ephemeral lock for everything we just grabbed so peers can't
    // tug the same cards; released on pointer up / cancel.
    this.hooks.beginHold(ids);
    // pickup sound fires only once drag actually starts (see onPointerMove)
  };

  private onPointerMove = (e: PointerEvent): void => {
    const s = this.session;
    if (!s || e.pointerId !== s.pointerId) return;
    const m = this.hooks.boardMetrics();
    const { nx: pointerNx, ny: pointerNy } = this.hooks.toCanonical(e.clientX, e.clientY);

    if (!s.dragging) {
      const dx = (pointerNx - s.startNx) * m.width;
      const dy = (pointerNy - s.startNy) * m.height;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      s.dragging = true;
      window.clearTimeout(s.longPressTimer);
      this.hooks.hideContextBar();
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
      if (el) el.style.transform = `translate3d(${c.x * m.width}px, ${c.y * m.height}px, 0) rotate(${c.rot * 90}deg)`;
    }
    this.hooks.onDragProgress(s.ids);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const s = this.session;
    if (!s || e.pointerId !== s.pointerId) return;
    window.clearTimeout(s.longPressTimer);
    // Release the ephemeral lock for every grabbed card (drag or mere click).
    this.hooks.endHold(s.ids);

    if (!s.dragging) {
      // Mere click on a card, no drag, no place. Drop the held class, restore the
      // resting z, and exit.
      for (const id of s.ids) {
        const el = this.host.querySelector<HTMLDivElement>(`[data-id="${id}"]`);
        if (!el) continue;
        el.classList.remove("is-held");
        const c = this.state.cards.get(id);
        if (c) el.style.zIndex = String(c.z);
      }
      this.hooks.onReleased(e.clientX, e.clientY);
      this.session = null;
      return;
    }

    // STATE FIRST: update every card's canonical position synchronously, so
    // the RAF render loop never sees a half-applied drop.
    const selfSeat = this.hooks.getSelfSeat();
    const opponentSeat = this.hooks.pointInOpponentZone(e.clientX, e.clientY);
    const inSelf = this.hooks.pointInSelfZone(e.clientX, e.clientY);
    const snappedSeats = new Set<string>();
    let didSnapBack = false;
    let didPlace = false;

    for (const id of s.ids) {
      const c = this.state.cards.get(id);
      if (!c) continue;
      if (opponentSeat !== null && opponentSeat !== selfSeat) {
        const rel = s.relOffsets.get(id);
        if (rel) {
          c.x = s.startNx + s.anchorDx + rel.dx;
          c.y = s.startNy + s.anchorDy + rel.dy;
        }
        didSnapBack = true;
      } else {
        const seat = inSelf ? selfSeat : null;
        this.hooks.setOwnerSeat(id, seat);
        if (seat !== null) snappedSeats.add(id);
        didPlace = true;
      }
    }

    // THEN write the final inline transform and toggle classes, all in the
    // same frame so the next render does not race against drop state.
    const m = this.hooks.boardMetrics();
    for (const id of s.ids) {
      const c = this.state.cards.get(id);
      if (!c) continue;
      const el = this.host.querySelector<HTMLDivElement>(`[data-id="${id}"]`);
      if (!el) continue;
      el.style.transform = `translate3d(${c.x * m.width}px, ${c.y * m.height}px, 0) rotate(${c.rot * 90}deg)`;
      el.classList.remove("is-held");
      // Restore the resting z immediately so there is no one-frame gap where the
      // dropped card still sits in the held band.
      el.style.zIndex = String(c.z);
      if (didSnapBack && (opponentSeat !== null && opponentSeat !== selfSeat)) {
        el.classList.add("is-snapback");
        window.setTimeout(() => el.classList.remove("is-snapback"), 260);
      }
    }

    this.hooks.onCardMoved(s.ids);
    if (didSnapBack) this.hooks.playSfx("snap");
    else if (didPlace) this.hooks.playSfx("place");
    // Re-arm the hover tooltip at the drop point so a face-up card shows its info
    // immediately, without the pointer having to leave and re-enter.
    this.hooks.onReleased(e.clientX, e.clientY);
    this.session = null;
  };

  /** True between pointerdown on a card and pointerup. */
  isActive(): boolean { return this.session !== null; }

  destroy(): void {
    this.host.removeEventListener("pointerdown", this.onPointerDown);
    this.host.removeEventListener("pointermove", this.onPointerMoveAlways);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
  }
}
