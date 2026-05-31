import { buildTable, repaintSlots, refreshDockLabels, type BoardRefs } from "../table/Board.js";
import { createCardElement, refreshCardLabel, preloadCardArt } from "../table/Card.js";
import { applyTableBackground } from "../table/Background.js";
import type { BoardState, CardState, SelfPlayer } from "../table/types.js";
import { DragController, type DragHooks } from "../table/DragController.js";
import { Tooltip } from "../ui/Tooltip.js";
import { Header } from "../ui/Header.js";
import { Modal } from "../ui/Modal.js";
import { openRulesModal } from "../ui/RulesModal.js";
import { openSupportModal } from "../ui/SupportModal.js";
import { openLeaveConfirm } from "../ui/LeaveConfirm.js";
import { openConfirm } from "../ui/ConfirmModal.js";
import { openShortcutsModal } from "../ui/ShortcutsPanel.js";
import { openSettingsModal } from "../ui/SettingsModal.js";
import { openDiagnosticsModal } from "../ui/DiagnosticsModal.js";
import { ContextBar } from "../ui/ContextBar.js";
import { DebugHud } from "../ui/DebugHud.js";
import { toast } from "../ui/Toast.js";
import { t, onLocaleChange } from "../i18n/index.js";
import { getOrCreateRoom, newRoom, setRoomSlug } from "../net/room.js";
import { showLoader, hideLoader } from "../ui/loader.js";
import { seededDeck } from "./deck.js";
import {
  findStackOverlapping,
  gatherStack,
  shuffleStack,
  flipStackOver
} from "../table/StackOps.js";
import { rotateVec, seatRotationDeg, localSlotForSeat, SLOT_INDEX, screenToCanonical, canonicalToScreen, type Seat, type BoardBox } from "../table/rotation.js";
import { DECK_NX, DECK_NY, DISCARD_NX } from "../table/constants.js";
import type { RealtimeBus, PresencePlayer, CardPatch, PatchCard, HoldMsg, LeftMsg, KickMsg, SeatClaim } from "../net/realtime.js";
import type { RuntimeConfig } from "../net/config.js";
import { AudioEngine, type SfxName } from "../audio/Audio.js";
import { getOrAssignName, resetName } from "../util/names.js";

const SEAT_COUNT = 4;
const SEAT_COLORS = ["#f3efe5", "#cdc8bc", "#a09c92", "#79766f"];
// Temporary z-band for cards mid-animation (flip/shuffle/held). Sits above the
// static card layer (--z-card) but below cursors (--z-cursor: 600), so an
// animating pile floats over the table yet never covers peer cursors/header.
const ANIM_Z_BASE = 500;
// Animation durations (kept slightly above the CSS transition/keyframe lengths
// so the z-elevation never clears before the visual settles).
const FLIP_ANIM_MS = 380;
const SHUFFLE_ANIM_MS = 400;
const SS_SNAPSHOT_PREFIX = "kabal:snap:";
const SS_SEAT_PREFIX = "kabal:seat:";
const SS_CLIENT_ID = "kabal:cid";
const LIVE_CID_PREFIX = "kabal:livecid:";
// Room-scoped identity (id + name + seat) in localStorage. Unlike the
// sessionStorage seat/cid (which only survive a same-tab reload), this lets a
// player who fully CLOSED the browser, lost the network, or otherwise dropped
// return to the SAME room with the same id and name and reclaim their "away"
// seat — exactly the persistence the table promises. Kept fresh for 24h.
const LS_IDENT_PREFIX = "kabal:ident:";
const IDENT_TTL_MS = 24 * 60 * 60 * 1000;

interface RoomIdentity { id: string; name: string; seat: number; ts: number; }

export interface GameDeps {
  host: HTMLElement;
  bus: RealtimeBus;
  config: RuntimeConfig;
}

export class Game {
  private host: HTMLElement;
  private bus: RealtimeBus;
  private config: RuntimeConfig;
  private refs!: BoardRefs;
  private state: BoardState = { cards: new Map(), topZ: 10 };
  private self: SelfPlayer;
  private players: Map<string, PresencePlayer> = new Map();
  private header!: Header;
  private debug: DebugHud | null = DebugHud.enabled() ? new DebugHud() : null;
  private modal = new Modal();
  private contextBar!: ContextBar;
  private audio = new AudioEngine();
  private drag!: DragController;
  private tooltip!: Tooltip;
  private room = "";
  private patchVersion = 0;
  // Monotonic logical clock for last-write-wins. Seeded from wall-clock but
  // always advanced past anything we receive, so clock skew can't drop edits.
  private clock = Date.now();
  private dirtyIds = new Set<string>();
  private flushHandle = 0;
  private dragPreviewIds = new Set<string>();
  private dragPreviewHandle = 0;
  private cursorEls = new Map<string, HTMLDivElement>();
  // Cache of card id -> DOM node so the render loop never has to query the DOM
  // (a per-card querySelector every frame was the main idle-CPU jank source).
  private cardEls = new Map<string, HTMLDivElement>();
  // Dirty flag: the RAF loop only re-renders when something actually changed,
  // so a still table costs nothing instead of churning every frame.
  private renderRequested = true;
  private lastPointer: { x: number; y: number } | null = null;
  private boardSize = { width: 1, height: 1 };
  private spectator = false;
  private cursorHiddenSent = false;
  private selfJoinedAt = Date.now();
  // Persistent seat ownership keyed by seat index. A claim survives a network
  // drop (the seat shows as "dropped"/dimmed) and is only cleared by an explicit
  // `left` broadcast, so a disconnected player never loses their seat or cards.
  private seatClaims = new Map<number, { id: string; name: string; joinedAt: number }>();
  private activeSeats = new Set<number>();
  private lastRoster: PresencePlayer[] = [];

  constructor(deps: GameDeps) {
    this.host = deps.host;
    this.bus = deps.bus;
    this.config = deps.config;
    this.self = { id: getOrMakeClientId(), seat: 0, color: SEAT_COLORS[0]!, name: getOrAssignName() };
  }

  async mount(): Promise<void> {
    this.refs = buildTable(this.host);
    this.tooltip = new Tooltip(this.refs.cardsLayer);
    this.contextBar = new ContextBar({
      onFlip: (id) => this.flipCard(id),
      onGather: (id) => this.gatherAt(id),
      onMix: (id) => this.shuffleAt(id),
      onStackToggleFlip: (id) => this.toggleStackFlip(id),
      onRotate: (id) => this.rotateCard(id),
      onInfo: (id) => this.showCardInfo(id),
      canShowInfo: (id) => this.canShowCardInfo(id),
      stackFor: (id) => findStackOverlapping(this.state, this.boardSize, id, this.cardMetrics())
    });
    this.header = new Header({
      onRules: () => { void this.audio.play("ui-open"); openRulesModal(this.modal); },
      onSupport: () => { void this.audio.play("ui-open"); openSupportModal(this.modal, this.config.supportUrl); },
      onReset: () => { if (this.spectator) return; void this.audio.play("ui-open"); this.handleReset(); },
      onResetDeck: () => { if (this.spectator) return; this.confirmResetDeck(); },
      onSettings: () => { void this.audio.play("ui-open"); openSettingsModal(this.modal, this.audio, () => this.onLocale()); },
      onShortcuts: () => { void this.audio.play("ui-open"); openShortcutsModal(this.modal); },
      onJoinRoom: (code) => { void this.joinRoom(code); },
      onDiagnose: () => { void this.audio.play("ui-open"); openDiagnosticsModal(this.modal, this.bus); }
    });
    document.body.appendChild(this.header.el);

    onLocaleChange(() => this.onLocale());

    this.room = getOrCreateRoom();
    this.header.setRoom(this.room);
    this.installZoneActions();
    // Recover a persisted identity for this room first: a player who fully closed
    // the browser (or dropped) returns with the SAME id and name and reclaims the
    // seat that is currently showing as "away", instead of grabbing a fresh one.
    const ident = this.readIdentity(this.room);
    if (ident) {
      this.self.id = ident.id;
      this.self.name = ident.name;
      this.self.seat = ident.seat >= 0 ? ident.seat : this.readSeat(this.room);
      // Keep the per-tab client-id store in sync so reload logic stays coherent.
      try { sessionStorage.setItem(SS_CLIENT_ID, this.self.id); } catch {}
    } else {
      // Reclaim our previous seat for this room (set on a same-tab reload) so a
      // refresh re-asserts the same seat instead of grabbing a new one.
      this.self.seat = this.readSeat(this.room);
    }
    this.claimSeat = this.self.seat;
    this.self.color = SEAT_COLORS[this.self.seat] ?? SEAT_COLORS[0]!;
    this.writeIdentity();

    // Apply perspective transform first, then measure: the rect we read out
    // belongs to the rotated layout so all canonical math lines up.
    this.applyBoardPerspective();
    this.measureBoard();

    const restored = this.tryRestoreSnapshot();
    if (!restored) this.initialDealLocal();

    this.bindHooks();
    this.installKeyboardAndWheel();
    this.installResizeObserver();
    this.installRealtime();
    this.installAudioBoot();
    this.installBeforeUnload();
    this.installVisibility();
    this.refreshZones();
    this.startRenderLoop();
    this.startReconcile();

    // Preload the art that's actually on the table plus the background BEFORE
    // the loading screen lifts, so nothing pops in after the board is shown.
    await this.preloadAssets();

    // Connect and wait (capped) for the first sync so our seat/rotation and the
    // authoritative board are settled BEHIND the loader: the table never visibly
    // rotates or reshuffles after it is shown. If we're alone or the network is
    // slow, the timeout reveals the local board anyway.
    this.armFirstSync();
    void this.bus.connect(this.room, this.presencePayload());
    await Promise.race([this.firstSync, delay(1800)]);
  }

