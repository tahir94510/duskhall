import { expandDeck, iconSvg, TYPE_META } from "./cards.js";
import { RULES_HTML, supportHtml, leaveConfirmHtml } from "./rules.js";
import { RealtimeBus, loadConfig } from "./net.js";

const PLAYER_COLORS = ["#d8b762", "#7fa6ff", "#62c889", "#d56d8e"];
const STACK_RADIUS = 132;
const CURSOR_THROTTLE_MS = 55;
const DRAG_BROADCAST_MS = 90;
const STORAGE_PLAYER_KEY = "kabal-mvp-player-v2";

const els = {
  app: document.getElementById("app"),
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
  deckSlot: document.getElementById("deckSlot"),
  openSlot: document.getElementById("openSlot"),
  voidSlot: document.getElementById("voidSlot"),
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
  lastDragBroadcast: 0,
  snapshotTimer: null,
  resizeTimer: null,
  reduceMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false
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

  const online = await app.bus.connect();
  showToast(online ? "Eş zamanlı masa hazır. Davet linkiyle arkadaşlarını çağırabilirsin." : "Yerel masa açık. Supabase değerleri aktif olunca linkli oyun çalışır.");
}

function attachEvents() {
  window.addEventListener("resize", handleResize, { passive: true });
  window.addEventListener("pointermove", handlePointerMove, { passive: false });
  window.addEventListener("pointerup", handlePointerUp, { passive: false });
  window.addEventListener("pointercancel", handlePointerUp, { passive: false });
  window.addEventListener("blur", () => stopDragging(true));
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopDragging(true);
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

function handleResize() {
  window.clearTimeout(app.resizeTimer);
  app.resizeTimer = window.setTimeout(() => {
    normalizeLooseCardsIntoViewport();
    renderCards(false);
  }, 80);
}

function getOrCreateRoomId() {
  const url = new URL(window.location.href);
  const existing = url.searchParams.get("room");
  if (existing && /^[a-z0-9-]{4,32}$/i.test(existing)) return existing.toUpperCase();
  const room = `KBL-${makeId(6)}`;
  url.searchParams.set("room", room);
  window.history.replaceState({}, "", url.toString());
  return room;
}

function getOrCreatePlayer() {
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(STORAGE_PLAYER_KEY) || "null");
  } catch {
    saved = null;
  }
  if (saved?.id) return saved;

  const color = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
  const player = {
    id: `p_${makeId(10).toLowerCase()}`,
    name: `Oyuncu ${makeId(2)}`,
    color,
    joinedAt: Date.now()
  };
  sessionStorage.setItem(STORAGE_PLAYER_KEY, JSON.stringify(player));
  return player;
}

function makeId(length) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("");
}

function createInitialCards(roomId) {
  const deck = expandDeck();
  const rng = mulberry32(hashString(roomId));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  const anchor = getDeckAnchor();
  const offset = 0;
  return deck.map((card, index) => ({
    ...card,
    x: clamp01((anchor.x + index * offset) / window.innerWidth),
    y: clamp01((anchor.y - index * offset) / window.innerHeight),
    rx: 0.5,
    ry: 0.5,
    ownerId: null,
    faceUp: false,
    z: index + 10,
    angle: 0
  }));
}

