import { expandDeck, iconSvg, TYPE_META } from "./cards.js";
import { RULES_HTML, supportHtml, leaveConfirmHtml } from "./rules.js";
import { RealtimeBus, loadConfig } from "./net.js";

const PLAYER_COLORS = ["#d8b762", "#80a7ff", "#61c58a", "#d66f8f"];
const STACK_RADIUS = 120;
const SNAP_OFFSET = 0.004;
const CURSOR_THROTTLE_MS = 55;

const els = {
  board: document.getElementById("board"),
  cursorLayer: document.getElementById("cursorLayer"),
  roomCode: document.getElementById("roomCode"),
  syncStatus: document.getElementById("syncStatus"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  rulesBtn: document.getElementById("rulesBtn"),
  supportBtn: document.getElementById("supportBtn"),
  leaveBtn: document.getElementById("leaveBtn"),
  modalLayer: document.getElementById("modalLayer"),
  modalContent: document.getElementById("modalContent"),
  modalClose: document.getElementById("modalClose"),
  toast: document.getElementById("toast"),
  zones: {
    bottom: document.getElementById("zoneBottom"),
    top: document.getElementById("zoneTop"),
    left: document.getElementById("zoneLeft"),
    right: document.getElementById("zoneRight")
  }
};

const app = {
  roomId: getOrCreateRoomId(),
  player: getOrCreatePlayer(),
  config: null,
  bus: null,
  cards: [],
  version: 0,
  elements: new Map(),
  remoteCursors: new Map(),
  players: new Map(),
  pointer: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  drag: null,
  selectedIds: new Set(),
  tooltip: null,
  tooltipTimer: null,
  longPressTimer: null,
  lastCursorSent: 0,
  snapshotTimer: null
};

bootstrap();

async function bootstrap() {
  app.config = await loadConfig();
  app.cards = createInitialCards(app.roomId);
  app.players.set(app.player.id, app.player);
  els.roomCode.textContent = app.roomId;

  createTooltip();
  renderZones();
  renderCards(true);
  attachEvents();

  app.bus = new RealtimeBus({
    roomId: app.roomId,
    player: app.player,
    config: app.config,
    onGame: handleRemoteGame,
    onCursor: handleRemoteCursor,
    onPresence: handlePresence,
    onStatus: (_kind, label) => {
      els.syncStatus.textContent = label;
    }
  });

  await app.bus.connect();
  showToast(app.bus.connected ? "Realtime ready. Link paylaşarak arkadaşlarını çağırabilirsin." : "Local mode. Supabase ENV eklenirse linkler gerçek zamanlı çalışır.");
}

function getOrCreateRoomId() {
  const url = new URL(window.location.href);
  const existing = url.searchParams.get("room");
  if (existing && /^[a-z0-9-]{4,28}$/i.test(existing)) return existing.toUpperCase();
  const room = `KBL-${makeId(6)}`;
  url.searchParams.set("room", room);
  window.history.replaceState({}, "", url.toString());
  return room;
}

function getOrCreatePlayer() {
  const storageKey = "kabal-mvp-player-v1";
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
  } catch {
    saved = null;
  }
  if (saved?.id) return saved;

  const player = {
    id: `p_${makeId(10).toLowerCase()}`,
    name: `Player ${makeId(2)}`,
    color: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)],
    joinedAt: Date.now()
  };
  sessionStorage.setItem(storageKey, JSON.stringify(player));
  return player;
}

function makeId(length) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  crypto.getRandomValues(new Uint8Array(length)).forEach((n) => {
    id += alphabet[n % alphabet.length];
  });
  return id;
}

