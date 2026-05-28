import { buildTable, refreshLabels, type BoardRefs } from "../table/Board.js";
import { createCardElement, refreshCardLabel } from "../table/Card.js";
import type { BoardState, CardState, SelfPlayer } from "../table/types.js";
import { DragController, type DragHooks } from "../table/DragController.js";
import { Tooltip } from "../ui/Tooltip.js";
import { Header } from "../ui/Header.js";
import { Modal } from "../ui/Modal.js";
import { openRulesModal } from "../ui/RulesModal.js";
import { openSupportModal } from "../ui/SupportModal.js";
import { openLeaveConfirm } from "../ui/LeaveConfirm.js";
import { openShortcutsModal, mountShortcutsFab } from "../ui/ShortcutsPanel.js";
import { openSettingsModal } from "../ui/SettingsModal.js";
import { ContextBar } from "../ui/ContextBar.js";
import { toast } from "../ui/Toast.js";
import { t, onLocaleChange } from "../i18n/index.js";
import { getOrCreateRoom, newRoom } from "../net/room.js";
import { seededDeck } from "./deck.js";
import {
  findStackOverlapping,
  topCardAtPoint,
  gatherStack,
  shuffleStack,
  setStackFaceUp
} from "../table/StackOps.js";
import type { RealtimeBus, PresencePlayer, CardPatch } from "../net/realtime.js";
import type { RuntimeConfig } from "../net/config.js";
import { AudioEngine, type SfxName } from "../audio/Audio.js";

