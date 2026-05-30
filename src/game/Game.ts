import { buildTable, refreshLabels, repaintSlots, type BoardRefs } from "../table/Board.js";
import { createCardElement, refreshCardLabel } from "../table/Card.js";
import type { BoardState, CardState, SelfPlayer } from "../table/types.js";
import { DragController, type DragHooks } from "../table/DragController.js";
import { Tooltip } from "../ui/Tooltip.js";
import { Header } from "../ui/Header.js";
import { Modal } from "../ui/Modal.js";
import { openRulesModal } from "../ui/RulesModal.js";
import { openSupportModal } from "../ui/SupportModal.js";
import { openLeaveConfirm } from "../ui/LeaveConfirm.js";
import { openShortcutsModal } from "../ui/ShortcutsPanel.js";
import { openSettingsModal } from "../ui/SettingsModal.js";
import { ContextBar } from "../ui/ContextBar.js";
import { toast } from "../ui/Toast.js";
import { t, onLocaleChange } from "../i18n/index.js";
import { getOrCreateRoom, newRoom } from "../net/room.js";
import { seededDeck } from "./deck.js";
import {
  findStackOverlapping,
  gatherStack,
  shuffleStack,
  flipStackOver
} from "../table/StackOps.js";
import { rotateVec, seatRotationDeg, type Seat } from "../table/rotation.js";
import { DECK_NX, DECK_NY } from "../table/constants.js";
import type { RealtimeBus, PresencePlayer, CardPatch, PatchCard, HoldMsg } from "../net/realtime.js";
import type { RuntimeConfig } from "../net/config.js";
import { AudioEngine, type SfxName } from "../audio/Audio.js";
import { getOrAssignName, resetName } from "../util/names.js";