function createInitialCards(roomId) {
  const deck = expandDeck();
  const rng = mulberry32(hashString(roomId));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  const deckX = 0.5 - getCardWidthRatio() - 0.016;
  const deckY = 0.5 - getCardHeightRatio() / 2;
  return deck.map((card, index) => ({
    ...card,
    x: clamp01(deckX + index * 0.00022),
    y: clamp01(deckY - index * 0.00022),
    rx: 0.5,
    ry: 0.5,
    ownerId: null,
    faceUp: false,
    z: index + 1,
    angle: (rng() - 0.5) * 1.5
  }));
}

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function rng() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function attachEvents() {
  window.addEventListener("resize", () => renderCards(false));
  window.addEventListener("pointermove", handlePointerMove, { passive: false });
  window.addEventListener("pointerup", handlePointerUp, { passive: false });
  window.addEventListener("pointercancel", handlePointerUp, { passive: false });
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopDragging();
  });

  els.copyLinkBtn.addEventListener("click", copyInviteLink);
  els.rulesBtn.addEventListener("click", () => openModal(RULES_HTML));
  els.supportBtn.addEventListener("click", () => openModal(supportHtml(app.config?.supportUrl)));
  els.leaveBtn.addEventListener("click", () => openModal(leaveConfirmHtml(), wireLeaveConfirm));
  els.modalClose.addEventListener("click", closeModal);
  els.modalLayer.addEventListener("pointerdown", (event) => {
    if (event.target === els.modalLayer) closeModal();
  });
}

function renderCards(createMissing = false) {
  for (const card of app.cards) {
    let el = app.elements.get(card.id);
    if (!el && createMissing) {
      el = createCardElement(card);
      app.elements.set(card.id, el);
      els.board.appendChild(el);
    }
    if (!el) continue;
    syncCardElement(el, card);
  }
}

function createCardElement(card) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "card";
  el.dataset.cardId = card.id;
  el.setAttribute("aria-label", card.name);
  el.innerHTML = `
    <span class="card-inner">
      <span class="card-face card-front">
        <span class="card-topline">
          <span class="card-type-icon" data-tip="type">${iconSvg(card.typeIcon)}</span>
          <span class="card-seal-icon" data-tip="seal">${iconSvg("seal")}</span>
        </span>
        <span class="card-body">
          <span class="card-name-icon" data-tip="power">${iconSvg(card.icon)}</span>
          <span class="card-title">${escapeHtml(card.name)}</span>
        </span>
        <span class="card-footer">${escapeHtml(TYPE_META[card.type].en)}</span>
      </span>
      <span class="card-face card-back"><span class="back-mark">K</span></span>
    </span>
  `;

  el.addEventListener("pointerdown", handleCardPointerDown, { passive: false });
  el.querySelectorAll("[data-tip]").forEach((tip) => {
    tip.addEventListener("pointerenter", (event) => handleTipPointerEnter(event, card.id));
    tip.addEventListener("pointerleave", hideTooltip);
  });
  return el;
}

function syncCardElement(el, card) {
  const isConcealed = card.ownerId && card.ownerId !== app.player.id;
  const pos = getCardScreenPosition(card);
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  el.style.zIndex = String(card.z);
  el.style.setProperty("--type-color", card.typeColor);
  el.style.setProperty("--accent-color", card.accent);
  el.style.transform = `rotate(${card.angle || 0}deg)`;
  el.classList.toggle("is-face-down", !card.faceUp);
  el.classList.toggle("is-concealed", Boolean(isConcealed));
  el.classList.toggle("is-locked", Boolean(isConcealed));
  el.classList.toggle("is-selected", app.selectedIds.has(card.id));
  el.setAttribute("aria-label", isConcealed ? "Concealed card" : card.name);
}

function getCardScreenPosition(card) {
  if (card.ownerId) {
    const zone = getZoneForOwner(card.ownerId);
    const rect = zone.getBoundingClientRect();
    const cardW = getCardWidth();
    const cardH = getCardHeight();
    const x = rect.left + clamp01(card.rx) * Math.max(0, rect.width - cardW);
    const y = rect.top + clamp01(card.ry) * Math.max(0, rect.height - cardH);
    return { x, y };
  }
  return {
    x: card.x * window.innerWidth,
    y: card.y * window.innerHeight
  };
}

function getZoneForOwner(ownerId) {
  if (ownerId === app.player.id) return els.zones.bottom;
  const seat = getRemoteSeat(ownerId);
  return els.zones[seat] || els.zones.top;
}

function getRemoteSeat(playerId) {
  const remotes = Array.from(app.players.values())
    .filter((player) => player.id !== app.player.id)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const idx = Math.max(0, remotes.findIndex((player) => player.id === playerId));
  return ["top", "left", "right"][idx] || "top";
}

