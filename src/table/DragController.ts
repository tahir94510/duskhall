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
  /** Unrotated cards-layer pixel size plus the measured card pixel size. Used to
   *  scale canonical -> in-layer pixels and to convert a card's CENTRE fraction
   *  to its top-left pixel (matching the render loop's cardTransform). */
  boardMetrics(): { width: number; height: number; cardW: number; cardH: number };
  /** Returns the cards under the pointer, tight overlap. */
  pickStackUnder(clientX: number, clientY: number): string[];
  /** Optional magnetic snap: nudge a single canonical (nx, ny) to nearest slot. */
  applySnap(ownerSeat: number, nx: number, ny: number): { nx: number; ny: number; snapped: boolean };
  onCardMoved(ids: string[]): void;
  /** Pointer released over (x, y): re-arm the hover tooltip without a re-enter.
   *  `pointerType` lets the handler skip the auto-probe on touch (info is explicit
   *  on touch, via the action bar). */
  onReleased(x: number, y: number, pointerType: string): void;
  onDragProgress(ids: string[]): void;
  onCardFlipped(id: string): void;
  onStackToggleFlip(id: string): void;
  setOwnerSeat(id: string, seat: number | null): void;
  /** Broadcast that we've grabbed / released these cards (ephemeral lock). */
  beginHold(ids: string[]): void;
  endHold(ids: string[]): void;
  /** True if a peer currently holds this card, block local interaction. */
  isLocked(id: string): boolean;
  /** True if this card is in the private area of a rival seat that is still held
   *  by a player (active or away). A card owned by a seat that is now empty is NOT
   *  rival-owned, so it becomes a grabbable public card. */
  isRivalOwned(id: string): boolean;
  /** Lift these cards to the top of the z-order (preserving their mutual order), so
   *  a dropped card/stack always lands ON TOP of whatever is at the drop spot. */
  bringToTop(ids: string[]): void;
  showContextBar(id: string, x: number, y: number): void;
  hideContextBar(): void;
  emitCursor(x: number, y: number): void;
  playSfx(name: string): void;
}