const SEAT_COUNT = 4;
const SEAT_COLORS = ["#f3efe5", "#cdc8bc", "#a09c92", "#79766f"];
const SS_SNAPSHOT_PREFIX = "kabal:snap:";
const SS_CLIENT_ID = "kabal:cid";
const LIVE_CID_PREFIX = "kabal:livecid:";

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
  private modal = new Modal();
  private contextBar!: ContextBar;
  private audio = new AudioEngine();
  private drag!: DragController;
  private tooltip!: Tooltip;
  private room = "";
  private patchVersion = 0;
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
  private selfJoinedAt = Date.now();
  private lastSeenAt = new Map<string, number>();
  private staleSweepHandle = 0;

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
      stackFor: (id) => findStackOverlapping(this.state, this.boardSize, id)
    });
    this.header = new Header({
      onRules: () => { void this.audio.play("ui-open"); openRulesModal(this.modal); },
      onSupport: () => { void this.audio.play("ui-open"); openSupportModal(this.modal, this.config.supportUrl); },
      onReset: () => { void this.audio.play("ui-open"); this.handleReset(); },
      onResetDeck: () => { if (!this.spectator) this.resetDeck(); },
      onSettings: () => { void this.audio.play("ui-open"); openSettingsModal(this.modal, this.audio); },
      onShortcuts: () => { void this.audio.play("ui-open"); openShortcutsModal(this.modal); },
      onLangChange: () => this.onLocale()
    });
    document.body.appendChild(this.header.el);

    onLocaleChange(() => this.onLocale());

    this.room = getOrCreateRoom();
    this.header.setRoom(this.room);

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
    this.startRenderLoop();

    await this.bus.connect(this.room, this.presencePayload());
  }

  private presencePayload(): PresencePlayer {
    return {
      id: this.self.id,
      name: this.self.name,
      seat: this.self.seat,
      color: this.self.color,
      joinedAt: this.selfJoinedAt
    };
  }

  private measureBoard(): void {
    // Use clientWidth/Height (raw layout box) instead of getBoundingClientRect
    // so the board-perspective CSS rotation never warps our canonical math.
    this.boardSize.width = Math.max(1, this.refs.cardsLayer.clientWidth);
    this.boardSize.height = Math.max(1, this.refs.cardsLayer.clientHeight);
  }

  private applyBoardPerspective(): void {
    this.refs.board.style.setProperty("--board-rot", `${seatRotationDeg(this.self.seat as Seat)}deg`);
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
  private screenToCanonical(clientX: number, clientY: number): { nx: number; ny: number } {
    const { cx, cy } = this.boardCenter();
    const [ux, uy] = rotateVec(clientX - cx, clientY - cy, -seatRotationDeg(this.self.seat as Seat));
    return {
      nx: (ux + this.boardSize.width / 2) / this.boardSize.width,
      ny: (uy + this.boardSize.height / 2) / this.boardSize.height
    };
  }

  // Canonical [0,1] fraction -> viewport pixel, matching exactly where CSS
  // paints a card at that canonical position (used to place peer cursors).
  private canonicalToScreen(nx: number, ny: number): { px: number; py: number } {
    const { cx, cy } = this.boardCenter();
    const lx = nx * this.boardSize.width - this.boardSize.width / 2;
    const ly = ny * this.boardSize.height - this.boardSize.height / 2;
    const [sx, sy] = rotateVec(lx, ly, seatRotationDeg(this.self.seat as Seat));
    return { px: cx + sx, py: cy + sy };
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
      boardMetrics: () => ({ width: this.boardSize.width, height: this.boardSize.height }),
      pickStackUnder: (clientX, clientY) => {
        const top = this.topCardAtCanonicalPoint(clientX, clientY);
        if (!top) return [];
        return findStackOverlapping(this.state, this.boardSize, top.id);
      },
      // v3.7: snap-to-slot is removed. The user places cards by hand and the
      // dock + per-seat slots are pure visual scaffolding.
      applySnap: (_ownerSeat, nx, ny) => ({ nx, ny, snapped: false }),
      onCardMoved: (ids) => {
        for (const id of ids) this.dirtyIds.add(id);
        this.scheduleFlush();
      },
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
        // hide cursor when pointer is inside our own zone
        if (this.pointInZone(this.self.seat, x, y)) return;
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
    const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w")) || 96;
    const cardH = cardW * 1.45;
    let pick: CardState | null = null;
    for (const c of this.state.cards.values()) {
      // bbox in canonical coords
      const bx0 = c.x;
      const by0 = c.y;
      const bx1 = c.x + cardW / w;
      const by1 = c.y + cardH / h;
      if (nx >= bx0 && nx <= bx1 && ny >= by0 && ny <= by1) {
        if (!pick || c.z > pick.z) pick = c;
      }
    }
    return pick;
  }

  private pointInZone(seat: number, x: number, y: number): boolean {
    const z = this.refs.zones[seat];
    if (!z) return false;
    const r = z.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  private initialDealLocal(): void {
    const deck = seededDeck(this.room);
    // Pile origin: card top-left so its centre lands on (DECK_NX, DECK_NY).
    const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w")) || 96;
    const cardH = cardW * 1.45;
    const baseNx = DECK_NX - cardW / (2 * this.boardSize.width);
    const baseNy = DECK_NY - cardH / (2 * this.boardSize.height);
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
      const tf = `translate3d(${baseNx * this.boardSize.width}px, ${baseNy * this.boardSize.height}px, 0) rotate(0deg)`;
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
  private recenterDeckPile(): void {
    this.measureBoard();
    if (this.boardSize.width < 50 || this.boardSize.height < 50) return;
    const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w")) || 96;
    const cardH = cardW * 1.45;
    const baseNx = DECK_NX - cardW / (2 * this.boardSize.width);
    const baseNy = DECK_NY - cardH / (2 * this.boardSize.height);
    for (const c of this.state.cards.values()) {
      if (c.ownerSeat === null && !c.faceUp && c.rot === 0) {
        c.x = baseNx;
        c.y = baseNy;
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
        this.measureBoard();
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
      this.measureBoard();
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
        // Shift + scroll: rotate the card 90° in its own plane. We store rot
        // CUMULATIVELY so the visual rotation always continues forward instead
        // of snapping back through modulo at 360°.
        const dir = e.deltaY > 0 ? 1 : -1;
        top.rot = top.rot + dir;
        this.dirtyIds.add(top.id);
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
      }
    }, { passive: false });

    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private installVisibility(): void {
    // When the tab is hidden, push the cursor off-board so peers stop showing
    // a frozen ghost; it reappears on the next pointer move when we return.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.bus.sendCursor({ id: this.self.id, x: -10, y: -10, seat: this.self.seat });
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
    for (const id of ids) {
      const el = this.cardEls.get(id);
      const c = this.state.cards.get(id);
      if (!el || !c) continue;
      const a1 = (4 + Math.random() * 4) * (Math.random() < 0.5 ? 1 : -1);
      const a2 = (3 + Math.random() * 3) * (a1 > 0 ? -1 : 1);
      // The keyframe owns the transform while shuffling, so it must carry the
      // card's translate too, otherwise it would snap to 0,0 and just spin.
      el.style.setProperty("--tx", `${c.x * w}px`);
      el.style.setProperty("--ty", `${c.y * h}px`);
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

  private installResizeObserver(): void {
    let pending = 0;
    const ro = new ResizeObserver(() => {
      if (pending) return;
      pending = window.setTimeout(() => {
        pending = 0;
        this.measureBoard();
        repaintSlots(this.refs);
        this.renderAllCards();
      }, 50);
    });
    ro.observe(this.refs.cardsLayer);
  }

  private installAudioBoot(): void {
    const start = () => {
      void this.audio.boot();
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("pointerdown", start, { once: true });
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
      sessionStorage.setItem(this.snapshotKey(), JSON.stringify(payload));
    } catch {}
  }

  private tryRestoreSnapshot(): boolean {
    try {
      const raw = sessionStorage.getItem(this.snapshotKey());
      if (!raw) return false;
      const data = JSON.parse(raw) as { v: number; ts: number; cards: Array<Partial<CardState>> };
      if (!Array.isArray(data.cards) || data.cards.length === 0) return false;
      if (Date.now() - data.ts > 30 * 60 * 1000) return false; // 30 min freshness
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
        const tf = `translate3d(${cardState.x * this.boardSize.width}px, ${cardState.y * this.boardSize.height}px, 0) rotate(${cardState.rot * 90}deg)`;
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
  }

  private toggleStackFlip(id: string): void {
    const stack = findStackOverlapping(this.state, this.boardSize, id);
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
    this.scheduleFlush();
    void this.audio.play("flip");
  }

  private gatherAt(id: string): void {
    const stack = findStackOverlapping(this.state, this.boardSize, id);
    if (!stack.length) return;
    if (stack.some((cid) => this.isLockedByOther(cid))) return;
    const seed = this.state.cards.get(id);
    if (seed) gatherStack(this.state, stack, seed.x, seed.y);
    for (const cid of stack) this.dirtyIds.add(cid);
    this.scheduleFlush();
    void this.audio.play("gather");
  }

  private shuffleAt(id: string): void {
    const stack = findStackOverlapping(this.state, this.boardSize, id);
    if (stack.length < 2) return;
    if (stack.some((cid) => this.isLockedByOther(cid))) return;
    shuffleStack(this.state, stack);
    this.applyShuffleJitter(stack);
    for (const cid of stack) this.dirtyIds.add(cid);
    this.scheduleFlush();
    void this.audio.play("shuffle");
  }

  // Collect every card back into a freshly shuffled face-down pile on the Deck
  // slot. A one-click "new game" without leaving the room.
  private resetDeck(): void {
    const order = seededDeck(`${this.room}:${Date.now()}`);
    const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w")) || 96;
    const cardH = cardW * 1.45;
    const baseNx = DECK_NX - cardW / (2 * this.boardSize.width);
    const baseNy = DECK_NY - cardH / (2 * this.boardSize.height);
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

  private flush(): void {
    if (!this.dirtyIds.size) return;
    this.patchVersion++;
    const now = Date.now();
    const cards = Array.from(this.dirtyIds).slice(0, 200).map((id) => {
      const c = this.state.cards.get(id)!;
      // Stamp the write time so peers can reject this if a newer edit beats it.
      c.ts = now;
      return { id: c.id, x: c.x, y: c.y, z: c.z, rot: c.rot, faceUp: c.faceUp, ownerSeat: c.ownerSeat, ts: c.ts };
    });
    this.bus.sendPatch({ v: this.patchVersion, by: this.self.id, cards });
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
    const now = Date.now();
    const cards = Array.from(this.dragPreviewIds).slice(0, 200).map((id) => {
      const c = this.state.cards.get(id);
      if (!c) return null;
      c.ts = now;
      return { id: c.id, x: c.x, y: c.y, z: c.z, rot: c.rot, faceUp: c.faceUp, ownerSeat: c.ownerSeat, ts: c.ts };
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
      }, 350);
    });
    this.bindRealtimeEvents();
  }

  private pendingPresence: PresencePlayer[] = [];
  private presenceDebounce = 0;

  private applyPresence(players: PresencePlayer[]): void {
      // Stable seating by join time: the earliest joiner takes seat 0, next
      // seat 1, etc. A player leaving never reshuffles the seats of those who
      // remain, their joinedAt timestamps are unchanged. Ties (e.g. two
      // clients with identical clocks) break deterministically on id.
      const roster = players.length ? players.slice() : [this.presencePayload()];
      if (!roster.some((p) => p.id === this.self.id)) roster.push(this.presencePayload());
      roster.sort((a, b) => (a.joinedAt - b.joinedAt) || a.id.localeCompare(b.id));

      this.players.clear();
      let mySeat = -1;
      const now = Date.now();
      roster.forEach((p, idx) => {
        const seat = idx < SEAT_COUNT ? idx : -1;
        p.seat = seat;
        p.color = seat >= 0 ? (SEAT_COLORS[seat] ?? SEAT_COLORS[0]!) : "#7a766f";
        this.players.set(p.id, p);
        if (seat >= 0) this.lastSeenAt.set(`seat-${seat}`, now);
        if (p.id === this.self.id) mySeat = seat;
      });

      const wasSpectator = this.spectator;
      this.spectator = mySeat < 0;
      const resolvedSeat = mySeat < 0 ? 0 : mySeat; // spectators watch from seat 0
      if (resolvedSeat !== this.self.seat) {
        this.self.seat = resolvedSeat;
        this.self.color = SEAT_COLORS[resolvedSeat] ?? SEAT_COLORS[0]!;
        this.applyBoardPerspective();
        // Publish our new seat so peers label our cursor correctly.
        this.bus.updateMe(this.presencePayload());
      }
      if (this.spectator && !wasSpectator) toast(t("ui.roomFull"));

      // Remove ghost cursors for players who are no longer present, so a
      // reconnecting peer never leaves a stale duplicate (e.g. two "P2").
      const presentIds = new Set(roster.map((p) => p.id));
      for (const [id, el] of this.cursorEls) {
        if (!presentIds.has(id)) {
          el.remove();
          this.cursorEls.delete(id);
        }
      }
      this.refreshZoneActivity();
      // Seat / concealment / perspective may have changed, repaint.
      this.requestRender();
  }

  private bindRealtimeEvents(): void {
    this.bus.onGame((msg) => {
      if (msg.type === "patch") this.applyPatch(msg.payload, false);
      else if (msg.type === "snapshot") this.applyPatch(msg.payload, true);
      else if (msg.type === "hold") this.applyHold(msg.payload);
      else if (msg.type === "hello") this.respondToHello(msg.payload.id);
    });
    this.bus.onCursor((c) => this.renderCursor(c));
    this.bus.onStatus((s) => {
      // NOTE: we deliberately do NOT push a snapshot on connect, a fresh
      // joiner pushing their just-dealt board would clobber the live game.
      // Instead the bus sends `hello` on every (re)connect and the authoritative
      // peer answers it (see respondToHello), which also recovers state after a
      // dropped channel.
      if (s === "offline") {
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
    const cards: PatchCard[] = Array.from(this.state.cards.values()).slice(0, 200).map((c) => ({
      id: c.id, x: c.x, y: c.y, z: c.z, rot: c.rot, faceUp: c.faceUp, ownerSeat: c.ownerSeat, ts: c.ts
    }));
    this.bus.sendSnapshot({ v: this.patchVersion, by: this.self.id, cards });
  }

  // Apply an incoming patch or snapshot. A snapshot is authoritative full
  // state (used to (re)sync joiners/reconnects) and is applied wholesale; a
  // patch is gated per-card by the last-write-wins stamp so a stale/out-of-order
  // packet can never clobber a newer local or remote edit.
  private applyPatch(p: CardPatch, isSnapshot: boolean): void {
    this.patchVersion = Math.max(this.patchVersion, p.v);
    for (const upd of p.cards) {
      const c = this.state.cards.get(upd.id);
      if (!c) continue;
      if (!isSnapshot && upd.ts < c.ts) continue; // reject stale write
      c.x = upd.x;
      c.y = upd.y;
      c.z = upd.z;
      c.rot = upd.rot;
      c.faceUp = upd.faceUp;
      c.ownerSeat = upd.ownerSeat;
      c.ts = upd.ts;
      if (c.z > this.state.topZ) this.state.topZ = c.z;
    }
    this.requestRender();
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
    el.style.display = "";
    el.style.setProperty("--cursor-color", SEAT_COLORS[seat] ?? SEAT_COLORS[0]!);
    const label = el.querySelector(".cursor-ghost__label");
    const peerName = this.players.get(c.id)?.name || `P${seat + 1}`;
    if (label) label.textContent = peerName;
    // c.x / c.y are canonical fractions; re-project into our own rotated view
    // in real pixel space so the ghost lands exactly where CSS paints cards.
    const { px, py } = this.canonicalToScreen(c.x, c.y);
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

  private renderAllCards(): void {
    const w = this.boardSize.width;
    const h = this.boardSize.height;
    for (const c of this.state.cards.values()) {
      const el = this.cardEls.get(c.id);
      if (!el) continue;
      if (!el.classList.contains("is-held") && !el.classList.contains("is-shuffling")) {
        const transform = `translate3d(${c.x * w}px, ${c.y * h}px, 0) rotate(${c.rot * 90}deg)`;
        // Dedup writes so a transition (added in card.css) only fires on a real
        // change, and idle frames do no layout work.
        if (el.dataset.tf !== transform) {
          el.style.transform = transform;
          el.dataset.tf = transform;
        }
      }
      const zStr = String(c.z);
      if (el.style.zIndex !== zStr) el.style.zIndex = zStr;
      const wasFaceUp = el.classList.contains("is-faceup");
      el.classList.toggle("is-faceup", c.faceUp);
      // If a card just turned face-down, dismiss any tooltip it was showing.
      if (wasFaceUp && !c.faceUp) this.tooltip.hide();
      const hidden = c.ownerSeat !== null && c.ownerSeat !== this.self.seat && c.faceUp;
      el.classList.toggle("is-concealed", hidden);
      // Busy indicator while a peer is holding this card.
      el.classList.toggle("is-locked", this.isLockedByOther(c.id));
    }
  }

  private refreshZoneActivity(): void {
    const now = Date.now();
    const STALE_GRACE_MS = 15000;
    let anyStale = false;
    for (let i = 0; i < this.refs.zones.length; i++) {
      const z = this.refs.zones[i]!;
      const hasPlayer = Array.from(this.players.values()).some((p) => p.seat === i);
      const isSelfSeat = i === this.self.seat;
      const lastSeen = this.lastSeenAt.get(`seat-${i}`) ?? 0;
      const isStale = !hasPlayer && !isSelfSeat && lastSeen > 0 && (now - lastSeen) < STALE_GRACE_MS;
      if (isStale) anyStale = true;
      z.classList.toggle("zone--empty", !hasPlayer && !isSelfSeat && !isStale);
      z.classList.toggle("zone--active", hasPlayer || isSelfSeat);
      z.classList.toggle("zone--stale", isStale);
      if (hasPlayer) z.dataset.state = "active";
      else if (isStale) z.dataset.state = "stale";
      else if (isSelfSeat) z.dataset.state = "active";
      else z.dataset.state = "vacant";
    }
    // While any zone is in stale grace, schedule a re-check at the grace
    // boundary so the fade settles to vacant without further presence updates.
    if (anyStale && !this.staleSweepHandle) {
      this.staleSweepHandle = window.setTimeout(() => {
        this.staleSweepHandle = 0;
        this.refreshZoneActivity();
      }, 1500);
    }
  }

  private async handleReset(): Promise<void> {
    openLeaveConfirm(this.modal, this.room, async () => {
      void this.audio.play("ui-close");
      try { sessionStorage.removeItem(this.snapshotKey()); } catch {}
      // Fresh room → fresh handle. The next visit rolls a new KABAL name.
      resetName();
      this.self.name = getOrAssignName();
      this.selfJoinedAt = Date.now();
      await this.bus.disconnect();
      this.resetTable();
      this.room = newRoom();
      this.header.setRoom(this.room);
      this.initialDealLocal();
      toast(t("ui.newRoom"));
      await this.bus.connect(this.room, this.presencePayload());
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
    refreshLabels(this.refs);
    for (const el of this.refs.cardsLayer.querySelectorAll<HTMLDivElement>(".card")) {
      const def = el.dataset.def;
      if (def) refreshCardLabel(el, def);
    }
    document.title = t("meta.title");
  }
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