function renderZones() {
  els.zones.bottom.style.setProperty("--seat-color", app.player.color);
  els.zones.bottom.classList.remove("is-empty");
  els.zones.bottom.querySelector(".zone-label").textContent = "Your hand";

  const remoteSeats = { top: null, left: null, right: null };
  for (const player of app.players.values()) {
    if (player.id === app.player.id) continue;
    remoteSeats[getRemoteSeat(player.id)] = player;
  }

  for (const seat of ["top", "left", "right"]) {
    const zone = els.zones[seat];
    const player = remoteSeats[seat];
    if (player) {
      zone.style.setProperty("--seat-color", player.color);
      zone.classList.remove("is-empty");
      zone.querySelector(".zone-label").textContent = player.name || "Player";
    } else {
      zone.style.setProperty("--seat-color", "rgba(255,255,255,0.14)");
      zone.classList.add("is-empty");
      zone.querySelector(".zone-label").textContent = "Waiting";
    }
  }
}

function handleCardPointerDown(event) {
  const el = event.currentTarget;
  const card = getCard(el.dataset.cardId);
  if (!card || isLocked(card)) return;
  event.preventDefault();
  hideTooltip();

  if (event.button === 2) {
    flipCards([card.id]);
    return;
  }

  if (event.button !== 0) return;

  clearTimeout(app.longPressTimer);
  app.longPressTimer = setTimeout(() => {
    if (!app.drag || app.drag.moved) return;
    flipCards([card.id]);
    stopDragging();
  }, 560);

  const activeIds = (event.ctrlKey || event.metaKey) ? findStackIds(card) : [card.id];
  startDragging(event, activeIds);
}

function startDragging(event, ids) {
  const uniqueIds = [...new Set(ids)].filter((id) => {
    const card = getCard(id);
    return card && !isLocked(card);
  });
  if (!uniqueIds.length) return;

  app.selectedIds = new Set(uniqueIds);
  const starts = uniqueIds.map((id) => {
    const card = getCard(id);
    const pos = getCardScreenPosition(card);
    const el = app.elements.get(id);
    el.classList.add("is-dragging");
    return {
      id,
      x: pos.x,
      y: pos.y,
      original: { ownerId: card.ownerId, x: card.x, y: card.y, rx: card.rx, ry: card.ry }
    };
  });

  app.drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    starts
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  renderCards(false);
}

function handlePointerMove(event) {
  app.pointer = { x: event.clientX, y: event.clientY };
  sendCursorThrottled(event.clientX, event.clientY);

  if (!app.drag) return;
  event.preventDefault();
  const dx = event.clientX - app.drag.startX;
  const dy = event.clientY - app.drag.startY;
  if (Math.abs(dx) + Math.abs(dy) > 4) app.drag.moved = true;

  for (const item of app.drag.starts) {
    const el = app.elements.get(item.id);
    if (!el) continue;
    el.style.left = `${item.x + dx}px`;
    el.style.top = `${item.y + dy}px`;
  }
}

function handlePointerUp(event) {
  clearTimeout(app.longPressTimer);
  if (!app.drag) return;
  event.preventDefault();

  const patches = [];
  const dx = event.clientX - app.drag.startX;
  const dy = event.clientY - app.drag.startY;
  const ownZone = els.zones.bottom.getBoundingClientRect();
  const opponentSeat = getOpponentSeatAt(event.clientX, event.clientY);

  if (opponentSeat) {
    rejectZone(opponentSeat);
    for (const item of app.drag.starts) {
      const el = app.elements.get(item.id);
      if (el) {
        el.style.left = `${item.x}px`;
        el.style.top = `${item.y}px`;
      }
    }
    showToast("Rakip alanına doğrudan kart bırakılamaz. Sınırına bırak; oyuncu kendisi içeri alsın.");
    stopDragging(false);
    return;
  }

  for (const item of app.drag.starts) {
    const card = getCard(item.id);
    if (!card) continue;
    const newLeft = item.x + dx;
    const newTop = item.y + dy;
    const centerX = newLeft + getCardWidth() / 2;
    const centerY = newTop + getCardHeight() / 2;

    card.z = nextZ();
    if (pointInRect(centerX, centerY, ownZone)) {
      card.ownerId = app.player.id;
      card.rx = clamp01((newLeft - ownZone.left) / Math.max(1, ownZone.width - getCardWidth()));
      card.ry = clamp01((newTop - ownZone.top) / Math.max(1, ownZone.height - getCardHeight()));
    } else {
      card.ownerId = null;
      card.x = clamp01(newLeft / window.innerWidth);
      card.y = clamp01(newTop / window.innerHeight);
    }
    patches.push(compactCardPatch(card));
  }

  stopDragging(true);
  commitPatches(patches, "move");
}

