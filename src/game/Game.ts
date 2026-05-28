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
import {
  slotsForSeat,
  findNearestSlot,
  SNAP_RADIUS,
  BREAK_RADIUS,
  type SlotPos
} from "../table/SlotGrid.js";
import { localToCanonical, seatRotationDeg, type Seat } from "../table/rotation.js";
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
  private room = "";
  private patchVersion = 0;
  private dirtyIds = new Set<string>();
  private flushHandle = 0;
  private dragPreviewIds = new Set<string>();
  private dragPreviewHandle = 0;
  private cursorEls = new Map<string, HTMLDivElement>();
  private lastPointer: { x: number; y: number } | null = null;
  private boardSize = { width: 1, height: 1 };
  private slotsBySeat: Record<Seat, SlotPos[]> = { 0: [], 1: [], 2: [], 3: [] };

  constructor(deps: GameDeps) {
    this.host = deps.host;
    this.bus = deps.bus;
    this.config = deps.config;
    this.self = { id: getOrMakeClientId(), seat: 0, color: SEAT_COLORS[0]!, name: "P1" };
  }

  async mount(): Promise<void> {
    this.refs = buildTable(this.host);
    new Tooltip(this.refs.cardsLayer);
    this.contextBar = new ContextBar({
      onFlip: (id) => this.flipCard(id),
      onGather: (id) => this.gatherAt(id),
      onMix: (id) => this.shuffleAt(id),
      onStackToggleFlip: (id) => this.toggleStackFlip(id)
    });
    this.header = new Header({
      onRules: () => { void this.audio.play("ui-open"); openRulesModal(this.modal); },
      onSupport: () => { void this.audio.play("ui-open"); openSupportModal(this.modal, this.config.supportUrl); },
      onReset: () => { void this.audio.play("ui-open"); this.handleReset(); },
      onSettings: () => { void this.audio.play("ui-open"); openSettingsModal(this.modal, this.audio); },
      onShortcuts: () => { void this.audio.play("ui-open"); openShortcutsModal(this.modal); },
      onLangChange: () => this.onLocale()
    });
    document.body.appendChild(this.header.el);

    onLocaleChange(() => this.onLocale());

    this.room = getOrCreateRoom();
    this.header.setRoom(this.room);
    for (const s of [0, 1, 2, 3] as Seat[]) this.slotsBySeat[s] = slotsForSeat(s);

    this.measureBoard();

    const restored = this.tryRestoreSnapshot();
    if (!restored) this.initialDealLocal();

    this.bindHooks();
    this.installKeyboardAndWheel();
    this.installResizeObserver();
    this.installRealtime();
    this.installAudioBoot();
    this.installBeforeUnload();
    this.startRenderLoop();
    this.applyBoardPerspective();

    await this.bus.connect(this.room, this.presencePayload());
  }

  private presencePayload(): PresencePlayer {
    return { id: this.self.id, name: this.self.name, seat: this.self.seat, color: this.self.color };
  }

  private measureBoard(): void {
    const r = this.refs.cardsLayer.getBoundingClientRect();
    this.boardSize.width = Math.max(1, r.width);
    this.boardSize.height = Math.max(1, r.height);
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
      applySnap: (ownerSeat, nx, ny) => {
        // 1. Central dock snap (Deck + Discard). Aggressive radius so cards
        //    "cuk" into the pile; break radius is wider so picking back up
        //    is effortless.
        const dock = this.dockSnapTarget(nx, ny);
        if (dock) {
          this.setDockHot(dock.slot, true);
          return { nx: dock.nx, ny: dock.ny, snapped: true };
        }
        this.setDockHot(null, false);
        // 2. Per-seat slot snap (currently empty, kept for the future).
        if (ownerSeat >= 0) {
          const found = findNearestSlot(this.slotsBySeat[ownerSeat as Seat] || [], nx, ny, ownerSeat as Seat);
          if (found && found.dist <= SNAP_RADIUS) {
            this.highlightSlot(ownerSeat as Seat, found.slot, true);
            return { nx: found.slot.nx, ny: found.slot.ny, snapped: true };
          }
          if (!found || found.dist > BREAK_RADIUS) this.clearSlotHighlights();
        }
        return { nx, ny, snapped: false };
      },
      onCardMoved: (ids) => {
        for (const id of ids) this.dirtyIds.add(id);
        this.clearSlotHighlights();
        this.setDockHot(null, false);
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
        this.bus.sendCursor({ id: this.self.id, x, y, seat: this.self.seat });
      },
      playSfx: (name) => { void this.audio.play(name as SfxName); }
    };
    new DragController(this.refs.cardsLayer, this.state, hooks);
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

  private dockSnapTarget(nx: number, ny: number): { slot: "deck" | "discard"; nx: number; ny: number } | null {
    const SNAP = 0.07;
    const targets: Array<["deck" | "discard", DOMRect]> = [
      ["deck", this.refs.deckSlot.getBoundingClientRect()],
      ["discard", this.refs.discardSlot.getBoundingClientRect()]
    ];
    const layer = this.refs.cardsLayer.getBoundingClientRect();
    const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w")) || 96;
    const cardH = cardW * 1.45;
    let best: { slot: "deck" | "discard"; nx: number; ny: number; dist: number } | null = null;
    for (const [name, r] of targets) {
      const centreXpx = r.left + r.width / 2 - layer.left;
      const centreYpx = r.top + r.height / 2 - layer.top;
      const centreNx = (centreXpx - cardW / 2) / this.boardSize.width;
      const centreNy = (centreYpx - cardH / 2) / this.boardSize.height;
      const d = Math.hypot(centreNx - nx, centreNy - ny);
      if (d <= SNAP && (!best || d < best.dist)) {
        best = { slot: name, nx: centreNx, ny: centreNy, dist: d };
      }
    }
    if (!best) return null;
    return { slot: best.slot, nx: best.nx, ny: best.ny };
  }

  private setDockHot(target: "deck" | "discard" | null, on: boolean): void {
    this.refs.deckSlot.classList.toggle("is-hot", on && target === "deck");
    this.refs.discardSlot.classList.toggle("is-hot", on && target === "discard");
  }

  private highlightSlot(seat: Seat, slot: SlotPos, on: boolean): void {
    const marks = this.refs.slotLayer.querySelectorAll<HTMLDivElement>(`.slot-mark[data-seat="${seat}"][data-kind="${slot.kind}"]`);
    marks.forEach((m, i) => m.classList.toggle("is-hot", on && i === slot.index));
  }
  private clearSlotHighlights(): void {
    this.refs.slotLayer.querySelectorAll<HTMLDivElement>(".slot-mark.is-hot").forEach((m) => m.classList.remove("is-hot"));
  }

  private pointInZone(seat: number, x: number, y: number): boolean {
    const z = this.refs.zones[seat];
    if (!z) return false;
    const r = z.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  private initialDealLocal(): void {
    const deck = seededDeck(this.room);
    let z = 1;
    // Defer position math by two RAFs so the board has finished laying out
    // (CSS variables, perspective rotation, ResizeObserver). This keeps the
    // pile centred over the Deck slot every time.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.measureBoard();
      const slotRect = this.refs.deckSlot.getBoundingClientRect();
      const layerRect = this.refs.cardsLayer.getBoundingClientRect();
      const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w")) || 96;
      const cardH = cardW * 1.45;
      const cx = slotRect.left + slotRect.width / 2 - layerRect.left;
      const cy = slotRect.top + slotRect.height / 2 - layerRect.top;
      const baseNx = (cx - cardW / 2) / this.boardSize.width;
      const baseNy = (cy - cardH / 2) / this.boardSize.height;
      let i = 0;
      for (const c of this.state.cards.values()) {
        c.x = baseNx + (i % 6) * 0.0004;
        c.y = baseNy - i * 0.00015;
        i++;
      }
    }));
    const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w")) || 96;
    const cardH = cardW * 1.45;
    const baseNx = 0.5 - cardW / (2 * this.boardSize.width);
    const baseNy = 0.5 - cardH / (2 * this.boardSize.height);
    let i = 0;
    for (const card of deck) {
      const cardState: CardState = {
        id: card.instanceId,
        defId: card.defId,
        x: baseNx + (i % 8) * 0.0004,
        y: baseNy - i * 0.00015,
        z: z++,
        rot: 0,
        faceUp: false,
        ownerSeat: null,
        v: 0
      };
      this.state.cards.set(card.instanceId, cardState);
      const { el } = createCardElement(cardState.id, cardState.defId);
      el.style.zIndex = String(cardState.z);
      this.refs.cardsLayer.appendChild(el);
      i++;
    }
    this.state.topZ = z;
  }

  private installKeyboardAndWheel(): void {
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape" && this.modal.isOpen()) {
        e.preventDefault();
        this.modal.close();
      }
    });

    window.addEventListener("pointermove", (e) => {
      this.lastPointer = { x: e.clientX, y: e.clientY };
    }, { passive: true });

    window.addEventListener("wheel", (e) => {
      if (this.modal.isOpen()) return;
      const pt = this.lastPointer;
      if (!pt) return;
      const rect = this.refs.cardsLayer.getBoundingClientRect();
      const localX = pt.x - rect.left;
      const localY = pt.y - rect.top;
      const top = this.topCardAtCanonicalPoint(localX, localY);
      if (!top) return; // never act on empty space
      const wantStack = e.ctrlKey || e.metaKey || e.shiftKey;
      if (wantStack) {
        e.preventDefault();
        const stack = findStackOverlapping(this.state, this.boardSize, top.id);
        if (!stack.length) return;
        if (e.deltaY < 0) {
          const { nx, ny } = this.localToCanonical(localX, localY);
          gatherStack(this.state, stack, nx, ny);
          void this.audio.play("gather");
        } else {
          shuffleStack(this.state, stack);
          this.applyShuffleJitter(stack);
          void this.audio.play("shuffle");
        }
        for (const id of stack) this.dirtyIds.add(id);
        this.scheduleFlush();
      } else {
        // bare wheel over a card flips that single card
        e.preventDefault();
        top.faceUp = !top.faceUp;
        this.dirtyIds.add(top.id);
        this.scheduleFlush();
        void this.audio.play("flip");
      }
    }, { passive: false });

    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private applyShuffleJitter(ids: string[]): void {
    for (const id of ids) {
      const el = this.refs.cardsLayer.querySelector<HTMLDivElement>(`[data-id="${id}"]`);
      if (!el) continue;
      el.classList.remove("is-shuffling");
      // force reflow to restart animation
      void el.offsetWidth;
      el.classList.add("is-shuffling");
      window.setTimeout(() => el.classList.remove("is-shuffling"), 260);
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
        this.refs.cardsLayer.appendChild(el);
        if (cardState.z > z) z = cardState.z;
        z++;
      }
      this.state.topZ = z + 10;
      this.patchVersion = data.v || 0;
      return true;
    } catch { return false; }
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
      this.players.clear();
      const others = players
        .filter((p) => p.id !== this.self.id)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, 3);
      this.players.set(this.self.id, this.presencePayload());
      const seatOrder = [1, 2, 3];
      others.forEach((p, idx) => {
        p.seat = seatOrder[idx] ?? 0;
        p.color = SEAT_COLORS[p.seat] ?? SEAT_COLORS[0]!;
        this.players.set(p.id, p);
      });
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
    let el = this.cursorEls.get(c.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "cursor-ghost";
      el.style.setProperty("--cursor-color", SEAT_COLORS[c.seat] ?? SEAT_COLORS[0]!);
      el.innerHTML = `<span class="cursor-ghost__pointer"></span><span class="cursor-ghost__label">P${c.seat + 1}</span>`;
      document.body.appendChild(el);
      this.cursorEls.set(c.id, el);
    }
    el.style.transform = `translate(${c.x}px, ${c.y}px)`;
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
        el.style.transform = `translate3d(${c.x * w}px, ${c.y * h}px, 0) rotate(${c.rot * 90}deg)`;
      }
      el.style.zIndex = String(c.z);
      el.classList.toggle("is-faceup", c.faceUp);
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
