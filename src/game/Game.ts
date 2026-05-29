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
  setStackFaceUp
} from "../table/StackOps.js";
import { localToCanonical, canonicalToLocal, seatRotationDeg, type Seat } from "../table/rotation.js";
import { DECK_NX, DECK_NY } from "../table/constants.js";
import type { RealtimeBus, PresencePlayer, CardPatch } from "../net/realtime.js";
import type { RuntimeConfig } from "../net/config.js";
import { AudioEngine, type SfxName } from "../audio/Audio.js";

const SEAT_COUNT = 4;
const SEAT_COLORS = ["#f3efe5", "#cdc8bc", "#a09c92", "#79766f"];
const SS_SNAPSHOT_PREFIX = "kabal:snap:";
const SS_CLIENT_ID = "kabal:cid";

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
  private lastPointer: { x: number; y: number } | null = null;
  private boardSize = { width: 1, height: 1 };
  private spectator = false;

  constructor(deps: GameDeps) {
    this.host = deps.host;
    this.bus = deps.bus;
    this.config = deps.config;
    this.self = { id: getOrMakeClientId(), seat: 0, color: SEAT_COLORS[0]!, name: "P1" };
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
    return { id: this.self.id, name: this.self.name, seat: this.self.seat, color: this.self.color };
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

  private localToCanonical(localX: number, localY: number): { nx: number; ny: number } {
    const nx0 = localX / this.boardSize.width;
    const ny0 = localY / this.boardSize.height;
    const [nx, ny] = localToCanonical(nx0, ny0, this.self.seat as Seat);
    return { nx, ny };
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
      toCanonical: (lx, ly) => this.localToCanonical(lx, ly),
      pickStackUnder: (clientX, clientY) => {
        const rect = this.refs.cardsLayer.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const top = this.topCardAtCanonicalPoint(localX, localY);
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
      showContextBar: (id, x, y) => this.contextBar.show(id, x, y),
      hideContextBar: () => this.contextBar.hide(),
      emitCursor: (x, y) => {
        // hide cursor when pointer is inside our own zone
        if (this.pointInZone(this.self.seat, x, y)) return;
        // Broadcast canonical (perspective-independent) coords so peers can
        // re-project the cursor into their own rotated view.
        const rect = this.refs.cardsLayer.getBoundingClientRect();
        const { nx, ny } = this.localToCanonical(x - rect.left, y - rect.top);
        this.bus.sendCursor({ id: this.self.id, x: nx, y: ny, seat: this.self.seat });
      },
      playSfx: (name) => { void this.audio.play(name as SfxName); }
    };
    this.drag = new DragController(this.refs.cardsLayer, this.state, hooks);
  }

  private topCardAtCanonicalPoint(localX: number, localY: number): CardState | null {
    const { nx, ny } = this.localToCanonical(localX, localY);
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
      // Every card sits exactly on the Deck slot centre — a clean single pile,
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
        v: 0
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
    }
    this.state.topZ = z;
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
        const rect = this.refs.cardsLayer.getBoundingClientRect();
        const top = this.topCardAtCanonicalPoint(pt.x - rect.left, pt.y - rect.top);
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
    // identically — no "first three work then it breaks" inconsistency.
    window.addEventListener("wheel", (e) => {
      if (this.modal.isOpen()) return;
      if (this.spectator) return;
      if (this.drag && this.drag.isActive()) return;
      const pt = this.lastPointer;
      if (!pt) return;
      this.measureBoard();
      const rect = this.refs.cardsLayer.getBoundingClientRect();
      const top = this.topCardAtCanonicalPoint(pt.x - rect.left, pt.y - rect.top);
      if (!top) return; // empty space: do nothing

      e.preventDefault();
      if (this.wheelCooldown()) return;

      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Shift + scroll: rotate the card 90° in its own plane.
        const dir = e.deltaY > 0 ? 1 : -1;
        top.rot = ((((top.rot + dir) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
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
      const el = this.refs.cardsLayer.querySelector<HTMLDivElement>(`[data-id="${id}"]`);
      const c = this.state.cards.get(id);
      if (!el || !c) continue;
      const a1 = (4 + Math.random() * 4) * (Math.random() < 0.5 ? 1 : -1);
      const a2 = (3 + Math.random() * 3) * (a1 > 0 ? -1 : 1);
      // The keyframe owns the transform while shuffling, so it must carry the
      // card's translate too — otherwise it would snap to 0,0 and just spin.
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
          rot: c.rot, faceUp: c.faceUp, ownerSeat: c.ownerSeat
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
          rot: (typeof c.rot === "number" ? Math.max(0, Math.min(3, c.rot)) : 0) as 0 | 1 | 2 | 3,
          faceUp: !!c.faceUp,
          ownerSeat: typeof c.ownerSeat === "number" ? c.ownerSeat : null,
          v: 0
        };
        this.state.cards.set(cardState.id, cardState);
        const { el } = createCardElement(cardState.id, cardState.defId);
        el.style.zIndex = String(cardState.z);
        const tf = `translate3d(${cardState.x * this.boardSize.width}px, ${cardState.y * this.boardSize.height}px, 0) rotate(${cardState.rot * 90}deg)`;
        el.style.transform = tf;
        el.dataset.tf = tf;
        this.refs.cardsLayer.appendChild(el);
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
    c.rot = (((c.rot + 1) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
    this.dirtyIds.add(id);
    this.scheduleFlush();
    void this.audio.play("flip");
  }

  private flipCard(id: string): void {
    const c = this.state.cards.get(id);
    if (!c) return;
    c.faceUp = !c.faceUp;
    this.dirtyIds.add(id);
    this.scheduleFlush();
    void this.audio.play("flip");
  }

  private toggleStackFlip(id: string): void {
    const stack = findStackOverlapping(this.state, this.boardSize, id);
    if (!stack.length) return;
    // Target orientation is the inverse of the topmost (highest-z) card. This
    // keeps mixed stacks consistent and gives uniform stacks a clean toggle.
    let topCard = this.state.cards.get(id);
    for (const cid of stack) {
      const c = this.state.cards.get(cid);
      if (!c) continue;
      if (!topCard || c.z > topCard.z) topCard = c;
    }
    if (!topCard) return;
    const target = !topCard.faceUp;
    setStackFaceUp(this.state, stack, target);
    for (const cid of stack) this.dirtyIds.add(cid);
    this.scheduleFlush();
    void this.audio.play("flip");
  }

  private gatherAt(id: string): void {
    const stack = findStackOverlapping(this.state, this.boardSize, id);
    if (!stack.length) return;
    const seed = this.state.cards.get(id);
    if (seed) gatherStack(this.state, stack, seed.x, seed.y);
    for (const cid of stack) this.dirtyIds.add(cid);
    this.scheduleFlush();
    void this.audio.play("gather");
  }

  private shuffleAt(id: string): void {
    const stack = findStackOverlapping(this.state, this.boardSize, id);
    if (stack.length < 2) return;
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
    if (this.flushHandle) return;
    this.flushHandle = window.setTimeout(() => {
      this.flushHandle = 0;
      this.flush();
    }, 40);
  }

  private flush(): void {
    if (!this.dirtyIds.size) return;
    this.patchVersion++;
    const cards = Array.from(this.dirtyIds).slice(0, 200).map((id) => {
      const c = this.state.cards.get(id)!;
      c.v = this.patchVersion;
      return { id: c.id, x: c.x, y: c.y, z: c.z, rot: c.rot, faceUp: c.faceUp, ownerSeat: c.ownerSeat };
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
    const cards = Array.from(this.dragPreviewIds).slice(0, 200).map((id) => {
      const c = this.state.cards.get(id);
      if (!c) return null;
      return { id: c.id, x: c.x, y: c.y, z: c.z, rot: c.rot, faceUp: c.faceUp, ownerSeat: c.ownerSeat };
    }).filter((c): c is { id: string; x: number; y: number; z: number; rot: 0 | 1 | 2 | 3; faceUp: boolean; ownerSeat: number | null } => !!c);
    if (cards.length === 0) { this.dragPreviewIds.clear(); return; }
    this.patchVersion++;
    this.bus.sendPatch({ v: this.patchVersion, by: this.self.id, cards });
    this.dragPreviewIds.clear();
  }

  private installRealtime(): void {
    this.bus.onPresence((players) => {
      // Deterministic seating: every client sorts the full presence list by id
      // and hands seats 0..3 to the first four. Everyone computes the same map,
      // so no two clients ever believe they hold the same seat. Anyone beyond
      // the fourth becomes a read-only spectator.
      const roster = players.length ? players.slice() : [this.presencePayload()];
      if (!roster.some((p) => p.id === this.self.id)) roster.push(this.presencePayload());
      roster.sort((a, b) => a.id.localeCompare(b.id));

      this.players.clear();
      let mySeat = -1;
      roster.forEach((p, idx) => {
        const seat = idx < SEAT_COUNT ? idx : -1;
        p.seat = seat;
        p.color = seat >= 0 ? (SEAT_COLORS[seat] ?? SEAT_COLORS[0]!) : "#7a766f";
        this.players.set(p.id, p);
        if (p.id === this.self.id) mySeat = seat;
      });

      const wasSpectator = this.spectator;
      this.spectator = mySeat < 0;
      const resolvedSeat = mySeat < 0 ? 0 : mySeat; // spectators watch from seat 0
      if (resolvedSeat !== this.self.seat) {
        this.self.seat = resolvedSeat;
        this.self.color = SEAT_COLORS[resolvedSeat] ?? SEAT_COLORS[0]!;
        this.applyBoardPerspective();
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
    });
    this.bus.onGame((msg) => {
      if (msg.type === "patch" || msg.type === "snapshot") this.applyPatch(msg.payload);
      else if (msg.type === "hello" && this.players.size > 0) this.sendSnapshot();
    });
    this.bus.onCursor((c) => this.renderCursor(c));
    this.bus.onStatus((s) => {
      if (s === "online") this.sendSnapshot();
      if (s === "offline") {
        for (const el of this.cursorEls.values()) el.remove();
        this.cursorEls.clear();
      }
    });
  }

  private sendSnapshot(): void {
    this.patchVersion++;
    const cards = Array.from(this.state.cards.values()).slice(0, 200).map((c) => ({
      id: c.id, x: c.x, y: c.y, z: c.z, rot: c.rot, faceUp: c.faceUp, ownerSeat: c.ownerSeat
    }));
    this.bus.sendSnapshot({ v: this.patchVersion, by: this.self.id, cards });
  }

  private applyPatch(p: CardPatch): void {
    if (p.v < this.patchVersion - 30) return;
    this.patchVersion = Math.max(this.patchVersion, p.v);
    for (const upd of p.cards) {
      const c = this.state.cards.get(upd.id);
      if (!c) continue;
      c.x = upd.x;
      c.y = upd.y;
      c.z = upd.z;
      c.rot = upd.rot;
      c.faceUp = upd.faceUp;
      c.ownerSeat = upd.ownerSeat;
      if (c.z > this.state.topZ) this.state.topZ = c.z;
    }
  }

  private renderCursor(c: { id: string; x: number; y: number; seat: number }): void {
    if (c.id === this.self.id) return;
    // Trust the authoritative seat from presence, not the seat in the cursor
    // packet (which can lag a reseat and produce a duplicate "P2" label).
    const seat = this.players.get(c.id)?.seat ?? c.seat;
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
    if (label) label.textContent = `P${seat + 1}`;
    // c.x / c.y are canonical fractions; re-project into our own rotated view.
    const rect = this.refs.cardsLayer.getBoundingClientRect();
    const [lx, ly] = canonicalToLocal(c.x, c.y, this.self.seat as Seat);
    const px = rect.left + lx * this.boardSize.width;
    const py = rect.top + ly * this.boardSize.height;
    el.style.transform = `translate(${px}px, ${py}px)`;
  }

  private startRenderLoop(): void {
    const tick = () => {
      requestAnimationFrame(tick);
      this.renderAllCards();
    };
    tick();
  }

  private renderAllCards(): void {
    const w = this.boardSize.width;
    const h = this.boardSize.height;
    for (const c of this.state.cards.values()) {
      const el = this.refs.cardsLayer.querySelector<HTMLDivElement>(`[data-id="${c.id}"]`);
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
    }
  }

  private refreshZoneActivity(): void {
    for (let i = 0; i < this.refs.zones.length; i++) {
      const z = this.refs.zones[i]!;
      const hasPlayer = Array.from(this.players.values()).some((p) => p.seat === i);
      const isSelfSeat = i === this.self.seat;
      z.classList.toggle("zone--empty", !hasPlayer && !isSelfSeat);
      z.classList.toggle("zone--active", hasPlayer || isSelfSeat);
    }
  }

  private async handleReset(): Promise<void> {
    openLeaveConfirm(this.modal, this.room, async () => {
      void this.audio.play("ui-close");
      try { sessionStorage.removeItem(this.snapshotKey()); } catch {}
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
    this.state.topZ = 10;
    this.dirtyIds.clear();
    this.patchVersion = 0;
    for (const el of this.cursorEls.values()) el.remove();
    this.cursorEls.clear();
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

function getOrMakeClientId(): string {
  try {
    const existing = sessionStorage.getItem(SS_CLIENT_ID);
    if (existing) return existing;
  } catch {}
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  const id = "p_" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  try { sessionStorage.setItem(SS_CLIENT_ID, id); } catch {}
  return id;
}

// silence unused import warnings until used