const SEAT_COUNT = 4;
const SEAT_COLORS = ["#f3efe5", "#7cc4d0", "#d690ac", "#a8b67e"];

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

  constructor(deps: GameDeps) {
    this.host = deps.host;
    this.bus = deps.bus;
    this.config = deps.config;
    this.self = { id: makeClientId(), seat: 0, color: SEAT_COLORS[0]!, name: "You" };
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
      onLangChange: () => this.onLocale()
    });
    document.body.appendChild(this.header.el);
    mountShortcutsFab(document.body, () => { void this.audio.play("ui-open"); openShortcutsModal(this.modal); });

    onLocaleChange(() => this.onLocale());

    this.room = getOrCreateRoom();
    this.header.setRoom(this.room);
    this.measureBoard();
    this.initialDealLocal();
    this.bindHooks();
    this.installKeyboardAndWheel();
    this.installResizeObserver();
    this.installRealtime();
    this.installAudioBoot();
    this.startRenderLoop();
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
      pickStack: (id) => findStackOverlapping(this.state, this.boardSize, id),
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
      emitCursor: (x, y) => this.bus.sendCursor({ id: this.self.id, x, y, seat: this.self.seat }),
      playSfx: (name) => { void this.audio.play(name as SfxName); }
    };
    new DragController(this.refs.cardsLayer, this.state, hooks);
  }

  private pointInZone(seat: number, x: number, y: number): boolean {
    const z = this.refs.zones[seat];
    if (!z) return false;
    const r = z.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  private initialDealLocal(): void {
    const deck = seededDeck(this.room);
    requestAnimationFrame(() => {
      this.measureBoard();
      const slot = this.refs.deckSlot.getBoundingClientRect();
      const layer = this.refs.cardsLayer.getBoundingClientRect();
      const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w")) || 96;
      const cardH = cardW * 1.45;
      const baseLeftPx = slot.left - layer.left + (slot.width - cardW) / 2;
      const baseTopPx = slot.top - layer.top + (slot.height - cardH) / 2;
      const nx = baseLeftPx / this.boardSize.width;
      const ny = baseTopPx / this.boardSize.height;
      let i = 0;
      for (const c of this.state.cards.values()) {
        c.x = nx + (i % 6) * 0.0006;
        c.y = ny - i * 0.0003;
        i++;
      }
      this.updateCounts();
    });
    let z = 1;
    for (const card of deck) {
      const cardState: CardState = {
        id: card.instanceId,
        defId: card.defId,
        x: 0.45,
        y: 0.45,
        z: z++,
        faceUp: false,
        ownerSeat: null,
        v: 0
      };
      this.state.cards.set(card.instanceId, cardState);
      const { el } = createCardElement(cardState.id, cardState.defId);
      el.style.zIndex = String(cardState.z);
      this.refs.cardsLayer.appendChild(el);
    }
    this.state.topZ = z;
    this.updateCounts();
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

    // Ctrl + wheel: gather (up) / shuffle (down). Suppress browser zoom.
    window.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (this.modal.isOpen()) return;
      e.preventDefault();
      const pt = this.lastPointer;
      if (!pt) return;
      const top = topCardAtPoint(this.state, this.refs.cardsLayer, pt.x, pt.y);
      if (!top) return;
      const stack = findStackOverlapping(this.state, this.boardSize, top.id);
      if (!stack.length) return;
      if (e.deltaY < 0) {
        gatherStack(this.state, stack);
        void this.audio.play("gather");
      } else {
        shuffleStack(this.state, stack);
        void this.audio.play("shuffle");
      }
      for (const id of stack) this.dirtyIds.add(id);
      this.scheduleFlush();
    }, { passive: false });

    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private installResizeObserver(): void {
    const ro = new ResizeObserver(() => {
      this.measureBoard();
      this.renderAllCards();
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
    let up = 0;
    let down = 0;
    for (const cid of stack) {
      const c = this.state.cards.get(cid);
      if (!c) continue;
      if (c.faceUp) up++; else down++;
    }
    // mixed → all face-down; uniform → flip
    const target = up === stack.length ? false : down === stack.length ? true : false;
    setStackFaceUp(this.state, stack, target);
    for (const cid of stack) this.dirtyIds.add(cid);
    this.scheduleFlush();
    void this.audio.play("flip");
  }

  private gatherAt(id: string): void {
    const stack = findStackOverlapping(this.state, this.boardSize, id);
    gatherStack(this.state, stack);
    for (const cid of stack) this.dirtyIds.add(cid);
    this.scheduleFlush();
    void this.audio.play("gather");
  }

  private shuffleAt(id: string): void {
    const stack = findStackOverlapping(this.state, this.boardSize, id);
    shuffleStack(this.state, stack);
    for (const cid of stack) this.dirtyIds.add(cid);
    this.scheduleFlush();
    void this.audio.play("shuffle");
  }

  private scheduleFlush(): void {
    if (this.flushHandle) return;
    this.flushHandle = window.setTimeout(() => {
      this.flushHandle = 0;
      this.flush();
    }, 50);
  }

  private flush(): void {
    if (!this.dirtyIds.size) {
      this.updateCounts();
      return;
    }
    this.patchVersion++;
    const cards = Array.from(this.dirtyIds).slice(0, 200).map((id) => {
      const c = this.state.cards.get(id)!;
      c.v = this.patchVersion;
      return { id: c.id, x: c.x, y: c.y, z: c.z, faceUp: c.faceUp, ownerSeat: c.ownerSeat };
    });
    const patch: CardPatch = { v: this.patchVersion, by: this.self.id, cards };
    this.bus.sendPatch(patch);
    this.dirtyIds.clear();
    this.updateCounts();
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
      return { id: c.id, x: c.x, y: c.y, z: c.z, faceUp: c.faceUp, ownerSeat: c.ownerSeat };
    }).filter((c): c is { id: string; x: number; y: number; z: number; faceUp: boolean; ownerSeat: number | null } => !!c);
    if (cards.length === 0) {
      this.dragPreviewIds.clear();
      return;
    }
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
      id: c.id,
      x: c.x,
      y: c.y,
      z: c.z,
      faceUp: c.faceUp,
      ownerSeat: c.ownerSeat
    }));
    this.bus.sendSnapshot({ v: this.patchVersion, by: this.self.id, cards });
  }

  private applyPatch(p: CardPatch): void {
    if (p.v < this.patchVersion - 30) return; // ignore very stale
    this.patchVersion = Math.max(this.patchVersion, p.v);
    for (const upd of p.cards) {
      const c = this.state.cards.get(upd.id);
      if (!c) continue;
      c.x = upd.x;
      c.y = upd.y;
      c.z = upd.z;
      c.faceUp = upd.faceUp;
      c.ownerSeat = upd.ownerSeat;
      if (c.z > this.state.topZ) this.state.topZ = c.z;
    }
    this.updateCounts();
  }

  private renderCursor(c: { id: string; x: number; y: number; seat: number }): void {
    if (c.id === this.self.id) return;
    let el = this.cursorEls.get(c.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "cursor-ghost";
      el.style.setProperty("--cursor-color", SEAT_COLORS[c.seat] ?? SEAT_COLORS[0]!);
      el.innerHTML = `
        <span class="cursor-ghost__pointer"></span>
        <span class="cursor-ghost__label">P${c.seat + 1}</span>
      `;
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
      if (!el.classList.contains("is-held")) {
        el.style.transform = `translate3d(${c.x * w}px, ${c.y * h}px, 0)`;
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

  private updateCounts(): void {
    let deck = 0;
    let discard = 0;
    const zoneCounts = [0, 0, 0, 0];
    for (const c of this.state.cards.values()) {
      if (c.ownerSeat !== null && c.ownerSeat >= 0 && c.ownerSeat < 4) {
        zoneCounts[c.ownerSeat]!++;
      }
      const inDock = this.isOverSlot(c);
      if (inDock === "deck") deck++;
      else if (inDock === "discard") discard++;
    }
    this.setDockValue(this.refs.deckSlot, deck);
    this.setDockValue(this.refs.discardSlot, discard);
    for (let i = 0; i < 4; i++) {
      const node = this.refs.zones[i]?.querySelector<HTMLElement>('[data-role="count"]');
      if (node) node.textContent = String(zoneCounts[i]);
    }
  }

  private setDockValue(slot: HTMLDivElement, n: number): void {
    const valEl = slot.querySelector<HTMLElement>(".dock__value");
    if (valEl) valEl.textContent = String(n);
    slot.setAttribute("data-has", n > 0 ? "true" : "false");
  }

  private isOverSlot(c: CardState): "deck" | "discard" | null {
    const layer = this.refs.cardsLayer.getBoundingClientRect();
    const slots: Array<["deck" | "discard", DOMRect]> = [
      ["deck", this.refs.deckSlot.getBoundingClientRect()],
      ["discard", this.refs.discardSlot.getBoundingClientRect()]
    ];
    const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w")) || 96;
    const cardH = cardW * 1.45;
    const cx = c.x * this.boardSize.width + cardW / 2 + layer.left;
    const cy = c.y * this.boardSize.height + cardH / 2 + layer.top;
    for (const [name, r] of slots) {
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return name;
    }
    return null;
  }

  private async handleReset(): Promise<void> {
    openLeaveConfirm(this.modal, this.room, async () => {
      void this.audio.play("ui-close");
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

function makeClientId(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return "p_" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