function stopDragging(clearSelection = true) {
  clearTimeout(app.longPressTimer);
  if (app.drag) {
    for (const item of app.drag.starts) {
      app.elements.get(item.id)?.classList.remove("is-dragging");
    }
  }
  app.drag = null;
  if (clearSelection) app.selectedIds.clear();
  renderCards(false);
}

function handleKeyDown(event) {
  if (event.key === "Escape") {
    closeModal();
    stopDragging();
    return;
  }

  const target = getTopCardAtPoint(app.pointer.x, app.pointer.y);
  if (!target || isLocked(target)) return;

  const key = event.key.toLowerCase();
  if (key === "f") {
    event.preventDefault();
    flipCards([target.id]);
  }
  if ((event.ctrlKey || event.metaKey) && key === "g") {
    event.preventDefault();
    gatherStack(target);
  }
  if ((event.ctrlKey || event.metaKey) && key === "m") {
    event.preventDefault();
    mixStack(target);
  }
}

function flipCards(ids) {
  const patches = [];
  for (const id of ids) {
    const card = getCard(id);
    if (!card || isLocked(card)) continue;
    card.faceUp = !card.faceUp;
    card.z = nextZ();
    patches.push(compactCardPatch(card));
  }
  commitPatches(patches, "flip");
}

function gatherStack(target) {
  const ids = findStackIds(target, STACK_RADIUS * 1.15);
  const base = getCardScreenPosition(target);
  const patches = [];
  ids.forEach((id, index) => {
    const card = getCard(id);
    if (!card || isLocked(card)) return;
    const left = base.x + index * 0.35;
    const top = base.y - index * 0.35;
    applyScreenPosition(card, left, top, target.ownerId === app.player.id);
    card.angle = 0;
    card.z = nextZ();
    patches.push(compactCardPatch(card));
  });
  commitPatches(patches, "gather");
  showToast(`${ids.length} kart toparlandı.`);
}

function mixStack(target) {
  const ids = findStackIds(target, STACK_RADIUS * 1.35);
  const center = getCardScreenPosition(target);
  const rng = mulberry32(Date.now() ^ hashString(target.id));
  const patches = [];
  ids.forEach((id, index) => {
    const card = getCard(id);
    if (!card || isLocked(card)) return;
    const left = center.x + (rng() - 0.5) * 18;
    const top = center.y + (rng() - 0.5) * 18;
    applyScreenPosition(card, left, top, target.ownerId === app.player.id);
    card.angle = (rng() - 0.5) * 9;
    card.z = nextZ() + index;
    patches.push(compactCardPatch(card));
  });
  commitPatches(patches, "mix");
  showToast(`${ids.length} kart karıştırıldı.`);
}

function applyScreenPosition(card, left, top, keepOwned) {
  if (keepOwned && card.ownerId === app.player.id) {
    const rect = els.zones.bottom.getBoundingClientRect();
    card.rx = clamp01((left - rect.left) / Math.max(1, rect.width - getCardWidth()));
    card.ry = clamp01((top - rect.top) / Math.max(1, rect.height - getCardHeight()));
  } else {
    card.ownerId = null;
    card.x = clamp01(left / window.innerWidth);
    card.y = clamp01(top / window.innerHeight);
  }
}

function findStackIds(target, radius = STACK_RADIUS) {
  const targetPos = getCardScreenPosition(target);
  const targetCenter = {
    x: targetPos.x + getCardWidth() / 2,
    y: targetPos.y + getCardHeight() / 2
  };

  return app.cards
    .filter((card) => !isLocked(card))
    .filter((card) => {
      if (target.ownerId !== card.ownerId) return false;
      const pos = getCardScreenPosition(card);
      const cx = pos.x + getCardWidth() / 2;
      const cy = pos.y + getCardHeight() / 2;
      return Math.hypot(cx - targetCenter.x, cy - targetCenter.y) <= radius;
    })
    .sort((a, b) => a.z - b.z)
    .map((card) => card.id);
}