  // First-sync gate: resolves once we know our seat AND have the authoritative
  // board (a snapshot), or once we're sure we're alone. Used to hold the loader
  // until the table is final, so nothing jumps after reveal.
  private firstSyncResolve: (() => void) | null = null;
  private firstSync: Promise<void> = Promise.resolve();
  private armFirstSync(): void {
    this.firstSync = new Promise<void>((r) => { this.firstSyncResolve = r; });
    // A new room means the previous room's authoritative board no longer counts.
    this.gotSnapshot = false;
    this.syncNudges = 0;
    window.clearTimeout(this.syncNudgeTimer);
  }
  private resolveFirstSync(): void {
    if (this.firstSyncResolve) { this.firstSyncResolve(); this.firstSyncResolve = null; }
  }
  // True once we've received an authoritative snapshot for the current room. A
  // joiner that sees peers in presence but has NOT got a snapshot keeps nudging
  // for one (requestSync), so a hello that raced ahead of presence is recovered
  // and the newcomer always converges onto the live board (never a stale deal).
  private gotSnapshot = false;
  private syncNudges = 0;
  private syncNudgeTimer = 0;

  // Resolve once the on-table card art and the background image have settled
  // (or a short timeout elapses), so the loader can hide with a fully painted
  // board. Never rejects.
  private async preloadAssets(): Promise<void> {
    const defs = new Set<string>();
    for (const c of this.state.cards.values()) defs.add(c.defId);
    await Promise.all([
      preloadCardArt(defs).catch(() => {}),
      applyTableBackground(this.refs.bgLayer).catch(() => {})
    ]);
  }

  // The seat we publish/claim to peers. -1 while spectating; otherwise our held
  // seat. Distinct from self.seat, which is the perspective seat (a spectator
  // still watches from seat 0's POV but must not claim it).
  private claimSeat = 0;

  private presencePayload(): PresencePlayer {
    return {
      id: this.self.id,
      name: this.self.name,
      seat: this.claimSeat,
      color: this.self.color,
      joinedAt: this.selfJoinedAt
    };
  }

  private measureBoard(): void {
    // Use clientWidth/Height (raw layout box) instead of getBoundingClientRect
    // so the board-perspective CSS rotation never warps our canonical math.
    this.boardSize.width = Math.max(1, this.refs.cardsLayer.clientWidth);
    this.boardSize.height = Math.max(1, this.refs.cardsLayer.clientHeight);
    // Card size depends on viewport (clamp on vmin); invalidate the cache so the
    // next cardMetrics() re-measures against the new layout.
    this.cardSizeCache = null;
  }

  // Canonical CENTRE fraction of the deck / discard piles. Fixed constants,
  // identical on every device, so a dealt pile is stored at the same spot for all
  // players and lines up pixel-perfectly with its CSS marker (board.css uses the
  // same DECK_NX / DISCARD_NX) at any screen size.
  private deckBaseNx(): number {
    return DECK_NX;
  }

  private discardBaseNx(): number {
    return DISCARD_NX;
  }

  // Single source of truth for a card's CSS transform. Canonical (nx, ny) is the
  // card CENTRE in [0,1]; we convert to the layer's top-left pixel by subtracting
  // half the measured card size (the .card box is positioned from its top-left,
  // transform-origin: center). So the centre lands exactly on the canonical point
  // — and on the deck/discard marker — at every viewport size and for every
  // client, regardless of their card pixel size. rotate() spins about the centre.
  private cardTransform(nx: number, ny: number, rot: number, cardW: number, cardH: number): string {
    const px = nx * this.boardSize.width - cardW / 2;
    const py = ny * this.boardSize.height - cardH / 2;
    return `translate3d(${px}px, ${py}px, 0) rotate(${rot * 90}deg)`;
  }

  // Cached card pixel size. Reading offsetWidth forces a synchronous reflow, and
  // this is queried on every wheel tick / stack lookup, so we measure once and
  // reuse it until the viewport changes (measureBoard clears the cache). Reading
  // --card-w directly is no good — it returns the UNRESOLVED clamp() (NaN), the
  // old bug that put the deck off its marker.
  private cardSizeCache: { w: number; h: number } | null = null;
  private cardMetrics(): { w: number; h: number } {
    if (this.cardSizeCache) return this.cardSizeCache;
    for (const el of this.cardEls.values()) {
      const w = el.offsetWidth;
      if (w > 0) { this.cardSizeCache = { w, h: el.offsetHeight || w * 1.45 }; return this.cardSizeCache; }
    }
    const probe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w"));
    const w = Number.isFinite(probe) && probe > 0 ? probe : 96;
    // Don't cache the fallback (no card painted yet) so we re-measure once cards exist.
    return { w, h: w * 1.45 };
  }

  private applyBoardPerspective(): void {
    this.refs.board.style.setProperty("--board-rot", `${seatRotationDeg(this.self.seat as Seat)}deg`);
  }

  // The cumulative `rot` value (quarter-turns) that makes a card appear UPRIGHT
  // from THIS viewer's perspective. A card's on-screen angle is
  // rot*90 + boardRot(viewerSeat); upright means that sum ≡ 0 (mod 360). We pick
  // the value congruent to the viewer's upright residue that is NEAREST to
  // `currentRot`, so straightening a pile never sends it on a long multi-turn
  // spin — it just squares up by the shortest path. Because rot is shared, peers
  // see the pile at whatever angle their own seat implies, which is exactly the
  // intended per-viewer ("relative") behaviour.
  private viewerUprightRot(currentRot: number): number {
    const boardRot = seatRotationDeg(this.self.seat as Seat); // 0 / 180 / -90 / 90
    const residue = (((-boardRot / 90) % 4) + 4) % 4; // 0..3
    let delta = (((residue - currentRot) % 4) + 4) % 4; // 0..3 forward
    if (delta > 2) delta -= 4; // take the shortest direction (−1 instead of +3)
    return currentRot + delta;
  }