function getDeckAnchor() {
  const rect = els.deckSlot?.getBoundingClientRect();
  const cardW = getCardWidth();
  const cardH = getCardHeight();
  if (rect?.width) {
    return {
      x: rect.left + (rect.width - cardW) / 2,
      y: rect.top + (rect.height - cardH) / 2
    };
  }
  return {
    x: window.innerWidth / 2 - cardW - 18,
    y: window.innerHeight / 2 - cardH / 2
  };
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

function renderCards(createMissing = false) {
  for (const card of app.cards) {
    let el = app.elements.get(card.id);
    if (!el && createMissing) {
      el = createCardElement(card);
      app.elements.set(card.id, el);
      els.board.appendChild(el);
    }
    if (el) syncCardElement(el, card);
  }
  updateCounters();
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
        <span class="card-border"></span>
        <span class="card-topline">
          <span class="card-type-icon" data-tip="type">${iconSvg(card.typeIcon)}</span>
          <span class="card-seal-icon" data-tip="seal">${iconSvg("seal")}</span>
        </span>
        <span class="card-body">
          <span class="card-name-icon" data-tip="power">${iconSvg(card.icon)}</span>
          <span class="card-title">${escapeHtml(card.name)}</span>
        </span>
        <span class="card-footer">${escapeHtml(card.type)}</span>
      </span>
      <span class="card-face card-back">
        <span class="back-ring"></span>
        <span class="back-mark">K</span>
        <span class="back-title">KABAL</span>
      </span>
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
  const concealed = Boolean(card.ownerId && card.ownerId !== app.player.id);
  const pos = getCardScreenPosition(card);
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  el.style.zIndex = String(card.z || 1);
  el.style.setProperty("--type-color", card.typeColor);
  el.style.setProperty("--accent-color", card.accent);
  el.style.transform = `rotate(${card.angle || 0}deg)`;
  el.classList.toggle("is-face-down", !card.faceUp);
  el.classList.toggle("is-concealed", concealed);
  el.classList.toggle("is-locked", concealed);
  el.classList.toggle("is-selected", app.selectedIds.has(card.id));
  el.style.pointerEvents = concealed ? "none" : "auto";
  el.setAttribute("aria-hidden", concealed ? "true" : "false");
  el.setAttribute("aria-label", concealed ? "Gizli kart" : card.name);
}

function getCardScreenPosition(card) {
  const cardW = getCardWidth();
  const cardH = getCardHeight();
  if (card.ownerId) {
    const zone = getZoneForOwner(card.ownerId);
    const rect = zone.getBoundingClientRect();
    return {
      x: rect.left + clamp01(card.rx) * Math.max(0, rect.width - cardW),
      y: rect.top + clamp01(card.ry) * Math.max(0, rect.height - cardH)
    };
  }
  return clampPosition(card.x * window.innerWidth, card.y * window.innerHeight);
}

function clampPosition(left, top) {
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - getCardWidth() - margin);
  const maxY = Math.max(margin, window.innerHeight - getCardHeight() - margin);
  return {
    x: Math.min(maxX, Math.max(margin, left)),
    y: Math.min(maxY, Math.max(margin, top))
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
  const idx = remotes.findIndex((player) => player.id === playerId);
  return ["top", "left", "right"][Math.max(0, idx)] || "top";
}

function renderZones() {
  els.zones.bottom.style.setProperty("--seat-color", app.player.color);
  els.zones.bottom.classList.remove("is-empty");
  els.zones.bottom.querySelector(".zone-label").textContent = "El alanım";

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
      zone.querySelector(".zone-label").textContent = player.name || "Oyuncu";
    } else {
      zone.style.setProperty("--seat-color", "rgba(255,255,255,0.14)");
      zone.classList.add("is-empty");
      zone.querySelector(".zone-label").textContent = "Bekleniyor";
    }
  }
}


function updateCounters() {
  if (!app.cards?.length) return;
  const selfCount = app.cards.filter((card) => card.ownerId === app.player.id).length;
  els.zones.bottom.querySelector(".zone-label").textContent = `El alanım · ${selfCount} kart`;

  const remoteBySeat = { top: null, left: null, right: null };
  for (const player of app.players.values()) {
    if (player.id === app.player.id) continue;
    remoteBySeat[getRemoteSeat(player.id)] = player;
  }

  for (const seat of ["top", "left", "right"]) {
    const zone = els.zones[seat];
    const player = remoteBySeat[seat];
    if (!player) {
      zone.querySelector(".zone-label").textContent = "Bekleniyor · 0 kart";
      continue;
    }
    const count = app.cards.filter((card) => card.ownerId === player.id).length;
    zone.querySelector(".zone-label").textContent = `${player.name || "Oyuncu"} · ${count} kart`;
  }

  updateDockCounter(els.deckSlot, "Deste", countCardsInSlot(els.deckSlot));
  updateDockCounter(els.openSlot, "Açık", countCardsInSlot(els.openSlot));
  updateDockCounter(els.voidSlot, "Kayıp", countCardsInSlot(els.voidSlot));
}