function getTopCardAtPoint(x, y) {
  const elements = document.elementsFromPoint(x, y);
  for (const el of elements) {
    const cardEl = el.closest?.(".card");
    if (!cardEl) continue;
    const card = getCard(cardEl.dataset.cardId);
    if (card) return card;
  }
  return null;
}

function isLocked(card) {
  return Boolean(card.ownerId && card.ownerId !== app.player.id);
}

function compactCardPatch(card) {
  return {
    id: card.id,
    x: round(card.x),
    y: round(card.y),
    rx: round(card.rx),
    ry: round(card.ry),
    ownerId: card.ownerId,
    faceUp: card.faceUp,
    z: card.z,
    angle: round(card.angle || 0, 3)
  };
}

function commitPatches(patches, kind) {
  if (!patches.length) return;
  app.version += 1;
  renderCards(false);
  app.bus?.sendGame({ kind, patches, version: app.version, from: app.player.id, sentAt: Date.now() });
}

function handleRemoteGame(message) {
  if (!message || message.from === app.player.id) return;

  if (message.player) {
    app.players.set(message.player.id, message.player);
    renderZones();
  }

  if (message.kind === "hello") {
    clearTimeout(app.snapshotTimer);
    app.snapshotTimer = setTimeout(() => {
      app.bus?.sendGame({
        kind: "snapshot",
        from: app.player.id,
        player: app.player,
        version: app.version,
        cards: app.cards.map(compactCardPatch),
        sentAt: Date.now()
      });
    }, 120 + Math.random() * 320);
    return;
  }

  if (message.kind === "snapshot") {
    if ((message.version ?? 0) >= app.version) {
      applyPatches(message.cards || []);
      app.version = message.version ?? app.version;
      renderCards(false);
    }
    return;
  }

  if (Array.isArray(message.patches)) {
    applyPatches(message.patches);
    app.version = Math.max(app.version, message.version || app.version);
    renderCards(false);
  }
}

function applyPatches(patches) {
  const byId = new Map(app.cards.map((card) => [card.id, card]));
  for (const patch of patches) {
    const card = byId.get(patch.id);
    if (!card) continue;
    Object.assign(card, {
      x: patch.x ?? card.x,
      y: patch.y ?? card.y,
      rx: patch.rx ?? card.rx,
      ry: patch.ry ?? card.ry,
      ownerId: patch.ownerId || null,
      faceUp: Boolean(patch.faceUp),
      z: patch.z ?? card.z,
      angle: patch.angle ?? card.angle
    });
  }
}

function handlePresence(players) {
  app.players.clear();
  app.players.set(app.player.id, app.player);
  for (const player of players) {
    if (!player?.id) continue;
    app.players.set(player.id, player);
  }
  renderZones();
  renderCards(false);
}

function sendCursorThrottled(x, y) {
  const now = Date.now();
  if (now - app.lastCursorSent < CURSOR_THROTTLE_MS) return;
  app.lastCursorSent = now;
  app.bus?.sendCursor({
    from: app.player.id,
    name: app.player.name,
    color: app.player.color,
    x: x / window.innerWidth,
    y: y / window.innerHeight,
    sentAt: now
  });
}

function handleRemoteCursor(payload) {
  if (!payload || payload.from === app.player.id) return;
  let el = app.remoteCursors.get(payload.from);
  if (!el) {
    el = document.createElement("div");
    el.className = "remote-cursor";
    el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3l15 8-7 2-3 7L4 3Z"/></svg><span></span>';
    els.cursorLayer.appendChild(el);
    app.remoteCursors.set(payload.from, el);
  }
  el.style.setProperty("--cursor-color", payload.color || "#fff");
  el.style.left = `${payload.x * window.innerWidth}px`;
  el.style.top = `${payload.y * window.innerHeight}px`;
  el.querySelector("span").textContent = payload.name || "Player";
  el.style.opacity = "1";

  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.style.opacity = "0";
  }, 1800);
}

function createTooltip() {
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  document.body.appendChild(tooltip);
  app.tooltip = tooltip;
}