  // Centre of the cards layer in viewport pixels. Rotation is applied about
  // this centre by CSS, so it is invariant under the board rotation and can be
  // read straight off the (possibly rotated) bounding box.
  private boardCenter(): { cx: number; cy: number } {
    const r = this.refs.cardsLayer.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  // Viewport pixel -> canonical [0,1] fraction. Inverts the CSS board rotation
  // in real pixel space (see rotateVec) so it stays exact on a non-square board
  // for every seat. For seat 0 (no rotation) this reduces to the old
  // (clientX - left) / width mapping, so solo play is unchanged.
  private boardBox(): BoardBox {
    const { cx, cy } = this.boardCenter();
    return { cx, cy, width: this.boardSize.width, height: this.boardSize.height };
  }

  private screenToCanonical(clientX: number, clientY: number): { nx: number; ny: number } {
    return screenToCanonical(clientX, clientY, this.self.seat as Seat, this.boardBox());
  }

  // Canonical [0,1] fraction -> viewport pixel, matching exactly where CSS
  // paints a card at that canonical position (used to place peer cursors).
  private canonicalToScreen(nx: number, ny: number): { px: number; py: number } {
    return canonicalToScreen(nx, ny, this.self.seat as Seat, this.boardBox());
  }

  private bindHooks(): void {
    const hooks: DragHooks = {
      canInteract: () => !this.spectator,
      getSelfSeat: () => this.self.seat,
      pointInSelfZone: (x, y) => this.pointInZone(this.self.seat, x, y),
      pointInOpponentZone: (x, y) => {
        for (let i = 0; i < SEAT_COUNT; i++) {
          if (i === this.self.seat) continue;
          if (this.pointInZone(i, x, y)) return i;
        }
        return null;
      },
      toCanonical: (clientX, clientY) => this.screenToCanonical(clientX, clientY),
      boardMetrics: () => {
        const { w, h } = this.cardMetrics();
        return { width: this.boardSize.width, height: this.boardSize.height, cardW: w, cardH: h };
      },
      pickStackUnder: (clientX, clientY) => {
        const top = this.topCardAtCanonicalPoint(clientX, clientY);
        if (!top) return [];
        return findStackOverlapping(this.state, this.boardSize, top.id, this.cardMetrics());
      },
      // v3.7: snap-to-slot is removed. The user places cards by hand and the
      // dock + per-seat slots are pure visual scaffolding.
      applySnap: (_ownerSeat, nx, ny) => ({ nx, ny, snapped: false }),
      onCardMoved: (ids) => {
        for (const id of ids) this.dirtyIds.add(id);
        this.scheduleFlush();
      },
      onReleased: (x, y) => this.tooltip.probeAt(x, y),
      onDragProgress: (ids) => {
        for (const id of ids) this.dragPreviewIds.add(id);
        this.scheduleDragPreview();
      },
      onCardFlipped: (id) => this.flipCard(id),
      onStackToggleFlip: (id) => this.toggleStackFlip(id),
      setOwnerSeat: (id, seat) => {
        const c = this.state.cards.get(id);
        if (!c) return;
        if (c.ownerSeat !== seat) {
          c.ownerSeat = seat;
          this.dirtyIds.add(id);
          this.scheduleFlush();
        }
      },
      beginHold: (ids) => this.broadcastHold(ids, false),
      endHold: (ids) => this.broadcastHold(ids, true),
      isLocked: (id) => this.isLockedByOther(id),
      showContextBar: (id, x, y) => this.contextBar.show(id, x, y),
      hideContextBar: () => this.contextBar.hide(),
      emitCursor: (x, y) => {
        // Spectators are silent observers, never broadcast a cursor (that was
        // the source of the seat-0 "impostor" ghost).
        if (this.spectator) return;
        // The cursor listener is on window (so empty board space, no longer
        // captured by the cards layer, still shares the pointer). Skip broadcast
        // while a modal is open: the player is in a menu, not at the table, and
        // peers should not see their ghost dart across the board.
        if (this.modal.isOpen()) return;
        // Inside our own zone we keep our pointer private: send an off-board
        // sentinel ONCE so peers hide our ghost (instead of freezing it at the
        // zone edge), then stay quiet until we leave the zone again.
        if (this.pointInZone(this.self.seat, x, y)) {
          if (!this.cursorHiddenSent) {
            this.cursorHiddenSent = true;
            this.bus.sendCursor({ id: this.self.id, x: -10, y: -10, seat: this.self.seat });
          }
          return;
        }
        this.cursorHiddenSent = false;
        // Broadcast canonical (perspective-independent) coords so peers can
        // re-project the cursor into their own rotated view.
        const { nx, ny } = this.screenToCanonical(x, y);
        this.bus.sendCursor({ id: this.self.id, x: nx, y: ny, seat: this.self.seat });
      },
      playSfx: (name) => { void this.audio.play(name as SfxName); }
    };
    this.drag = new DragController(this.refs.cardsLayer, this.state, hooks);
  }

  private topCardAtCanonicalPoint(clientX: number, clientY: number): CardState | null {
    const { nx, ny } = this.screenToCanonical(clientX, clientY);
    const w = this.boardSize.width;
    const h = this.boardSize.height;
    const { w: cardW, h: cardH } = this.cardMetrics();
    // Work in cards-layer pixels and test each card in its OWN rotated frame, so
    // a 90°/270° card's hit-box matches what's painted (a card is rotated rot*90°
    // about its centre by CSS). An axis-aligned bbox made rotated cards miss by
    // their corners, forcing the cursor to hover too precisely.
    const px = nx * w;
    const py = ny * h;
    let pick: CardState | null = null;
    for (const c of this.state.cards.values()) {
      const ccx = c.x * w;
      const ccy = c.y * h;
      const [lx, ly] = rotateVec(px - ccx, py - ccy, -c.rot * 90);
      if (Math.abs(lx) <= cardW / 2 && Math.abs(ly) <= cardH / 2) {
        if (!pick || c.z > pick.z) pick = c;
      }
    }
    return pick;
  }

  // The physical zone div (bottom/top/left/right) that an absolute seat occupies
  // on THIS viewer's screen. The local player's own seat is always the bottom
  // slot; the other seats fall out of the same board rotation the cards use, so
  // hit-testing, labels and ownership all agree for every seat.
  private physicalZoneForSeat(seat: number): HTMLDivElement | null {
    const slot = localSlotForSeat(this.self.seat as Seat, seat as Seat);
    return this.refs.zones[SLOT_INDEX[slot]] ?? null;
  }

  private pointInZone(seat: number, x: number, y: number): boolean {
    const z = this.physicalZoneForSeat(seat);
    if (!z) return false;
    // Zone divs are axis-aligned grid cells (they are NOT rotated), so their
    // on-screen bounding box is exact for the hit test.
    const r = z.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  private initialDealLocal(): void {
    const deck = seededDeck(this.room);
    // Pile centre is the fixed canonical (DECK_NX, DECK_NY); cardTransform turns
    // that centre into the right top-left pixel for this device's card size.
    const { w: cardW, h: cardH } = this.cardMetrics();
    const baseNx = this.deckBaseNx();
    const baseNy = DECK_NY;
    let z = 1;
    for (const card of deck) {
      // Every card sits exactly on the Deck slot centre, a clean single pile,
      // no diagonal fan. Depth is conveyed purely by z-order.
      const cardState: CardState = {
        id: card.instanceId,
        defId: card.defId,
        x: baseNx,
        y: baseNy,
        z: z++,
        rot: 0,
        faceUp: false,
        ownerSeat: null,
        ts: 0
      };
      this.state.cards.set(card.instanceId, cardState);
      const { el } = createCardElement(cardState.id, cardState.defId);
      el.style.zIndex = String(cardState.z);
      // Set the transform before first paint so the smooth transition does NOT
      // animate the card sliding in from the layer's top-left corner.
      const tf = this.cardTransform(baseNx, baseNy, 0, cardW, cardH);
      el.style.transform = tf;
      el.dataset.tf = tf;
      this.refs.cardsLayer.appendChild(el);
      this.cardEls.set(cardState.id, el);
    }
    this.state.topZ = z;
    // Re-centre once layout is guaranteed settled. If the board was measured
    // before its grid finished sizing, the half-card offset fraction would be
    // wrong and the pile would drift to the slot's top-left; this corrects it.
    requestAnimationFrame(() => requestAnimationFrame(() => this.recenterDeckPile()));
  }

  // Snap any cards still sitting in the freshly dealt pile (face-down, no
  // owner, not yet moved by a player) precisely onto the Deck slot centre,
  // using a fresh board measurement.
  // Re-snap the deck pile onto the Deck marker. `onlyNearDeck` (used on resize)
  // restricts the move to cards that are STILL essentially on the deck, so a
  // resize re-aligns the resting pile with its marker WITHOUT yanking back a
  // face-down card a player deliberately placed elsewhere on the table.
  private recenterDeckPile(onlyNearDeck = false): void {
    this.measureBoard();
    if (this.boardSize.width < 50 || this.boardSize.height < 50) return;
    const { w: cardW, h: cardH } = this.cardMetrics();
    const deckNx = this.deckBaseNx();
    const discardNx = this.discardBaseNx();
    const baseNy = DECK_NY;
    // ~0.6 card as a canonical fraction — the tolerance for "still on the pile"
    // so only the resting piles (never a card moved away) get re-aligned.
    const tolX = (cardW * 0.6) / this.boardSize.width;
    const tolY = (cardH * 0.6) / this.boardSize.height;
    for (const c of this.state.cards.values()) {
      // Private (owned) cards live in player zones, never on the central piles.
      if (c.ownerSeat !== null) continue;
      // Pristine deck pile: face-down, upright, on the deck marker. On the
      // initial deal (onlyNearDeck=false) every such card belongs to the pile.
      const onDeck = !c.faceUp && c.rot === 0 &&
        (!onlyNearDeck || (Math.abs(c.x - deckNx) <= tolX && Math.abs(c.y - baseNy) <= tolY));
      if (onDeck) { c.x = deckNx; c.y = baseNy; continue; }
      // Discard pile: any public card resting on the discard marker. Both markers
      // are positioned by a card-relative offset, so they shift as a fraction when
      // the card-size clamp changes on resize/zoom; re-snap keeps the piles seated
      // squarely on their markers at every viewport size.
      if (Math.abs(c.x - discardNx) <= tolX && Math.abs(c.y - baseNy) <= tolY) {
        c.x = discardNx; c.y = baseNy;
      }
    }
    this.requestRender();
  }

  private installKeyboardAndWheel(): void {
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape" && this.modal.isOpen()) {
        e.preventDefault();
        this.modal.close();
        return;
      }
      if (this.modal.isOpen() || this.spectator) return;
      const k = e.key.toLowerCase();
      // Desktop convenience: G gathers, M shuffles the stack under the cursor.
      if (k === "g" || k === "m") {
        const pt = this.lastPointer;
        if (!pt) return;
        // Board metrics are kept fresh by onViewportChanged; no per-key reflow.
        const top = this.topCardAtCanonicalPoint(pt.x, pt.y);
        if (!top) return;
        e.preventDefault();
        if (k === "g") this.gatherAt(top.id);
        else this.shuffleAt(top.id);
      }
    });

    window.addEventListener("pointermove", (e) => {
      this.lastPointer = { x: e.clientX, y: e.clientY };
    }, { passive: true });