const DRAG_THRESHOLD = 4;
const LONG_PRESS_MS = 280;
// Base of the elevated z-band for cards in hand: above the table (--z-card: 10) and
// zones (--z-zone: 2). Each held card is painted at HELD_Z_BASE + (its z − the pile's
// lowest z), so a big pile may span past 519 internally, but it can never cover peer
// cursors/header/seat labels: the cards sit inside .board__perspective, whose
// rotation transform is a stacking context that contains the entire band beneath the
// sibling label layer and the body-level cursors. Mirrors ANIM_Z_BASE in Game.ts.
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
  /** cached card elements, resolved once at grab — avoids a per-card querySelector
   *  on every pointermove (the bulk-drag lag source). */
  els: Map<string, HTMLDivElement>;
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
    // Cursor broadcast listens on window, not the cards layer: the cards layer is
    // pointer-events:none (so it never blocks the zone kick button), which means it
    // would not receive moves over empty board space. Window always sees them.
    window.addEventListener("pointermove", this.onPointerMoveAlways, { passive: true });
    window.addEventListener("pointermove", this.onPointerMove, { passive: false });
    window.addEventListener("pointerup", this.onPointerUp, { passive: false });
    window.addEventListener("pointercancel", this.onPointerUp, { passive: false });
    this.host.addEventListener("contextmenu", this.onContextMenu);
    this.host.addEventListener("dragstart", this.onDragStart);
  }

  private onContextMenu = (e: Event): void => { e.preventDefault(); };
  private onDragStart = (e: Event): void => { e.preventDefault(); };

  private cardFromTarget(target: EventTarget | null): HTMLDivElement | null {
    if (!(target instanceof Element)) return null;
    return target.closest<HTMLDivElement>(".card");
  }

  private onPointerMoveAlways = (e: PointerEvent): void => {
    this.hooks.emitCursor(e.clientX, e.clientY);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.hooks.canInteract()) return;
    // Ignore a second pointer while a press/drag is already live. A multi-touch tap on
    // another card used to overwrite the active session wholesale, so the first card was
    // left stuck is-held (floating in the held z-band) and its ephemeral hold-lock was
    // never released for peers. One drag at a time; the active one finishes on its own up.
    if (this.session) { e.preventDefault(); return; }
    const cardEl = this.cardFromTarget(e.target);
    if (!cardEl) return;
    if (e.button !== 0 && e.button !== 2) return;
    const id = cardEl.dataset.id;
    if (!id) return;

    // Ownership guard: a card in a rival's private area (whose seat is still held)
    // cannot be picked up or flipped by anyone else. An unowned card, or one
    // stranded on a now-empty seat, is free. Rejection is SILENT: no sound, no
    // flip, no effect, so clicking a rival's private card does nothing at all.
    if (this.hooks.isRivalOwned(id)) {
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

    // Bring all picked cards to the top, preserving their EXISTING relative
    // stacking. bringToTop syncs the board's top-z first (so the new resting z
    // clears EVERY card, even after a remote patch raised someone else's z — the
    // bug that left a dropped card under the deck) and reassigns z in ascending
    // current-z order, so a grabbed pile keeps its internal order. The resting z
    // persists after the drop; while in hand they paint in the elevated held band,
    // lowest-first, so the visual stack matches the logical one.
    const ordered = ids
      .map((cid) => this.state.cards.get(cid))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => a.z - b.z);
    this.hooks.bringToTop(ordered.map((c) => c.id));
    const els = new Map<string, HTMLDivElement>();
    // Paint each held card at HELD_Z_BASE + its offset from the pile's lowest z, so
    // the FULL internal stacking order is preserved no matter how many cards are in
    // hand. The pile was just lifted by bringToTop, so its z values are dense and the
    // span is at most the card count (≤72) — well within the band. (The old code
    // capped the offset at 18, which collapsed every card past the 19th onto one z so
    // bottom cards painted over top ones during a bulk drag, then "snapped back" on
    // release when the resting z was restored.) The held band can never escape over
    // seat labels / cursors / header: the cards live inside .board__perspective,
    // whose board-rotation transform is a stacking context that contains the whole
    // band beneath the sibling label layer (--z-seat) and the body-level cursors.
    const minZ = ordered.length ? ordered[0]!.z : 0;
    for (const c of ordered) {
      const el = this.host.querySelector<HTMLDivElement>(`[data-id="${c.id}"]`);
      if (el) {
        els.set(c.id, el);
        el.style.zIndex = String(HELD_Z_BASE + (c.z - minZ));
        el.classList.add("is-held");
      }
    }
    // Only the TOP card of a lifted pile carries the big drop shadow; the cards
    // beneath keep the light resting shadow. Otherwise a 50+ card deck stacks 50+
    // heavy shadow haloes into a black smear that buries everything under it. The
    // pile then reads as ONE lifted object with a single clean shadow.
    const lead = ordered.length ? els.get(ordered[ordered.length - 1]!.id) : undefined;
    if (lead) lead.classList.add("is-held-lead");

    this.session = {
      pointerId: e.pointerId,
      ids,
      anchorDx,
      anchorDy,
      startNx: pointerNx,
      startNy: pointerNy,
      relOffsets,
      els,
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

    // Keep the whole dragged group on the board: clamp the seed so every card's
    // CENTRE stays within the canonical [0,1] square. A card can hang at most half
    // off an edge but can never leave the play area entirely, so a card is never lost
    // off-screen and always stays grabbable. The pile keeps its rigid relative layout.
    ({ nx: seedNx, ny: seedNy } = this.clampSeedToBoard(s, seedNx, seedNy));

    for (const id of s.ids) {
      const rel = s.relOffsets.get(id);
      const c = this.state.cards.get(id);
      if (!rel || !c) continue;
      c.x = seedNx + rel.dx;
      c.y = seedNy + rel.dy;
      // Use the element cached at grab — a per-move querySelector for every card
      // in a large stack was the bulk-drag lag source. (nx, ny) is the card CENTRE;
      // subtract half the card to get the top-left pixel, as cardTransform does.
      const el = s.els.get(id);
      if (el) el.style.transform = `translate3d(${c.x * m.width - m.cardW / 2}px, ${c.y * m.height - m.cardH / 2}px, 0) rotate(${c.rot * 90}deg)`;
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
      // Mere click on a card, no drag, no place. Drop the held class and restore
      // the resting z. The grab lifted these to the top; broadcast that so peers
      // see the same stacking (otherwise a click would reorder z only locally).
      for (const id of s.ids) {
        const el = s.els.get(id);
        if (!el) continue;
        el.classList.remove("is-held", "is-held-lead");
        const c = this.state.cards.get(id);
        if (c) el.style.zIndex = String(c.z);
      }
      this.hooks.onCardMoved(s.ids);
      this.hooks.onReleased(e.clientX, e.clientY, e.pointerType);
      this.session = null;
      return;
    }

    // STATE FIRST: update every card's canonical position synchronously, so
    // the RAF render loop never sees a half-applied drop.
    const selfSeat = this.hooks.getSelfSeat();
    const inSelf = this.hooks.pointInSelfZone(e.clientX, e.clientY);
    // Snap-back decision by the card FOOTPRINT, the same geometry that decides ownership
    // and concealment: if the drop would land any card inside an occupied rival's private
    // zone, bounce the WHOLE drag back to its origin. The old pointer-in-zone test missed
    // footprint-only overlaps, so a card whose body landed in a rival's area (pointer just
    // outside) was placed and instantly became rival-owned: concealed and ungrabbable to
    // its own player, i.e. silently handed to the rival with no way back.
    let landsInRival = false;
    for (const id of s.ids) {
      if (this.hooks.isRivalOwned(id)) { landsInRival = true; break; }
    }
    let didSnapBack = false;
    let didPlace = false;

    for (const id of s.ids) {
      const c = this.state.cards.get(id);
      if (!c) continue;
      if (landsInRival) {
        const rel = s.relOffsets.get(id);
        if (rel) {
          c.x = s.startNx + s.anchorDx + rel.dx;
          c.y = s.startNy + s.anchorDy + rel.dy;
        }
        didSnapBack = true;
      } else {
        this.hooks.setOwnerSeat(id, inSelf ? selfSeat : null);
        didPlace = true;
      }
    }

    // A placed card/stack must land ON TOP of whatever is already at the drop
    // spot (e.g. Ctrl-dragging a pile onto another pile). Re-lift to the top now,
    // after positions are set, so the new resting z is above the target. (Skip on
    // a snap-back: those return to their origin and keep their order.)
    if (didPlace && !didSnapBack) this.hooks.bringToTop(s.ids);

    // THEN write the final inline transform and toggle classes, all in the
    // same frame so the next render does not race against drop state.
    const m = this.hooks.boardMetrics();
    for (const id of s.ids) {
      const c = this.state.cards.get(id);
      if (!c) continue;
      const el = s.els.get(id);
      if (!el) continue;
      el.style.transform = `translate3d(${c.x * m.width - m.cardW / 2}px, ${c.y * m.height - m.cardH / 2}px, 0) rotate(${c.rot * 90}deg)`;
      el.classList.remove("is-held", "is-held-lead");
      // Restore the resting z immediately so there is no one-frame gap where the
      // dropped card still sits in the held band.
      el.style.zIndex = String(c.z);
      if (didSnapBack) {
        el.classList.add("is-snapback");
        window.setTimeout(() => el.classList.remove("is-snapback"), 260);
      }
    }

    this.hooks.onCardMoved(s.ids);
    // A whole pile lands with a weightier "place-stack" thud; a single card keeps
    // the crisp "place" tap. Sound variety so dropping a deck feels different from
    // dropping one card.
    if (didSnapBack) this.hooks.playSfx("snap");
    else if (didPlace) this.hooks.playSfx(s.ids.length > 1 ? "place-stack" : "place");
    // Re-arm the hover tooltip at the drop point so a face-up card shows its info
    // immediately, without the pointer having to leave and re-enter.
    this.hooks.onReleased(e.clientX, e.clientY, e.pointerType);
    this.session = null;
  };

  /** Clamp the dragged group's seed (canonical) so EVERY card centre in the group stays
   *  within the [0,1] board. Uses the pile's relative-offset bounds so the group moves as
   *  one rigid block and no card slips fully off an edge. If a pile is somehow wider than
   *  the board, the seed itself is clamped to [0,1] as a floor. Pure, no side effects. */
  private clampSeedToBoard(s: DragSession, seedNx: number, seedNy: number): { nx: number; ny: number } {
    let minDx = 0, maxDx = 0, minDy = 0, maxDy = 0;
    for (const { dx, dy } of s.relOffsets.values()) {
      if (dx < minDx) minDx = dx;
      if (dx > maxDx) maxDx = dx;
      if (dy < minDy) minDy = dy;
      if (dy > maxDy) maxDy = dy;
    }
    const clamp = (v: number, lo: number, hi: number): number =>
      lo <= hi ? Math.min(Math.max(v, lo), hi) : Math.min(Math.max(v, 0), 1);
    return {
      nx: clamp(seedNx, -minDx, 1 - maxDx),
      ny: clamp(seedNy, -minDy, 1 - maxDy)
    };
  }

  /** True between pointerdown on a card and pointerup. */
  isActive(): boolean { return this.session !== null; }

  destroy(): void {
    this.host.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMoveAlways);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.host.removeEventListener("contextmenu", this.onContextMenu);
    this.host.removeEventListener("dragstart", this.onDragStart);
  }
}