function handleTipPointerEnter(event, cardId) {
  const tipTarget = event.currentTarget;
  const card = getCard(cardId);
  if (!card || isLocked(card)) return;

  clearTimeout(app.tooltipTimer);
  app.tooltipTimer = setTimeout(() => {
    const kind = tipTarget.dataset.tip;
    showTooltipFor(card, kind, event.clientX, event.clientY);
  }, 360);
}

function showTooltipFor(card, kind, x, y) {
  let title = card.name;
  let label = card.type;
  let text = card.text;
  let color = card.accent;

  if (kind === "type") {
    title = `${TYPE_META[card.type].en} / ${card.type}`;
    label = "Card type";
    text = card.typeHelp;
    color = card.typeColor;
  }
  if (kind === "seal") {
    title = "KABAL Seal";
    label = "Deck mark";
    text = "Every card carries the Kabal seal. It marks the card as part of the Eterin Varisleri deck.";
    color = "#d8b762";
  }

  app.tooltip.style.setProperty("--tip-color", color);
  app.tooltip.innerHTML = `<small>${escapeHtml(label)}</small><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p>`;
  app.tooltip.classList.add("is-visible");

  requestAnimationFrame(() => {
    const rect = app.tooltip.getBoundingClientRect();
    const margin = 14;
    let left = x + 18;
    let top = y + 18;
    if (left + rect.width > window.innerWidth - margin) left = window.innerWidth - rect.width - margin;
    if (top + rect.height > window.innerHeight - margin) top = window.innerHeight - rect.height - margin;
    app.tooltip.style.left = `${Math.max(margin, left)}px`;
    app.tooltip.style.top = `${Math.max(margin, top)}px`;
  });
}

function hideTooltip() {
  clearTimeout(app.tooltipTimer);
  app.tooltip?.classList.remove("is-visible");
}

function getOpponentSeatAt(x, y) {
  for (const seat of ["top", "left", "right"]) {
    const rect = els.zones[seat].getBoundingClientRect();
    if (pointInRect(x, y, rect)) return seat;
  }
  return null;
}

function rejectZone(seat) {
  const zone = els.zones[seat];
  zone.classList.add("is-reject");
  setTimeout(() => zone.classList.remove("is-reject"), 260);
}

function getCard(id) {
  return app.cards.find((card) => card.id === id);
}

function nextZ() {
  return Math.max(...app.cards.map((card) => card.z || 1)) + 1;
}

function getCardWidth() {
  const first = document.querySelector(".card");
  if (first) return first.getBoundingClientRect().width || 72;
  return Math.max(52, Math.min(94, window.innerWidth * 0.074, window.innerHeight * 0.074));
}

function getCardHeight() {
  const first = document.querySelector(".card");
  if (first) return first.getBoundingClientRect().height || getCardWidth() * 1.42;
  return getCardWidth() * 1.42;
}

function getCardWidthRatio() {
  return Math.min(0.16, getCardWidth() / Math.max(1, window.innerWidth));
}

function getCardHeightRatio() {
  return Math.min(0.22, getCardHeight() / Math.max(1, window.innerHeight));
}

function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round(value, digits = 5) {
  const m = 10 ** digits;
  return Math.round((Number(value) || 0) * m) / m;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copyInviteLink() {
  const url = new URL(window.location.href);
  url.searchParams.set("room", app.roomId);
  try {
    await navigator.clipboard.writeText(url.toString());
    showToast("Oda linki kopyalandı.");
  } catch {
    showToast(url.toString());
  }
}

function openModal(html, afterOpen) {
  els.modalContent.innerHTML = html;
  els.modalLayer.classList.add("is-open");
  els.modalLayer.setAttribute("aria-hidden", "false");
  afterOpen?.();
}

function closeModal() {
  els.modalLayer.classList.remove("is-open");
  els.modalLayer.setAttribute("aria-hidden", "true");
  els.modalContent.innerHTML = "";
}

function wireLeaveConfirm() {
  document.getElementById("cancelLeave")?.addEventListener("click", closeModal);
  document.getElementById("confirmLeave")?.addEventListener("click", async () => {
    await app.bus?.disconnect();
    const url = new URL(window.location.href);
    url.searchParams.set("room", `KBL-${makeId(6)}`);
    window.location.href = url.toString();
  });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(els.toast._timer);
  els.toast._timer = setTimeout(() => els.toast.classList.remove("is-visible"), 2800);
}
