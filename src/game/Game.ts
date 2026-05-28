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
import { ContextBar } from "../ui/ContextBar.js";
import { toast } from "../ui/Toast.js";
import { t, onLocaleChange } from "../i18n/index.js";
import { getOrCreateRoom, newRoom } from "../net/room.js";
import { seededDeck } from "./deck.js";
import { findStack, findStackAtPoint, gatherStack, shuffleStack, setStackFaceUp } from "../table/StackOps.js";
import type { RealtimeBus, PresencePlayer, CardPatch } from "../net/realtime.js";
import type { RuntimeConfig } from "../net/config.js";

const SEAT_COUNT = 4;
const SEAT_COLORS = ["#c8a45a", "#6cb6c0", "#c87a9a", "#9aa86c"];

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
  private room = "";
  private patchVersion = 0;
  private dirtyIds = new Set<string>();
  private flushHandle = 0;
  private cursorEls = new Map<string, HTMLDivElement>();

  constructor(deps: GameDeps) {
    this.host = deps.host;
    this.bus = deps.bus;
    this.config = deps.config;
    this.self = {
      id: makeClientId(),
      seat: 0,
      color: SEAT_COLORS[0]!,
      name: "You"
    };
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
      onRules: () => openRulesModal(this.modal),
      onSupport: () => openSupportModal(this.modal, this.config.supportUrl),
      onLeave: () => this.handleLeave(),
      onLangChange: () => this.onLocale()
    });
    document.body.appendChild(this.header.el);
    mountShortcutsFab(document.body, () => openShortcutsModal(this.modal));

    onLocaleChange(() => this.onLocale());

    this.room = getOrCreateRoom();
    this.header.setRoom(this.room);
    this.initialDealLocal();
    this.bindHooks();
    this.installKeyboard();
    this.installRealtime();
    this.startRenderLoop();
    await this.bus.connect(this.room, this.presencePayload());
  }

  private presencePayload(): PresencePlayer {
    return { id: this.self.id, name: this.self.name, seat: this.self.seat, color: this.self.color };
  }

  private bindHooks(): void {
    const hooks: DragHooks = {
      getSelfSeat: () => this.self.seat,
      isOpponentZone: (seat) => seat !== this.self.seat && seat >= 0 && seat < SEAT_COUNT,
      zoneRectForSeat: (seat) => this.refs.zones[seat]?.getBoundingClientRect() ?? null,
      pointInSelfZone: (x, y) => this.pointInZone(this.self.seat, x, y),
      pointInOpponentZone: (x, y) => {
        for (let i = 0; i < SEAT_COUNT; i++) {
          if (i === this.self.seat) continue;
          if (this.pointInZone(i, x, y)) return i;
        }
        return null;
      },
      pickStack: (id) => findStack(this.state, id),
      onCardMoved: (ids) => {
        for (const id of ids) this.dirtyIds.add(id);
        this.scheduleFlush();
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
      emitCursor: (x, y) => this.bus.sendCursor({ id: this.self.id, x, y, seat: this.self.seat })
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
    // Align the starting pile under the centre Deck slot
    requestAnimationFrame(() => {
      const layer = this.refs.cardsLayer.getBoundingClientRect();
      const slot = this.refs.deckSlot.getBoundingClientRect();
      const cardW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w")) || 96;
      const cardH = cardW * 1.45;
      const baseX = slot.left - layer.left + (slot.width - cardW) / 2;
      const baseY = slot.top - layer.top + (slot.height - cardH) / 2;
      let i = 0;
      for (const c of this.state.cards.values()) {
        c.x = baseX + (i % 6) * 0.4;
        c.y = baseY - i * 0.2;
        i++;
      }
      this.updateCounts();
    });
    let z = 1;
    for (const card of deck) {
      const cardState: CardState = {
        id: card.instanceId,
        defId: card.defId,
        x: 0,
        y: 0,
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

  private installKeyboard(): void {
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (this.modal.isOpen()) return;
      const k = e.key.toLowerCase();
      const pt = this.lastPointer;
      if (!pt) return;
      const stack = findStackAtPoint(this.state, this.refs.cardsLayer, pt.x, pt.y);
      if (k === "f") {
        const top = stack[stack.length - 1];
        if (top) this.flipCard(top);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (k === "g") {
          e.preventDefault();
          if (stack.length) {
            gatherStack(this.state, stack);
            for (const id of stack) this.dirtyIds.add(id);
            this.scheduleFlush();
          }
          return;
        }
        if (k === "m") {
          e.preventDefault();
          if (stack.length) {
            shuffleStack(this.state, stack);
            for (const id of stack) this.dirtyIds.add(id);
            this.scheduleFlush();
          }
          return;
        }
      }
    });
    window.addEventListener("pointermove", (e) => {
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  private lastPointer: { x: number; y: number } | null = null;

  private flipCard(id: string): void {
    const c = this.state.cards.get(id);
    if (!c) return;
    c.faceUp = !c.faceUp;
    this.dirtyIds.add(id);
    this.scheduleFlush();
  }

  private toggleStackFlip(id: string): void {
    const stack = findStack(this.state, id);
    if (!stack.length) return;
    let up = 0;
    let down = 0;
    for (const cid of stack) {
      const c = this.state.cards.get(cid);
      if (!c) continue;
      if (c.faceUp) up++; else down++;
    }
    // mixed → all face-down; if uniform, toggle to the opposite
    const targetFaceUp = up === stack.length ? false : up > 0 && down > 0 ? false : true;
    setStackFaceUp(this.state, stack, targetFaceUp);
    for (const cid of stack) this.dirtyIds.add(cid);
    this.scheduleFlush();
  }

  private gatherAt(id: string): void {
    const stack = findStack(this.state, id);
    gatherStack(this.state, stack);
    for (const cid of stack) this.dirtyIds.add(cid);
    this.scheduleFlush();
  }

  private shuffleAt(id: string): void {
    const stack = findStack(this.state, id);
    shuffleStack(this.state, stack);
    for (const cid of stack) this.dirtyIds.add(cid);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushHandle) return;
    this.flushHandle = window.setTimeout(() => {
      this.flushHandle = 0;
      this.flush();
    }, 60);
  }

  private flush(): void {
    if (!this.dirtyIds.size) return;
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

  private installRealtime(): void {
    this.bus.onPresence((players) => {
      this.players.clear();
      // assign seats: keep mine seat=0, others by order
      const others = players.filter((p) => p.id !== this.self.id).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 3);
      this.players.set(this.self.id, this.presencePayload());
      const seatOrder = [1, 2, 3];
      others.forEach((p, idx) => {
        p.seat = seatOrder[idx] ?? 0;
        p.color = SEAT_COLORS[p.seat] ?? "#c8a45a";
        this.players.set(p.id, p);
      });
      this.refreshZoneActivity();
    });
    this.bus.onGame((msg) => {
      if (msg.type === "patch" || msg.type === "snapshot") {
        this.applyPatch(msg.payload);
      } else if (msg.type === "hello" && this.players.size > 0) {
        this.sendSnapshot();
      }
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
    if (p.v < this.patchVersion) return;
    this.patchVersion = p.v;
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
      el.style.setProperty("--cursor-color", SEAT_COLORS[c.seat] ?? "#c8a45a");
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
      for (const c of this.state.cards.values()) {
        const el = this.refs.cardsLayer.querySelector<HTMLDivElement>(`[data-id="${c.id}"]`);
        if (!el) continue;
        if (!el.classList.contains("is-held")) {
          el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0)`;
        }
        el.style.zIndex = String(c.z);
        el.classList.toggle("is-faceup", c.faceUp);
        const hidden = c.ownerSeat !== null && c.ownerSeat !== this.self.seat && c.faceUp;
        el.classList.toggle("is-concealed", hidden);
      }
    };
    tick();
  }

  private refreshZoneActivity(): void {
    for (let i = 0; i < this.refs.zones.length; i++) {
      const z = this.refs.zones[i]!;
      const hasPlayer = Array.from(this.players.values()).some((p) => p.seat === i);
      z.classList.toggle("zone--empty", !hasPlayer);
      z.classList.toggle("zone--active", hasPlayer);
    }
  }

  private updateCounts(): void {
    let deck = 0;
    let open = 0;
    let discard = 0;
    const zoneCounts = [0, 0, 0, 0];
    for (const c of this.state.cards.values()) {
      if (c.ownerSeat !== null && c.ownerSeat >= 0 && c.ownerSeat < 4) {
        zoneCounts[c.ownerSeat]!++;
      }
      const inDock = this.isOverSlot(c);
      if (inDock === "deck") deck++;
      else if (inDock === "open") open++;
      else if (inDock === "discard") discard++;
    }
    this.refs.deckSlot.querySelector<HTMLElement>('[data-role="deck-count"]')!.textContent = String(deck);
    this.refs.openSlot.querySelector<HTMLElement>('[data-role="open-count"]')!.textContent = String(open);
    this.refs.discardSlot.querySelector<HTMLElement>('[data-role="discard-count"]')!.textContent = String(discard);
    for (let i = 0; i < 4; i++) {
      const node = this.refs.zones[i]?.querySelector<HTMLElement>(".zone__count");
      if (node) node.textContent = String(zoneCounts[i]);
    }
  }

  private isOverSlot(c: CardState): "deck" | "open" | "discard" | null {
    const board = this.refs.cardsLayer.getBoundingClientRect();
    const slots: Array<["deck" | "open" | "discard", DOMRect]> = [
      ["deck", this.refs.deckSlot.getBoundingClientRect()],
      ["open", this.refs.openSlot.getBoundingClientRect()],
      ["discard", this.refs.discardSlot.getBoundingClientRect()]
    ];
    const w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-w"));
    const cardW = Number.isFinite(w) ? w : 96;
    const cx = c.x + cardW / 2 + board.left;
    const cy = c.y + cardW * 0.725 + board.top;
    for (const [name, r] of slots) {
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return name;
    }
    return null;
  }

  private async handleLeave(): Promise<void> {
    openLeaveConfirm(this.modal, this.room, async () => {
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