function updateDockCounter(slot, label, count) {
  if (!slot) return;
  let labelEl = slot.querySelector("span");
  let countEl = slot.querySelector("strong");
  if (!labelEl) {
    labelEl = document.createElement("span");
    slot.appendChild(labelEl);
  }
  if (!countEl) {
    countEl = document.createElement("strong");
    slot.appendChild(countEl);
  }
  labelEl.textContent = label;
  countEl.textContent = String(count);
}

function countCardsInSlot(slot) {
  const rect = slot?.getBoundingClientRect();
  if (!rect?.width) return 0;
  return app.cards.filter((card) => {
    if (card.ownerId) return false;
    const pos = getCardScreenPosition(card);
    const cx = pos.x + getCardWidth() / 2;
    const cy = pos.y + getCardHeight() / 2;
    return pointInRect(cx, cy, rect);
  }).length;
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
  app.longPressTimer = window.setTimeout(() => {
    if (!app.drag || app.drag.moved) return;
    flipCards([card.id]);
    stopDragging(true);
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
  uniqueIds.forEach((id, index) => {
    const card = getCard(id);
    card.z = nextZ() + index;
  });

  const starts = uniqueIds.map((id) => {
    const card = getCard(id);
    const pos = getCardScreenPosition(card);
    const el = app.elements.get(id);
    el?.classList.add("is-dragging");
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
    starts,
    captureEl: event.currentTarget
  };
  try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {}
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
    const pos = clampPosition(item.x + dx, item.y + dy);
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
  }

  broadcastDragPreview();
}

function handlePointerUp(event) {
  clearTimeout(app.longPressTimer);
  if (!app.drag) return;
  event.preventDefault();

  const dx = event.clientX - app.drag.startX;
  const dy = event.clientY - app.drag.startY;
  const patches = [];
  const ownZone = els.zones.bottom.getBoundingClientRect();
  const rejectedSeat = getOpponentSeatForDrag(dx, dy);

  if (rejectedSeat) {
    rejectZone(rejectedSeat);
    for (const item of app.drag.starts) {
      const el = app.elements.get(item.id);
      if (el) {
        el.style.left = `${item.x}px`;
        el.style.top = `${item.y}px`;
      }
    }
    showToast("Rakip alanına doğrudan bırakılamaz. Kartı sınırına bırak; ilgili oyuncu kendisi içeri alsın.");
    stopDragging(false);
    return;
  }

  for (const item of app.drag.starts) {
    const card = getCard(item.id);
    if (!card) continue;
    const pos = clampPosition(item.x + dx, item.y + dy);
    const centerX = pos.x + getCardWidth() / 2;
    const centerY = pos.y + getCardHeight() / 2;

    card.z = nextZ();
    if (pointInRect(centerX, centerY, ownZone)) {
      card.ownerId = app.player.id;
      card.rx = clamp01((pos.x - ownZone.left) / Math.max(1, ownZone.width - getCardWidth()));
      card.ry = clamp01((pos.y - ownZone.top) / Math.max(1, ownZone.height - getCardHeight()));
    } else {
      card.ownerId = null;
      card.x = clamp01(pos.x / window.innerWidth);
      card.y = clamp01(pos.y / window.innerHeight);
    }
    patches.push(compactCardPatch(card));
  }

  stopDragging(true);
  commitPatches(patches, "move");
}

function getOpponentSeatForDrag(dx, dy) {
  if (!app.drag) return null;
  for (const item of app.drag.starts) {
    const pos = clampPosition(item.x + dx, item.y + dy);
    const cx = pos.x + getCardWidth() / 2;
    const cy = pos.y + getCardHeight() / 2;
    const seat = getOpponentSeatAt(cx, cy);
    if (seat) return seat;
  }
  return null;
}

function stopDragging(clearSelection = true) {
  clearTimeout(app.longPressTimer);
  if (app.drag) {
    for (const item of app.drag.starts) app.elements.get(item.id)?.classList.remove("is-dragging");
    try { app.drag.captureEl?.releasePointerCapture?.(app.drag.pointerId); } catch {}
  }
  app.drag = null;
  if (clearSelection) app.selectedIds.clear();
  renderCards(false);
}

function handleKeyDown(event) {
  if (event.key === "Escape") {
    closeModal();
    stopDragging(true);
    return;
  }
  if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;

  const target = getTopCardAtPoint(app.pointer.x, app.pointer.y);
  if (!target || isLocked(target)) return;
  const key = event.key.toLowerCase();

  if (key === "f") {
    event.preventDefault();
    flipCards([target.id]);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "g") {
    event.preventDefault();
    gatherStack(target);
    return;
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
  const ids = findStackIds(target, STACK_RADIUS * 1.2);
  const base = getCardScreenPosition(target);
  const patches = [];
  ids.forEach((id, index) => {
    const card = getCard(id);
    if (!card || isLocked(card)) return;
    const left = base.x;
    const top = base.y;
    applyScreenPosition(card, left, top, target.ownerId === app.player.id);
    card.angle = 0;
    card.z = nextZ() + index;
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
    const left = center.x + (rng() - 0.5) * Math.min(22, getCardWidth() * 0.24);
    const top = center.y + (rng() - 0.5) * Math.min(22, getCardHeight() * 0.18);
    applyScreenPosition(card, left, top, target.ownerId === app.player.id);
    card.angle = (rng() - 0.5) * 10;
    card.z = nextZ() + index;
    patches.push(compactCardPatch(card));
  });
  commitPatches(patches, "mix");
  showToast(`${ids.length} kart karıştırıldı.`);
}

function applyScreenPosition(card, left, top, keepOwned) {
  const pos = clampPosition(left, top);
  if (keepOwned && card.ownerId === app.player.id) {
    const rect = els.zones.bottom.getBoundingClientRect();
    card.rx = clamp01((pos.x - rect.left) / Math.max(1, rect.width - getCardWidth()));
    card.ry = clamp01((pos.y - rect.top) / Math.max(1, rect.height - getCardHeight()));
  } else {
    card.ownerId = null;
    card.x = clamp01(pos.x / window.innerWidth);
    card.y = clamp01(pos.y / window.innerHeight);
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
    .filter((card) => card.ownerId === target.ownerId)
    .filter((card) => {
      const pos = getCardScreenPosition(card);
      const cx = pos.x + getCardWidth() / 2;
      const cy = pos.y + getCardHeight() / 2;
      return Math.hypot(cx - targetCenter.x, cy - targetCenter.y) <= radius;
    })
    .sort((a, b) => (a.z || 0) - (b.z || 0))
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
    faceUp: Boolean(card.faceUp),
    z: card.z,
    angle: round(card.angle || 0, 3)
  };
}

function commitPatches(patches, kind) {
  if (!patches.length) return;
  app.version += 1;
  renderCards(false);
  app.bus?.sendGame({ kind, patches, version: app.version, from: app.player.id, player: app.player, sentAt: Date.now() });
}

function broadcastDragPreview() {
  const now = Date.now();
  if (!app.drag || now - app.lastDragBroadcast < DRAG_BROADCAST_MS) return;
  app.lastDragBroadcast = now;
  const dx = app.pointer.x - app.drag.startX;
  const dy = app.pointer.y - app.drag.startY;
  const previews = app.drag.starts.map((item) => {
    const pos = clampPosition(item.x + dx, item.y + dy);
    return { id: item.id, left: round(pos.x / window.innerWidth), top: round(pos.y / window.innerHeight) };
  });
  app.bus?.sendGame({ kind: "preview", from: app.player.id, previews, sentAt: now });
}

function handleRemoteGame(message) {
  if (!message || message.from === app.player.id) return;
  if (message.player) {
    app.players.set(message.player.id, message.player);
    renderZones();
  }

  if (message.kind === "hello") {
    clearTimeout(app.snapshotTimer);
    app.snapshotTimer = window.setTimeout(() => {
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

  if (message.kind === "preview" && Array.isArray(message.previews)) {
    for (const item of message.previews) {
      const card = getCard(item.id);
      const el = app.elements.get(item.id);
      if (!card || !el || card.ownerId === app.player.id) continue;
      el.style.left = `${item.left * window.innerWidth}px`;
      el.style.top = `${item.top * window.innerHeight}px`;
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
  updateCounters();
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
  el.querySelector("span").textContent = payload.name || "Oyuncu";
  el.style.opacity = "1";
  clearTimeout(el._hideTimer);
  el._hideTimer = window.setTimeout(() => { el.style.opacity = "0"; }, 1800);
}

function createTooltip() {
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  document.body.appendChild(tooltip);
  app.tooltip = tooltip;
}

function handleTipPointerEnter(event, cardId) {
  const card = getCard(cardId);
  if (!card || isLocked(card)) return;
  const tipTarget = event.currentTarget;
  clearTimeout(app.tooltipTimer);
  app.tooltipTimer = window.setTimeout(() => {
    showTooltipFor(card, tipTarget.dataset.tip, event.clientX, event.clientY);
  }, 340);
}

function showTooltipFor(card, kind, x, y) {
  let title = card.name;
  let label = card.type;
  let text = card.text;
  let color = card.accent;

  if (kind === "type") {
    title = card.type;
    label = "Kart tipi";
    text = card.typeHelp;
    color = card.typeColor;
  }
  if (kind === "seal") {
    title = "KABAL Mührü";
    label = "Deste işareti";
    text = "Her kart KABAL mührünü taşır. Bu işaret, kartın Eterin Varisleri destesine ait olduğunu gösterir.";
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
  window.setTimeout(() => zone.classList.remove("is-reject"), 280);
}

function normalizeLooseCardsIntoViewport() {
  for (const card of app.cards) {
    if (card.ownerId) continue;
    const pos = clampPosition(card.x * window.innerWidth, card.y * window.innerHeight);
    card.x = clamp01(pos.x / window.innerWidth);
    card.y = clamp01(pos.y / window.innerHeight);
  }
}

function getCard(id) {
  return app.cards.find((card) => card.id === id);
}

function nextZ() {
  let max = 1;
  for (const card of app.cards) max = Math.max(max, card.z || 1);
  return max + 1;
}

function getCardWidth() {
  const first = document.querySelector(".card");
  if (first) return first.getBoundingClientRect().width || fallbackCardWidth();
  return fallbackCardWidth();
}

function getCardHeight() {
  const first = document.querySelector(".card");
  if (first) return first.getBoundingClientRect().height || fallbackCardWidth() * 1.45;
  return fallbackCardWidth() * 1.45;
}

function fallbackCardWidth() {
  return Math.max(54, Math.min(118, Math.min(window.innerWidth * 0.078, window.innerHeight * 0.124)));
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
    sessionStorage.removeItem(`kabal-room-${app.roomId}`);
    const url = new URL(window.location.href);
    url.searchParams.set("room", `KBL-${makeId(6)}`);
    window.location.href = url.toString();
  });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(els.toast._timer);
  els.toast._timer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2800);
}