    // Wheel interactions. A single global cooldown means every tick behaves
    // identically, no "first three work then it breaks" inconsistency.
    window.addEventListener("wheel", (e) => {
      if (this.modal.isOpen()) return;
      if (this.spectator) return;
      if (this.drag && this.drag.isActive()) return;
      const pt = this.lastPointer;
      if (!pt) return;
      // Board metrics are kept fresh by onViewportChanged; no per-tick reflow.
      const top = this.topCardAtCanonicalPoint(pt.x, pt.y);
      if (!top) return; // empty space: do nothing

      // Ownership/hold guard: a rival's owned card OR a card a peer is holding
      // is off-limits to scroll.
      if ((top.ownerSeat != null && top.ownerSeat !== this.self.seat) || this.isLockedByOther(top.id)) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      if (this.wheelCooldown()) return;

      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Shift + scroll: rotate EVERY card under the cursor (the whole stack)
        // 90° in its own plane, by the same direction, so a pile turns together.
        // rot is stored CUMULATIVELY so the visual rotation always continues
        // forward instead of snapping back through modulo at 360°.
        const dir = e.deltaY > 0 ? 1 : -1;
        const stack = findStackOverlapping(this.state, this.boardSize, top.id, this.cardMetrics());
        if (this.stackBlocked(stack)) { return; }
        for (const cid of stack) {
          const c = this.state.cards.get(cid);
          if (!c) continue;
          c.rot = c.rot + dir;
          this.dirtyIds.add(cid);
        }
        this.scheduleFlush();
        void this.audio.play("flip");
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl + scroll: flip the whole stack under the cursor.
        this.toggleStackFlip(top.id);
      } else {
        // Bare scroll: flip the single card under the cursor.
        top.faceUp = !top.faceUp;
        this.dirtyIds.add(top.id);
        this.scheduleFlush();
        void this.audio.play("flip");
        // Re-arm the hover tooltip in place so a card flipped face-up shows its
        // info after the usual delay, without the cursor leaving and re-entering.
        this.rearmTooltipAtPointer();
      }
    }, { passive: false });

    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private installVisibility(): void {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        // Hidden: push the cursor off-board so peers stop showing a frozen ghost;
        // it reappears on the next pointer move when we return.
        if (!this.spectator) this.bus.sendCursor({ id: this.self.id, x: -10, y: -10, seat: this.claimSeat });
        return;
      }
      // Visible again: the requestAnimationFrame render loop was paused while
      // backgrounded, so force an immediate repaint, then re-ask the
      // authoritative peer for a snapshot. This heals anything that arrived (or
      // was dropped) while hidden WITHOUT needing a page refresh — switching
      // back to the tab is now enough. requestSync is a no-op when offline/alone
      // and respondToHello de-dupes to a single responder, so it cannot storm.
      this.renderAllCards();
      this.bus.requestSync();
    });
  }

  private wheelCooldownUntil = 0;
  private wheelCooldown(): boolean {
    const now = performance.now();
    if (now < this.wheelCooldownUntil) return true;
    this.wheelCooldownUntil = now + 180;
    return false;
  }

  // Shuffle visual: cards stay exactly in place and only wobble a few degrees
  // around their own centre, giving a riffle feel without any positional move.
  private applyShuffleJitter(ids: string[]): void {
    const w = this.boardSize.width;
    const h = this.boardSize.height;
    const { w: cardW, h: cardH } = this.cardMetrics();
    for (const id of ids) {
      const el = this.cardEls.get(id);
      const c = this.state.cards.get(id);
      if (!el || !c) continue;
      const a1 = (4 + Math.random() * 4) * (Math.random() < 0.5 ? 1 : -1);
      const a2 = (3 + Math.random() * 3) * (a1 > 0 ? -1 : 1);
      // The keyframe owns the transform while shuffling, so it must carry the
      // card's translate too, otherwise it would snap to 0,0 and just spin.
      // (c.x, c.y) is the card CENTRE; subtract half a card to get the same
      // top-left pixel cardTransform uses, so the wobble pivots in place.
      el.style.setProperty("--tx", `${c.x * w - cardW / 2}px`);
      el.style.setProperty("--ty", `${c.y * h - cardH / 2}px`);
      el.style.setProperty("--base-rot", `${c.rot * 90}deg`);
      el.style.setProperty("--a1", `${a1}deg`);
      el.style.setProperty("--a2", `${a2}deg`);
      el.classList.remove("is-shuffling");
      void el.offsetWidth;
      el.classList.add("is-shuffling");
      window.setTimeout(() => {
        el.classList.remove("is-shuffling");
        el.style.removeProperty("--tx");
        el.style.removeProperty("--ty");
        el.style.removeProperty("--base-rot");
        el.style.removeProperty("--a1");
        el.style.removeProperty("--a2");
        // The keyframe owned the transform; repaint so the inline transform is
        // restored cleanly now that the wobble class is gone.
        this.requestRender();
      }, 380);
    }
  }

  private resizePending = 0;
  // Re-measure the board and re-align board-relative scaffolding after any
  // viewport / resolution / zoom / orientation change. Card positions are
  // canonical [0,1] fractions so moved cards stay put proportionally; only the
  // deck/discard PILE (a card-width-relative offset) needs the re-snap, and
  // only for cards still sitting on it.
  private onViewportChanged(): void {
    if (this.resizePending) return;
    this.resizePending = window.setTimeout(() => {
      this.resizePending = 0;
      // Wait for layout to settle over two frames before measuring: a bare
      // timeout can read clientWidth/Height (and the resolved card clamp) while
      // the browser is still recalculating a heavy resize / orientation change,
      // which would snap the deck onto stale coordinates. The double rAF lands
      // after layout is final, so the piles re-seat exactly on their markers.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.measureBoard();
        repaintSlots(this.refs);
        this.recenterDeckPile(true);
        this.renderAllCards();
      }));
    }, 50);
  }

  private installResizeObserver(): void {
    const ro = new ResizeObserver(() => this.onViewportChanged());
    ro.observe(this.refs.cardsLayer);
    // A window resize / orientation change does not always retrigger the layer's
    // ResizeObserver synchronously on every browser; bind these too so the board
    // is re-measured and re-aligned whenever the viewport metrics change.
    window.addEventListener("resize", () => this.onViewportChanged(), { passive: true });
    window.addEventListener("orientationchange", () => this.onViewportChanged(), { passive: true });
    // A pinch-zoom / browser-zoom changes visualViewport scale without always
    // firing window 'resize'; track it so cards re-align on zoom too.
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => this.onViewportChanged(), { passive: true });
    }
  }

  private installAudioBoot(): void {
    // Browsers block audio until the first real user gesture, so we start the
    // engine (and music) on the earliest pointer/touch/key event. touchstart is
    // included so the very first tap on a phone — which may not raise a
    // pointerdown before the browser's gesture gate — still unlocks audio.
    const start = () => {
      void this.audio.boot();
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("touchstart", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("touchstart", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
  }

  private installBeforeUnload(): void {
    window.addEventListener("beforeunload", () => this.saveSnapshot());
    window.addEventListener("pagehide", () => this.saveSnapshot());
    // Periodic safety net so a tab crash still leaves a fresh snapshot for
    // the next reload to pick up.
    window.setInterval(() => this.saveSnapshot(), 5000);
  }

  private snapshotKey(): string { return SS_SNAPSHOT_PREFIX + this.room; }

  private readSeat(room: string): number {
    try {
      const v = sessionStorage.getItem(SS_SEAT_PREFIX + room);
      const n = v == null ? -1 : parseInt(v, 10);
      return Number.isFinite(n) && n >= 0 && n < SEAT_COUNT ? n : 0;
    } catch { return 0; }
  }
  private writeSeat(): void {
    try {
      if (this.spectator) sessionStorage.removeItem(SS_SEAT_PREFIX + this.room);
      else sessionStorage.setItem(SS_SEAT_PREFIX + this.room, String(this.self.seat));
    } catch {}
    this.writeIdentity();
  }

  private identKey(room: string): string { return LS_IDENT_PREFIX + room; }

  // Persisted room identity, used so a player who fully closed the browser (or
  // dropped) returns with the SAME id/name and reclaims their "away" seat.
  private readIdentity(room: string): RoomIdentity | null {
    try {
      const raw = localStorage.getItem(this.identKey(room));
      if (!raw) return null;
      const v = JSON.parse(raw) as Partial<RoomIdentity>;
      if (typeof v.id !== "string" || typeof v.name !== "string") return null;
      if (typeof v.ts !== "number" || Date.now() - v.ts > IDENT_TTL_MS) return null;
      const seat = typeof v.seat === "number" && v.seat >= 0 && v.seat < SEAT_COUNT ? v.seat : 0;
      return { id: v.id, name: v.name, seat, ts: v.ts };
    } catch { return null; }
  }

  private writeIdentity(): void {
    try {
      // Spectators hold no seat to reclaim, so we don't pin one for them.
      const seat = this.spectator ? -1 : this.self.seat;
      const ident: RoomIdentity = { id: this.self.id, name: this.self.name, seat, ts: Date.now() };
      localStorage.setItem(this.identKey(this.room), JSON.stringify(ident));
    } catch {}
  }

  // Ask before reshuffling the whole table back into the deck — a destructive,
  // shared action, so it routes through the same plain confirm dialog as leave.
  private confirmResetDeck(): void {
    void this.audio.play("ui-open");
    openConfirm(this.modal, {
      title: t("resetDeckConfirm.title"),
      body: t("resetDeckConfirm.body"),
      confirmLabel: t("resetDeckConfirm.confirm"),
      danger: true
    }, () => { void this.audio.play("ui-close"); this.resetDeck(); });
  }

  // Float an animating set of cards above the static table for `durMs`, keeping
  // their mutual order, so a flip/shuffle never lets an undercard flash above a
  // card that is still mid-transition. The render loop is told to leave their
  // z-index alone while `.is-animating` is set (see renderAllCards).
  private animTimers = new Map<string, number>();
  private elevateDuringAnim(ids: string[], durMs: number): void {
    // Preserve internal order by current z so the pile keeps its stacking.
    const ordered = ids
      .map((id) => ({ id, z: this.state.cards.get(id)?.z ?? 0 }))
      .sort((a, b) => a.z - b.z);
    let i = 0;
    for (const { id } of ordered) {
      const el = this.cardEls.get(id);
      if (!el) continue;
      el.classList.add("is-animating");
      el.style.zIndex = String(ANIM_Z_BASE + i++);
      const prev = this.animTimers.get(id);
      if (prev) window.clearTimeout(prev);
      const handle = window.setTimeout(() => {
        el.classList.remove("is-animating");
        this.animTimers.delete(id);
        this.requestRender();
      }, durMs);
      this.animTimers.set(id, handle);
    }
  }

  private saveSnapshot(): void {
    try {
      const payload = {
        v: this.patchVersion,
        ts: Date.now(),
        cards: Array.from(this.state.cards.values()).map((c) => ({
          id: c.id, defId: c.defId, x: c.x, y: c.y, z: c.z,
          rot: c.rot, faceUp: c.faceUp, ownerSeat: c.ownerSeat, ts: c.ts
        }))
      };
      // localStorage (not sessionStorage) so a fully closed-and-reopened page
      // resumes where it left off, not just a same-tab reload. Trimmed by the
      // 12h freshness check on restore and cleared on reset.
      localStorage.setItem(this.snapshotKey(), JSON.stringify(payload));
    } catch {}
  }

  private tryRestoreSnapshot(): boolean {
    try {
      const raw = localStorage.getItem(this.snapshotKey());
      if (!raw) return false;
      const data = JSON.parse(raw) as { v: number; ts: number; cards: Array<Partial<CardState>> };
      if (!Array.isArray(data.cards) || data.cards.length === 0) return false;
      if (Date.now() - data.ts > 12 * 60 * 60 * 1000) return false; // 12h freshness
      let z = 1;
      for (const c of data.cards) {
        if (!c.id || !c.defId) continue;
        const cardState: CardState = {
          id: c.id,
          defId: c.defId,
          x: typeof c.x === "number" ? c.x : 0.5,
          y: typeof c.y === "number" ? c.y : 0.5,
          z: typeof c.z === "number" ? c.z : z,
          rot: typeof c.rot === "number" && Number.isFinite(c.rot) ? c.rot : 0,
          faceUp: !!c.faceUp,
          ownerSeat: typeof c.ownerSeat === "number" ? c.ownerSeat : null,
          ts: typeof c.ts === "number" ? c.ts : 0
        };
        this.state.cards.set(cardState.id, cardState);
        const { el } = createCardElement(cardState.id, cardState.defId);
        el.style.zIndex = String(cardState.z);
        const cm = this.cardMetrics();
        const tf = this.cardTransform(cardState.x, cardState.y, cardState.rot, cm.w, cm.h);
        el.style.transform = tf;
        el.dataset.tf = tf;
        this.refs.cardsLayer.appendChild(el);
        this.cardEls.set(cardState.id, el);
        if (cardState.z > z) z = cardState.z;
        z++;
      }
      this.state.topZ = z + 10;
      this.patchVersion = data.v || 0;
      return true;
    } catch { return false; }
  }

  // Touch "info" button: a card's details can be shown only when it reads face-up
  // to us and is not a concealed rival card.
  private canShowCardInfo(id: string): boolean {
    const c = this.state.cards.get(id);
    if (!c || !c.faceUp) return false;
    if (c.ownerSeat !== null && (this.spectator || c.ownerSeat !== this.self.seat)) return false;
    return true;
  }

  private showCardInfo(id: string): void {
    const el = this.cardEls.get(id);
    if (el && this.canShowCardInfo(id)) this.tooltip.showForCard(el);
  }

  private rotateCard(id: string): void {
    const c = this.state.cards.get(id);
    if (!c) return;
    if ((c.ownerSeat != null && c.ownerSeat !== this.self.seat) || this.isLockedByOther(id)) return;
    // Cumulative rotation: keep adding turns so 270°→360°→450° flows forward
    // visually instead of teleporting back to 0°.
    c.rot = c.rot + 1;
    this.dirtyIds.add(id);
    this.scheduleFlush();
    void this.audio.play("flip");
  }

  private flipCard(id: string): void {
    const c = this.state.cards.get(id);
    if (!c) return;
    if ((c.ownerSeat != null && c.ownerSeat !== this.self.seat) || this.isLockedByOther(id)) return;
    c.faceUp = !c.faceUp;
    this.dirtyIds.add(id);
    this.scheduleFlush();
    void this.audio.play("flip");
    this.rearmTooltipAtPointer();
  }

  // After a flip/turn that may have revealed a card's face, re-probe the tooltip
  // at the current pointer so its info appears after the usual hover delay —
  // without forcing the user to move the cursor out and back in. The probe is
  // delayed slightly past the flip animation so the card reads as face-up and
  // is no longer concealed/animating when the tooltip resolves.
  private rearmTooltipAtPointer(): void {
    const pt = this.lastPointer;
    if (!pt) return;
    window.setTimeout(() => {
      const p = this.lastPointer;
      if (p) this.tooltip.probeAt(p.x, p.y);
    }, FLIP_ANIM_MS + 20);
  }

  private toggleStackFlip(id: string): void {
    const stack = findStackOverlapping(this.state, this.boardSize, id, this.cardMetrics());
    if (!stack.length) return;
    // Ownership guard: if any card in the stack belongs to a rival seat,
    // the whole gesture is blocked. Otherwise mixed-seat flips would leak
    // private orientation across players.
    for (const cid of stack) {
      const c = this.state.cards.get(cid);
      if (c && c.ownerSeat != null && c.ownerSeat !== this.self.seat) return;
      if (this.isLockedByOther(cid)) return;
    }
    // Turn the whole pile over like a real stack of cards: the depth order
    // reverses (the bottom card ends up on top) and every face is toggled.
    flipStackOver(this.state, stack);
    for (const cid of stack) this.dirtyIds.add(cid);
    // Keep the whole pile floating above the table, in order, while the 3D flip
    // plays so undercards never flash above a still-turning card.
    this.elevateDuringAnim(stack, FLIP_ANIM_MS);
    // Real-pile flip: only the new top card (highest z after the flip) is visible
    // mid-rotation; every other card is hidden for the WHOLE turn so no
    // underlying face ever shows through — equally on opening (face-down → up)
    // and closing (face-up → down). Each card flips its own CSS rotateY, so an
    // un-hidden under-card would otherwise reveal its face as it spins.
    if (stack.length > 1) {
      let topId = stack[0]!;
      let topZ = -Infinity;
      for (const cid of stack) {
        const c = this.state.cards.get(cid);
        if (c && c.z > topZ) { topZ = c.z; topId = cid; }
      }
      for (const cid of stack) {
        if (cid !== topId) this.cardEls.get(cid)?.classList.add("is-flip-quiet");
      }
      // Reveal the under-cards only AFTER the flip has fully settled and they have
      // been repainted at rest (a small buffer past the elevate timer avoids the
      // race where a card un-hides while its rotateY transition is still running).
      window.setTimeout(() => {
        this.requestRender();
        for (const cid of stack) this.cardEls.get(cid)?.classList.remove("is-flip-quiet");
      }, FLIP_ANIM_MS + 40);
    }
    this.scheduleFlush();
    void this.audio.play("flip");
    this.rearmTooltipAtPointer();
  }

  // A stack cannot be gathered/shuffled/flipped if any card in it belongs to a
  // rival seat or is held by a peer. Returns true when the gesture must be
  // rejected (silently, no sound).
  private stackBlocked(stack: string[]): boolean {
    for (const cid of stack) {
      if (this.isLockedByOther(cid)) return true;
      const c = this.state.cards.get(cid);
      if (c && c.ownerSeat != null && c.ownerSeat !== this.self.seat) return true;
    }
    return false;
  }

  private gatherAt(id: string): void {
    const stack = findStackOverlapping(this.state, this.boardSize, id, this.cardMetrics());
    if (!stack.length) return;
    if (this.stackBlocked(stack)) return;
    const seed = this.state.cards.get(id);
    // Square the pile up to the angle that reads upright for THIS viewer, so a
    // jumble of 90°/180° cards becomes a clean stack from where they're sitting.
    const upright = this.viewerUprightRot(seed ? seed.rot : 0);
    if (seed) gatherStack(this.state, stack, seed.x, seed.y, upright);
    for (const cid of stack) this.dirtyIds.add(cid);
    this.scheduleFlush();
    void this.audio.play("gather");
  }

  private shuffleAt(id: string): void {
    const stack = findStackOverlapping(this.state, this.boardSize, id, this.cardMetrics());
    if (stack.length < 2) return;
    if (this.stackBlocked(stack)) return;
    // Straighten the shuffled pile to the viewer's upright angle (see gatherAt).
    const seed = this.state.cards.get(id);
    const upright = this.viewerUprightRot(seed ? seed.rot : 0);
    shuffleStack(this.state, stack, upright);
    this.elevateDuringAnim(stack, SHUFFLE_ANIM_MS);
    this.applyShuffleJitter(stack);
    for (const cid of stack) this.dirtyIds.add(cid);
    this.scheduleFlush();
    void this.audio.play("shuffle");
  }

  // Collect every card back into a freshly shuffled face-down pile on the Deck
  // slot. A one-click "new game" without leaving the room.
  private resetDeck(): void {
    const order = seededDeck(`${this.room}:${Date.now()}`);
    const baseNx = this.deckBaseNx();
    const baseNy = DECK_NY;
    let z = 1;
    for (const item of order) {
      const c = this.state.cards.get(item.instanceId);
      if (!c) continue;
      c.x = baseNx;
      c.y = baseNy;
      c.z = z++;
      c.rot = 0;
      c.faceUp = false;
      c.ownerSeat = null;
      this.dirtyIds.add(c.id);
    }
    this.state.topZ = z;
    this.scheduleFlush();
    this.sendSnapshot();
    void this.audio.play("shuffle");
    toast(t("ui.deckReset"));
  }

  private scheduleFlush(): void {
    // Every local mutation routes through here, so this is the single place
    // that guarantees the layout gets repainted on the next frame.
    this.requestRender();
    if (this.flushHandle) return;
    this.flushHandle = window.setTimeout(() => {
      this.flushHandle = 0;
      this.flush();
    }, 40);
  }

  // Monotonic timestamp for a local edit; always ahead of anything received so
  // a continuously-edited card converges regardless of cross-client clock skew.
  private stamp(): number {
    this.clock = Math.max(this.clock + 1, Date.now());
    return this.clock;
  }

  // Build the wire form of a card with coordinates rounded to ~sub-pixel
  // precision. Full f64 coords carried ~16 needless digits, bloating a 72-card
  // snapshot past the byte cap (so it was silently dropped); 4 decimals is finer
  // than one pixel on any screen yet keeps the payload compact.
  private wireCard(c: CardState): PatchCard {
    return {
      id: c.id,
      x: Math.round(c.x * 1e4) / 1e4,
      y: Math.round(c.y * 1e4) / 1e4,
      z: c.z,
      rot: c.rot,
      faceUp: c.faceUp,
      ownerSeat: c.ownerSeat,
      ts: c.ts
    };
  }

  private flush(): void {
    if (!this.dirtyIds.size) return;
    this.patchVersion++;
    const now = this.stamp();
    const cards = Array.from(this.dirtyIds).slice(0, 200).map((id) => {
      const c = this.state.cards.get(id)!;
      // Stamp with the monotonic clock + our id so peers resolve conflicts
      // deterministically and skew can never reject this as stale.
      c.ts = now;
      c.by = this.self.id;
      return this.wireCard(c);
    });
    this.bus.sendPatch({ v: this.patchVersion, by: this.self.id, cards });
    if (this.debug) this.debug.sent++;
    this.dirtyIds.clear();
  }

  private scheduleDragPreview(): void {
    if (this.dragPreviewHandle) return;
    this.dragPreviewHandle = window.setTimeout(() => {
      this.dragPreviewHandle = 0;
      this.flushDragPreview();
    }, 33);
  }

  private flushDragPreview(): void {
    if (!this.dragPreviewIds.size) return;
    const now = this.stamp();
    const cards = Array.from(this.dragPreviewIds).slice(0, 200).map((id) => {
      const c = this.state.cards.get(id);
      if (!c) return null;
      c.ts = now;
      c.by = this.self.id;
      return this.wireCard(c);
    }).filter((c): c is PatchCard => !!c);
    if (cards.length === 0) { this.dragPreviewIds.clear(); return; }
    this.patchVersion++;
    this.bus.sendPatch({ v: this.patchVersion, by: this.self.id, cards });
    this.dragPreviewIds.clear();
  }

  private installRealtime(): void {
    this.bus.onPresence((players) => {
      // Debounce presence so a page refresh (drop + rejoin within ~1s) does
      // not make everyone else flicker seats/cursors. The latest roster wins.
      this.pendingPresence = players;
      if (this.presenceDebounce) return;
      this.presenceDebounce = window.setTimeout(() => {
        this.presenceDebounce = 0;
        this.applyPresence(this.pendingPresence);
      }, 200);
    });
    this.bindRealtimeEvents();
  }

  private pendingPresence: PresencePlayer[] = [];
  private presenceDebounce = 0;

  private applyPresence(players: PresencePlayer[]): void {
      // Stable, claim-based seating. Each client publishes the seat it holds; a
      // seat, once held, is NEVER taken from its owner by someone else leaving —
      // a departure only frees that owner's own seat. So a disconnected player
      // keeps their seat ("dropped") and reclaims it on reconnect; only an
      // explicit `left` (applyLeft) actually vacates a seat.
      const roster = players.length ? players.slice() : [this.presencePayload()];
      if (!roster.some((p) => p.id === this.self.id)) roster.push(this.presencePayload());
      // Deterministic order so two clients racing the same seat resolve the same
      // way everywhere: earliest joiner (then id) wins the contested seat.
      const sorted = roster.slice().sort((a, b) => (a.joinedAt - b.joinedAt) || a.id.localeCompare(b.id));
      this.lastRoster = sorted;

      // 1) Honour each present client's published seat; resolve collisions and
      // assign any unseated/overflow clients to the lowest free seat. A seat
      // reserved by an AWAY player (a persistent claim whose owner is not
      // currently present) is NOT free — skipping it keeps a dropped player's
      // area reserved when an unrelated seat opens (e.g. someone is kicked), so
      // a kick never collaterally evicts other away players.
      const presentIds = new Set(sorted.map((q) => q.id));
      const bySeat = new Map<number, PresencePlayer>();
      const unseated: PresencePlayer[] = [];
      for (const p of sorted) {
        const want = typeof p.seat === "number" && p.seat >= 0 && p.seat < SEAT_COUNT ? p.seat : -1;
        if (want >= 0 && !bySeat.has(want)) bySeat.set(want, p);
        else unseated.push(p);
      }
      for (const p of unseated) {
        let free = -1;
        for (let s = 0; s < SEAT_COUNT; s++) {
          if (bySeat.has(s)) continue;
          const claim = this.seatClaims.get(s);
          if (claim && !presentIds.has(claim.id)) continue; // reserved by an away player
          free = s;
          break;
        }
        if (free >= 0) bySeat.set(free, p); // else: spectator (no seat)
      }
      const resolved = new Map<string, number>();
      for (const [seat, p] of bySeat) resolved.set(p.id, seat);

      // 2) Present seated players (re)assert their persistent claim. Absent
      // claimants are left in place → their seat reads as "dropped".
      this.activeSeats = new Set(bySeat.keys());
      for (const [seat, p] of bySeat) this.seatClaims.set(seat, { id: p.id, name: p.name, joinedAt: p.joinedAt });
      // Drop any claim now held by a DIFFERENT present id (id changed seats).
      for (const [seat, claim] of this.seatClaims) {
        const occupant = bySeat.get(seat);
        if (occupant && occupant.id !== claim.id) this.seatClaims.set(seat, { id: occupant.id, name: occupant.name, joinedAt: occupant.joinedAt });
      }

      // 3) Publish the roster with resolved seats for labels/colours.
      this.players.clear();
      let spectatorCount = 0;
      for (const p of sorted) {
        const seat = resolved.has(p.id) ? resolved.get(p.id)! : -1;
        p.seat = seat;
        p.color = seat >= 0 ? (SEAT_COLORS[seat] ?? SEAT_COLORS[0]!) : "#7a766f";
        this.players.set(p.id, p);
        if (seat < 0) spectatorCount++;
      }

      const mySeat = resolved.has(this.self.id) ? resolved.get(this.self.id)! : -1;
      const wasSpectator = this.spectator;
      const prevClaim = this.claimSeat;
      this.spectator = mySeat < 0;
      this.claimSeat = mySeat; // -1 while spectating
      const perspectiveSeat = mySeat < 0 ? 0 : mySeat; // spectators watch from seat 0
      if (perspectiveSeat !== this.self.seat) {
        this.self.seat = perspectiveSeat;
        this.self.color = SEAT_COLORS[perspectiveSeat] ?? SEAT_COLORS[0]!;
        this.applyBoardPerspective();
      }
      // Re-publish ONLY when our resolved claim changed (e.g. we were bumped to a
      // different seat or became/ceased to be a spectator). Publishing every
      // sync would re-track presence and spin a feedback loop.
      if (this.claimSeat !== prevClaim) {
        this.bus.updateMe(this.presencePayload());
        this.writeSeat();
      }
      if (this.spectator && !wasSpectator) toast(t("ui.roomFull"));

      this.header.setSpectatorMode(this.spectator);
      this.header.setSpectators(spectatorCount);
      if (this.debug) {
        this.debug.peers = this.activeSeats.size;
        this.debug.seat = this.claimSeat;
        this.debug.spectator = this.spectator;
      }

      // Remove ghost cursors for players who are no longer present, so a
      // reconnecting peer never leaves a stale duplicate (e.g. two "P2").
      // (presentIds was computed above for seat reservation.)
      for (const [id, el] of this.cursorEls) {
        if (!presentIds.has(id)) {
          el.remove();
          this.cursorEls.delete(id);
        }
      }
      this.refreshZones();
      // If we're the only one here there's no peer to fetch a board from, so the
      // first-sync gate can release immediately (our local board is final).
      if (sorted.length <= 1) this.resolveFirstSync();
      // Peers ARE present but we haven't received the live board yet: keep
      // nudging for a snapshot so a newcomer never gets stuck on its local deal
      // (covers a hello that raced ahead of the presence roster).
      else this.nudgeForSnapshotIfNeeded(sorted.length);
      // Seat / concealment / perspective may have changed, repaint.
      this.requestRender();
  }

  // Handle an explicit departure: free the seat and release every card that
  // seat owned so the table becomes public/interactable again.
  private applyLeft(l: LeftMsg): void {
    if (l.seat < 0) return;
    this.seatClaims.delete(l.seat);
    this.activeSeats.delete(l.seat);
    const now = this.stamp();
    let released = 0;
    for (const c of this.state.cards.values()) {
      if (c.ownerSeat === l.seat) {
        c.ownerSeat = null;
        c.ts = now;
        c.by = this.self.id;
        this.dirtyIds.add(c.id);
        released++;
      }
    }
    // Remove the leaver's ghost cursor and any holds they had.
    const el = this.cursorEls.get(l.id);
    if (el) { el.remove(); this.cursorEls.delete(l.id); }
    // Re-evaluate seating now that a seat opened (e.g. a spectator can sit).
    this.applyPresence(this.lastRoster);
    if (released) this.scheduleFlush();
    this.requestRender();
  }

  // Merge seat claims taught to us by an authoritative peer's snapshot, so a
  // newcomer learns about players who dropped before we joined.
  private mergeClaims(claims: SeatClaim[]): void {
    let changed = false;
    for (const c of claims) {
      if (c.seat < 0 || c.seat >= SEAT_COUNT) continue;
      if (!this.seatClaims.has(c.seat)) {
        this.seatClaims.set(c.seat, { id: c.id, name: c.name, joinedAt: 0 });
        changed = true;
      }
    }
    if (changed) this.refreshZones();
  }

  private bindRealtimeEvents(): void {
    this.bus.onGame((msg) => {
      if (this.debug) {
        this.debug.markIn();
        if (msg.type === "patch") this.debug.recvPatch++;
        else if (msg.type === "snapshot") this.debug.recvSnap++;
      }
      if (msg.type === "patch") this.applyPatch(msg.payload, false);
      else if (msg.type === "snapshot") this.applyPatch(msg.payload, true);
      else if (msg.type === "hold") this.applyHold(msg.payload);
      else if (msg.type === "left") this.applyLeft(msg.payload);
      else if (msg.type === "kick") this.handleKicked(msg.payload);
      else if (msg.type === "hello") this.respondToHello(msg.payload.id);
    });
    this.bus.onCursor((c) => {
      if (this.debug && c.id !== this.self.id) { this.debug.markIn(); this.debug.recvCursor++; }
      this.renderCursor(c);
    });
    this.bus.onStatus((s) => {
      // Surface the live connection state in the menu so a player can tell at a
      // glance whether realtime sync is actually active (online) or the room is
      // running locally only (offline → Supabase unreachable/unconfigured).
      this.header.setConnection(s);
      if (this.debug) this.debug.status = s;
      // NOTE: we deliberately do NOT push a snapshot on connect, a fresh
      // joiner pushing their just-dealt board would clobber the live game.
      // Instead the bus sends `hello` on every (re)connect and the authoritative
      // peer answers it (see respondToHello), which also recovers state after a
      // dropped channel.
      if (s === "offline") {
        // Can't reach peers: never keep the loader waiting on the network. The
        // local board is final for solo/offline play.
        this.resolveFirstSync();
        for (const el of this.cursorEls.values()) el.remove();
        this.cursorEls.clear();
        // Locks held by departed peers clear; they re-broadcast on reconnect.
        if (this.heldByOther.size) { this.heldByOther.clear(); this.requestRender(); }
      }
    });
  }

  // Exactly one authoritative peer answers a newcomer's hello (the lowest-seated
  // player OTHER than the asker), so a join/reconnect pulls one snapshot instead
  // of an N-peer storm, and the asker never answers itself.
  private respondToHello(askerId: string): void {
    if (this.spectator) return;
    const otherSeats = Array.from(this.players.values())
      .filter((p) => p.id !== askerId && p.seat >= 0)
      .map((p) => p.seat);
    if (!otherSeats.length) return; // asker is alone (or only spectators present)
    if (this.self.seat === Math.min(...otherSeats)) this.sendSnapshot();
  }

  // The host is the room's "owner": the present player on the lowest active seat
  // (the creator, while they're here). It transfers automatically to the next
  // lowest seat when the host leaves. Only the host can kick.
  private hostSeat(): number {
    let min = Infinity;
    for (const s of this.activeSeats) min = Math.min(min, s);
    return Number.isFinite(min) ? min : -1;
  }
  private isHost(): boolean {
    return !this.spectator && this.claimSeat >= 0 && this.claimSeat === this.hostSeat();
  }

  // We were kicked by the host: leave quietly to a fresh, empty room (this also
  // broadcasts our `left`, freeing our seat for the others).
  private handleKicked(k: KickMsg): void {
    if (k.target !== this.self.id) return;
    // Drop the persisted identity for the room we're being removed from so we
    // don't try to reclaim that seat later, then move to a fresh empty room.
    try { localStorage.removeItem(this.identKey(this.room)); } catch {}
    // Show the notice AFTER we land in the new room: a toast raised now would
    // sit behind the loader the room switch puts up. joinRoom resolves once the
    // fresh table is revealed.
    void this.joinRoom(newRoom()).then(() => toast(t("kick.kicked")));
  }

  // Host-only: confirm, then ask the player on `seat` to leave.
  private confirmKick(seat: number): void {
    if (!this.isHost() || seat === this.self.seat) return;
    const target = Array.from(this.players.values()).find((p) => p.seat === seat);
    if (!target) return;
    void this.audio.play("ui-open");
    openConfirm(
      this.modal,
      {
        title: t("kick.title"),
        body: t("kick.body").replace("{name}", target.name),
        confirmLabel: t("kick.confirm"),
        danger: true
      },
      () => {
        this.bus.sendKick(target.id, this.self.id);
        toast(t("kick.done").replace("{name}", target.name));
      }
    );
  }

  // --- Ephemeral hold-lock: a card a peer is holding can't be grabbed/edited
  // by us until they release it or the TTL lapses (crash/leave safety). ---
  private heldByOther = new Map<string, { seat: number; until: number }>();
  private holdSweepHandle = 0;
  private static readonly HOLD_TTL_MS = 6000;

  private applyHold(h: HoldMsg): void {
    if (h.by === this.self.id) return; // never lock ourselves out
    let changed = false;
    if (h.release) {
      for (const id of h.ids) if (this.heldByOther.delete(id)) changed = true;
    } else {
      for (const id of h.ids) { this.heldByOther.set(id, { seat: h.seat, until: h.until }); changed = true; }
      this.scheduleHoldSweep();
    }
    if (changed) this.requestRender();
  }

  private isLockedByOther(id: string): boolean {
    const h = this.heldByOther.get(id);
    if (!h) return false;
    if (h.until <= Date.now()) { this.heldByOther.delete(id); return false; }
    return true;
  }

  private scheduleHoldSweep(): void {
    let soonest = Infinity;
    for (const h of this.heldByOther.values()) soonest = Math.min(soonest, h.until);
    if (!Number.isFinite(soonest)) return;
    window.clearTimeout(this.holdSweepHandle);
    this.holdSweepHandle = window.setTimeout(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, h] of this.heldByOther) if (h.until <= now) { this.heldByOther.delete(id); changed = true; }
      if (changed) this.requestRender();
      if (this.heldByOther.size) this.scheduleHoldSweep();
    }, Math.max(50, soonest - Date.now() + 50));
  }

  private heldRefresh = 0;
  private myHeldIds: string[] = [];
  private broadcastHold(ids: string[], release: boolean): void {
    if (this.spectator) return;
    if (release) {
      window.clearInterval(this.heldRefresh);
      this.heldRefresh = 0;
      this.myHeldIds = [];
      if (ids.length) this.bus.sendHold({ ids, by: this.self.id, seat: this.self.seat, until: Date.now(), release: true });
      return;
    }
    if (!ids.length) return;
    this.myHeldIds = ids;
    const send = () => this.bus.sendHold({
      ids: this.myHeldIds, by: this.self.id, seat: this.self.seat, until: Date.now() + Game.HOLD_TTL_MS, release: false
    });
    send();
    // Refresh well before the TTL so a long, deliberate hold stays locked for
    // peers; cleared on release (above).
    window.clearInterval(this.heldRefresh);
    this.heldRefresh = window.setInterval(send, Math.floor(Game.HOLD_TTL_MS / 2));
  }

  private sendSnapshot(): void {
    this.patchVersion++;
    const cards: PatchCard[] = Array.from(this.state.cards.values()).slice(0, 200).map((c) => this.wireCard(c));
    // Teach the receiver our known seat claims so a player who dropped before
    // they joined still shows as a reserved (dimmed) seat, not an empty one.
    const claims: SeatClaim[] = Array.from(this.seatClaims.entries()).map(([seat, c]) => ({ seat, id: c.id, name: c.name }));
    this.bus.sendSnapshot({ v: this.patchVersion, by: this.self.id, cards, claims });
  }

  // Apply an incoming patch or snapshot. A snapshot is authoritative full
  // state (used to (re)sync joiners/reconnects) and is applied wholesale; a
  // patch is gated per-card by the last-write-wins stamp so a stale/out-of-order
  // packet can never clobber a newer local or remote edit.
  private applyPatch(p: CardPatch, isSnapshot: boolean): void {
    this.patchVersion = Math.max(this.patchVersion, p.v);
    const writer = p.by || "";
    for (const upd of p.cards) {
      const c = this.state.cards.get(upd.id);
      if (!c) continue;
      // Never let a remote/stale packet disturb a card we are actively holding.
      if (this.myHeldIds.includes(upd.id)) continue;
      if (!isSnapshot) {
        // Skew-proof LWW: newer ts wins; equal ts broken by writer id. Advancing
        // our clock past everything we see lets our next edit win in turn.
        const newer = upd.ts > c.ts || (upd.ts === c.ts && writer > (c.by ?? ""));
        if (!newer) continue;
      }
      c.x = upd.x;
      c.y = upd.y;
      c.z = upd.z;
      c.rot = upd.rot;
      c.faceUp = upd.faceUp;
      c.ownerSeat = upd.ownerSeat;
      c.ts = upd.ts;
      c.by = writer;
      if (upd.ts > this.clock) this.clock = upd.ts;
      if (c.z > this.state.topZ) this.state.topZ = c.z;
    }
    // The authoritative board has arrived: the loader can lift without a jump.
    if (isSnapshot) {
      this.gotSnapshot = true;
      window.clearTimeout(this.syncNudgeTimer);
      if (p.claims && p.claims.length) this.mergeClaims(p.claims);
      this.resolveFirstSync();
    }
    this.requestRender();
  }

  // While peers are present but we have not yet received the authoritative
  // board, re-ask for a snapshot a few times (a hello can race ahead of the
  // presence roster, leaving no one to answer the first request).
  private nudgeForSnapshotIfNeeded(peerCount: number): void {
    window.clearTimeout(this.syncNudgeTimer);
    if (this.gotSnapshot || this.spectator || peerCount <= 1) { this.syncNudges = 0; return; }
    if (this.syncNudges >= 6) return;
    this.syncNudgeTimer = window.setTimeout(() => {
      if (this.gotSnapshot) return;
      this.syncNudges++;
      this.bus.requestSync();
      this.nudgeForSnapshotIfNeeded(peerCount);
    }, 400);
  }

  private renderCursor(c: { id: string; x: number; y: number; seat: number }): void {
    if (c.id === this.self.id) return;
    // Trust the authoritative seat from presence, not the seat in the cursor
    // packet (which can lag a reseat and produce a duplicate "P2" label).
    const seat = this.players.get(c.id)?.seat ?? c.seat;
    // A seated peer is required to draw a ghost; spectators (seat < 0) are
    // silent and any stray spectator cursor is ignored.
    if (seat < 0) {
      const stale = this.cursorEls.get(c.id);
      if (stale) stale.style.display = "none";
      return;
    }
    let el = this.cursorEls.get(c.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "cursor-ghost";
      el.innerHTML = `<span class="cursor-ghost__pointer"></span><span class="cursor-ghost__label"></span>`;
      document.body.appendChild(el);
      this.cursorEls.set(c.id, el);
    }
    // Off-board sentinel (tab hidden / left the page): hide the ghost.
    if (c.x < -1 || c.y < -1 || c.x > 2 || c.y > 2) {
      el.style.display = "none";
      return;
    }
    // c.x / c.y are canonical fractions; re-project into our own rotated view
    // in real pixel space so the ghost lands exactly where CSS paints cards.
    const { px, py } = this.canonicalToScreen(c.x, c.y);
    // Privacy (receiver side): never show a peer's cursor while it is over OUR
    // own private area. The sender hides its own ghost when inside its zone, and
    // this covers the reciprocal — a peer's pointer that, in our rotated view,
    // falls over our private zone would otherwise reveal where we're hovering.
    if (!this.spectator && this.pointInZone(this.self.seat, px, py)) {
      el.style.display = "none";
      return;
    }
    el.style.display = "";
    el.style.setProperty("--cursor-color", SEAT_COLORS[seat] ?? SEAT_COLORS[0]!);
    const label = el.querySelector(".cursor-ghost__label");
    const peerName = this.players.get(c.id)?.name || `P${seat + 1}`;
    if (label) label.textContent = peerName;
    el.style.transform = `translate(${px}px, ${py}px)`;
  }

  // Mark the card layout as needing a repaint on the next animation frame.
  // Coalesces many mutations in one frame into a single render.
  private requestRender(): void { this.renderRequested = true; }

  private startRenderLoop(): void {
    const tick = () => {
      requestAnimationFrame(tick);
      if (!this.renderRequested) return;
      this.renderRequested = false;
      this.renderAllCards();
    };
    tick();
  }

  // Self-healing live sync: every ~2s the HOST (lowest active seat) re-broadcasts
  // the whole board as an ordinary patch, so any move/flip a peer missed (a
  // dropped packet, a tab that was briefly backgrounded) converges within a
  // couple of seconds WITHOUT a page refresh. It carries each card's STORED ts
  // (never re-stamped), so the receiver's last-write-wins gate (applyPatch) only
  // accepts it where its own copy is older — it can never clobber a newer local
  // or remote edit, and held cards are skipped. Sent as a patch (NOT a snapshot,
  // which would apply wholesale and could revert fresh edits). Guards keep it
  // inert when alone, backgrounded, spectating, or not the host; sendPatch is
  // itself a no-op while offline, so the timer can run for the whole session.
  private reconcileTimer = 0;
  private startReconcile(): void {
    window.clearInterval(this.reconcileTimer);
    this.reconcileTimer = window.setInterval(() => {
      if (document.hidden || this.spectator) return;
      if (this.activeSeats.size <= 1 || !this.isHost()) return;
      this.patchVersion++;
      const cards = Array.from(this.state.cards.values()).slice(0, 200).map((c) => this.wireCard(c));
      this.bus.sendPatch({ v: this.patchVersion, by: this.self.id, cards });
      if (this.debug) this.debug.sent++;
    }, 2000);
  }

  private renderAllCards(): void {
    const { w: cardW, h: cardH } = this.cardMetrics();
    for (const c of this.state.cards.values()) {
      const el = this.cardEls.get(c.id);
      if (!el) continue;
      const busy = el.classList.contains("is-held") || el.classList.contains("is-shuffling") || el.classList.contains("is-animating");
      if (!busy) {
        const transform = this.cardTransform(c.x, c.y, c.rot, cardW, cardH);
        // Dedup writes so a transition (added in card.css) only fires on a real
        // change, and idle frames do no layout work.
        if (el.dataset.tf !== transform) {
          el.style.transform = transform;
          el.dataset.tf = transform;
        }
        // Only write the resting z-index when the card is NOT mid-animation/held,
        // otherwise the RAF loop would stomp the temporary elevation band and the
        // pile would flicker.
        const zStr = String(c.z);
        if (el.style.zIndex !== zStr) el.style.zIndex = zStr;
      }
      const wasFaceUp = el.classList.contains("is-faceup");
      el.classList.toggle("is-faceup", c.faceUp);
      // If a card just turned face-down, dismiss any tooltip it was showing.
      if (wasFaceUp && !c.faceUp) this.tooltip.hide();
      // A card owned by any rival seat is ALWAYS shown to us as its back, blurred
      // (see .is-concealed in card.css), no matter how the owner placed or flipped
      // it. Only the owner sees their own card face. A spectator owns no seat, so
      // EVERY owned card is concealed from them — no private area ever leaks.
      const hidden = c.ownerSeat !== null && (this.spectator || c.ownerSeat !== this.self.seat);
      el.classList.toggle("is-concealed", hidden);
      // Busy indicator while a peer is holding this card.
      el.classList.toggle("is-locked", this.isLockedByOther(c.id));
    }
  }

  // Bind every absolute seat to its physical zone div for THIS viewer, then set
  // that div's colour, occupancy state and player-name label. Because the
  // local player's own seat always maps to the bottom slot, each player reads
  // their own area at the bottom while the others sit around the table exactly
  // where the rotated board places their cards.
  // Delegated click handler for the per-zone host "kick" button.
  private installZoneActions(): void {
    this.refs.root.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-action="kick"]') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const seat = parseInt(btn.dataset.seat || "-1", 10);
      if (seat >= 0) this.confirmKick(seat);
    });
  }

  private refreshZones(): void {
    const youSuffix = t("table.youSuffix");
    const droppedSuffix = t("table.droppedSuffix");
    const host = this.isHost();
    for (let seat = 0; seat < SEAT_COUNT; seat++) {
      const z = this.physicalZoneForSeat(seat);
      if (!z) continue;
      const occupant = Array.from(this.players.values()).find((p) => p.seat === seat) || null;
      const isSelfSeat = !this.spectator && seat === this.self.seat;
      const isActive = this.activeSeats.has(seat) || isSelfSeat;
      const claim = this.seatClaims.get(seat) || null;
      // Dropped: a seat whose owner has a persistent claim but is not currently
      // present (network drop / closed tab). It stays reserved & dimmed until
      // that player rejoins or explicitly leaves — their cards remain private.
      const isDropped = !isActive && !!claim;

      z.style.setProperty("--seat-color", `var(--seat-${seat})`);
      z.dataset.seat = String(seat);
      z.classList.toggle("zone--empty", !isActive && !isDropped);
      z.classList.toggle("zone--active", isActive);
      z.classList.toggle("zone--dropped", isDropped);
      z.dataset.state = isActive ? "active" : isDropped ? "dropped" : "vacant";

      const nameEl = z.querySelector<HTMLElement>('[data-role="name"]');
      if (nameEl) {
        let label = "";
        if (occupant) label = occupant.id === this.self.id ? `${occupant.name}${youSuffix}` : occupant.name;
        else if (isSelfSeat) label = `${this.self.name}${youSuffix}`;
        else if (isDropped && claim) label = `${claim.name}${droppedSuffix}`;
        if (nameEl.textContent !== label) nameEl.textContent = label;
      }

      // Host-only kick control, on an occupied rival seat only.
      const kickBtn = z.querySelector<HTMLButtonElement>('[data-action="kick"]');
      if (kickBtn) {
        const canKick = host && !!occupant && seat !== this.self.seat;
        kickBtn.hidden = !canKick;
        kickBtn.dataset.seat = String(seat);
        if (canKick && occupant) kickBtn.setAttribute("aria-label", t("kick.aria").replace("{name}", occupant.name));
      }
    }
  }

  // Switch to a different room by code, behind the loading screen, without a
  // page reload. Mirrors the first-join logic: restore a fresh-enough local
  // snapshot for that room if we have one, otherwise lay out a fresh deck; a
  // peer already in the room overwrites it via the hello/snapshot handshake.
  private async joinRoom(code: string): Promise<void> {
    const slug = setRoomSlug(code);
    if (!slug || slug === this.room) return;
    showLoader();
    void this.audio.play("ui-close");
    try {
      // Leaving the current room: free our seat there before hopping over.
      if (this.claimSeat >= 0) this.bus.sendLeft({ id: this.self.id, seat: this.claimSeat });
      this.seatClaims.clear();
      await this.bus.disconnect();
      this.resetTable();
      this.room = slug;
      this.selfJoinedAt = Date.now();
      // Recover a persisted identity for the room we're joining (so returning to
      // a room we previously held reclaims that id/name/seat), else start fresh.
      const ident = this.readIdentity(this.room);
      if (ident) {
        this.self.id = ident.id;
        this.self.name = ident.name;
        this.self.seat = ident.seat >= 0 ? ident.seat : this.readSeat(this.room);
        try { sessionStorage.setItem(SS_CLIENT_ID, this.self.id); } catch {}
      } else {
        this.self.seat = this.readSeat(this.room);
      }
      this.claimSeat = this.self.seat;
      this.self.color = SEAT_COLORS[this.self.seat] ?? SEAT_COLORS[0]!;
      this.writeIdentity();
      this.applyBoardPerspective();
      this.measureBoard();
      this.header.setRoom(this.room);
      this.header.resetTimer();
      const restored = this.tryRestoreSnapshot();
      if (!restored) this.initialDealLocal();
      this.refreshZones();
      await this.preloadAssets();
      this.armFirstSync();
      void this.bus.connect(this.room, this.presencePayload());
      await Promise.race([this.firstSync, delay(1800)]);
    } finally {
      hideLoader();
    }
  }

  private async handleReset(): Promise<void> {
    openLeaveConfirm(this.modal, this.room, async () => {
      void this.audio.play("ui-close");
      // Behind the loader: leaving the old room, rotating our perspective back to
      // seat 0 (we become the host of the fresh room) and dealing a new board all
      // happen out of sight, so the table is final and upright the instant the
      // loader lifts — no visible re-rotation or reshuffle.
      showLoader();
      try {
        try { localStorage.removeItem(this.snapshotKey()); } catch {}
        try { sessionStorage.removeItem(SS_SEAT_PREFIX + this.room); } catch {}
        // We're leaving on purpose: drop the persisted identity for THIS room so
        // we don't later try to reclaim a seat we deliberately vacated.
        try { localStorage.removeItem(this.identKey(this.room)); } catch {}
        // Tell peers we are LEAVING (not merely dropping): they free our seat and
        // release every card we owned so the table is interactable again.
        if (this.claimSeat >= 0) this.bus.sendLeft({ id: this.self.id, seat: this.claimSeat });
        this.seatClaims.clear();
        // Fresh room → fresh handle. The next visit rolls a new KABAL name.
        resetName();
        this.self.name = getOrAssignName();
        this.selfJoinedAt = Date.now();
        // We open the new room as its host: seat 0, first-player perspective.
        this.self.seat = 0; this.claimSeat = 0;
        this.self.color = SEAT_COLORS[0]!;
        this.spectator = false;
        this.header.setSpectatorMode(false);
        await this.bus.disconnect();
        this.resetTable();
        this.room = newRoom();
        this.writeIdentity();
        // Re-apply the (now seat-0) perspective and re-measure BEFORE laying the
        // deck out, so the pile geometry is computed against the upright board.
        this.applyBoardPerspective();
        this.measureBoard();
        this.header.setRoom(this.room);
        this.header.resetTimer();
        this.initialDealLocal();
        this.refreshZones();
        await this.preloadAssets();
        this.armFirstSync();
        void this.bus.connect(this.room, this.presencePayload());
        await Promise.race([this.firstSync, delay(1800)]);
        toast(t("ui.newRoom"));
      } finally {
        hideLoader();
      }
    });
  }

  private resetTable(): void {
    this.refs.cardsLayer.innerHTML = "";
    this.state.cards.clear();
    this.cardEls.clear();
    this.state.topZ = 10;
    this.dirtyIds.clear();
    this.patchVersion = 0;
    for (const el of this.cursorEls.values()) el.remove();
    this.cursorEls.clear();
    this.requestRender();
  }

  private onLocale(): void {
    this.header.refreshLocale();
    this.refreshZones();
    refreshDockLabels(this.refs);
    for (const el of this.refs.cardsLayer.querySelectorAll<HTMLDivElement>(".card")) {
      const def = el.dataset.def;
      if (def) refreshCardLabel(el, def);
    }
    document.title = t("meta.title");
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function makeClientId(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return "p_" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Stable per-tab id. sessionStorage keeps it across same-tab reloads (so a
// refresh reclaims the same seat); a localStorage "live id" heartbeat detects a
// DUPLICATED tab (which copies sessionStorage) and mints a fresh id so the two
// tabs never collide into presence/cursor ghosts.
function getOrMakeClientId(): string {
  let id = "";
  try { id = sessionStorage.getItem(SS_CLIENT_ID) || ""; } catch {}
  try {
    const seen = id ? Number(localStorage.getItem(LIVE_CID_PREFIX + id) || 0) : 0;
    if (!id || (seen && Date.now() - seen < 4000)) id = makeClientId();
  } catch { if (!id) id = makeClientId(); }
  try { sessionStorage.setItem(SS_CLIENT_ID, id); } catch {}
  startClientHeartbeat(id);
  return id;
}

function startClientHeartbeat(id: string): void {
  const key = LIVE_CID_PREFIX + id;
  const beat = () => { try { localStorage.setItem(key, String(Date.now())); } catch {} };
  const clear = () => { try { localStorage.removeItem(key); } catch {} };
  beat();
  window.setInterval(beat, 2000);
  window.addEventListener("pagehide", clear);
  window.addEventListener("beforeunload", clear);
}
