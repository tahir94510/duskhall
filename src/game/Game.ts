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
import { openFeedbackModal, hasFeedbackChannel } from "../ui/FeedbackModal.js";
import { openLegalModal } from "../ui/LegalModal.js";
import { openUpdatesModal, latestUpdateVersion } from "../ui/UpdatesModal.js";
import { openLeaveConfirm } from "../ui/LeaveConfirm.js";
import { openConfirm } from "../ui/ConfirmModal.js";
import { openJoinByCode } from "../ui/JoinByCodeModal.js";
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
import { seatIsRival, cardIsRivalOwned, hostId, isHost, hostCandidatesWithAway, resolveSeating, shouldClearTombstone, shouldReTombstone, seniorityOnReturn, type Occupancy, type HostCandidate, type AwayHostClaim, type SeatClaimEntry } from "./occupancy.js";
import {
  findStackOverlapping,
  findConnectedStack,
  gatherStack,
  shuffleStack,
  turnStackOver,
  topVisibleId,
  flipVisibleCardId,
  alignRotation,
  rotationsDiffer,
  isTidyStack
} from "../table/StackOps.js";
import { rotateVec, seatRotationDeg, localSlotForSeat, SLOT_INDEX, screenToCanonical, canonicalToScreen, type Seat, type BoardBox } from "../table/rotation.js";
import { DECK_NX, DECK_NY, DISCARD_NX } from "../table/constants.js";
import { cardZoneOwner, CARD_CANON_W, CARD_CANON_H } from "../table/SlotGrid.js";
import type { RealtimeBus, PresencePlayer, CardPatch, PatchCard, PatchAnim, HoldMsg, LeftMsg, KickMsg, SeatClaim, RemovedEntry } from "../net/realtime.js";
import { isNewerWrite } from "../net/lww.js";
import type { RuntimeConfig } from "../net/config.js";
import { AudioEngine, type SfxName } from "../audio/Audio.js";
import { getOrAssignName, resetName, pickNameExcluding, setName, nameKey } from "../util/names.js";

const SEAT_COUNT = 4;
const SEAT_COLORS = ["#f3efe5", "#cdc8bc", "#a09c92", "#79766f"];
// Temporary z-band for cards mid-animation (flip/shuffle/held). Sits above the
// static card layer (--z-card) but below cursors (--z-cursor: 600), so an
// animating pile floats over the table yet never covers peer cursors/header.
const ANIM_Z_BASE = 500;
// Honour "prefers-reduced-motion". When the user asks for reduced motion the CSS
// transitions are zeroed (tokens.css) and the keyframes are disabled (card.css),
// so a flip/shuffle is INSTANT visually. The JS elevation / is-flip-quiet / peer
// hold-lock windows below shadow those animations, so they must collapse too —
// otherwise a reduced-motion user gets an instant flip but the pile stays elevated,
// undercards stay hidden, and peers see the pile locked for up to ~1.2s with
// nothing moving. Read once at load (the preference changes rarely; the CSS half
// stays fully reactive). Guarded so it is inert under SSR / test (no matchMedia).
const PREFERS_REDUCED_MOTION =
  typeof window !== "undefined" && typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOTION = PREFERS_REDUCED_MOTION ? 0 : 1;
// Animation durations (kept slightly above the CSS transition/keyframe lengths
// so the z-elevation never clears before the visual settles). All collapse to 0
// under reduced motion so the holds match the instant CSS.
// Flip = the .card__inner rotateY transition (--dur-flip: 320ms in card.css) plus a
// tiny guard so the elevation never clears before the visual settles.
const FLIP_ANIM_MS = 320 * MOTION;
// Shuffle = the shuffle-spin keyframe length (380ms in card.css); keep them equal so
// the elevation and the jitter cleanup land exactly when the animation ends.
const SHUFFLE_ANIM_MS = 380 * MOTION;
// Tidy phases for stack flip/shuffle. When the pile is fanned at mixed angles we
// first STRAIGHTEN every card to one orientation, then GATHER them into one spot,
// then act (flip/riffle) — three smooth, ordered beats rather than all at once.
// Each is just over the .card transform transition so one settles before the next.
// Each phase is just over the .card transform transition (--dur: 180ms) so the
// straighten finishes before the gather starts, and the gather before the act.
const STACK_STRAIGHTEN_MS = 200 * MOTION; // rotate-to-one-direction phase (skipped if already aligned)
const STACK_TIDY_MS = 200 * MOTION;       // gather-into-one-pile phase
// Off-board canonical coordinate for the "hide my cursor" sentinel. It must read
// as off-board to renderCursor (which hides at < -1) AND survive inputGuard's
// coordinate clamp (COORD_MIN = -3) unchanged, so a peer reliably hides the ghost.
// -2 satisfies both without depending on the old -10→-3 clamp coincidence.
const CURSOR_OFFBOARD = -2;
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
const SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000; // a saved board restores only within 12h
// One-shot, per-device flag: set the first time this browser ever opens the app, so
// the About panel auto-shows exactly once for a brand-new visitor and never again.
// Not room-scoped and never swept by pruneStaleStorage / clearRoomStorage (it matches
// none of their prefixes), so it persists across rooms, refreshes, leaves and kicks.
const LS_SEEN_ABOUT = "kabal:seen-about";
// Per-device record of the newest "What's new" version this browser has opened. The
// Updates row shows a "New" badge while this differs from the latest entry; opening the
// panel writes the latest here and clears the badge until the next update ships.
const LS_SEEN_UPDATES = "kabal:seen-updates";

// `joinedAt` is the player's PERSISTED seniority in this room (their original join
// time). It survives a refresh/reconnect so the host keeps host and seating order
// is stable; it is reset to "now" only on a genuine new entry (leave/kick wipes the
// stored identity). `ts` is the last-active touch, used to gate seniority recovery.
interface RoomIdentity { id: string; name: string; seat: number; joinedAt: number; ts: number; }

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
  // Pointer type of the last move, so flip/rotate can avoid re-arming the HOVER
  // tooltip on touch (where info is reached only via the ContextBar Info button).
  private lastPointerType = "mouse";
  private boardSize = { width: 1, height: 1 };
  private spectator = false;
  private cursorHiddenSent = false;
  // True only during a deliberate room change (leave / hop): the periodic snapshot
  // save is suspended so it can't re-create the storage we just cleared for the room
  // we are leaving (the 5s timer could otherwise fire between clear and room switch).
  private leaving = false;
  // PERSISTED seniority: our original join time for this room, recovered across a
  // refresh/reconnect so a refresh never costs us host. Reset to "now" only on a
  // genuine new entry (leave/kick clears the stored identity). See readIdentity.
  private selfJoinedAt = Date.now();
  // Per-CONNECTION stamp, fresh on EVERY connect (mount/joinRoom/handleReset) — never
  // recovered. Lets peers tell our genuine reconnect (newer connAt) from a stale
  // presence echo (same connAt), so a returning player is shown at once, not hidden
  // for the tombstone grace. Distinct from selfJoinedAt by design.
  private selfConnAt = Date.now();
  // Whether we've completed a connection at least once this session. Used to refresh
  // selfConnAt on a genuine RECONNECT (a network drop that auto-recovers without a
  // page reload), so a peer who came back after the away grace still publishes a
  // newer connAt and clears its tombstone — visible at once, not stuck till expiry.
  private hasBeenOnline = false;
  // Persistent seat ownership keyed by seat index. A claim survives a network
  // drop (the seat shows as "dropped"/dimmed) and is only cleared by an explicit
  // `left` broadcast, so a disconnected player never loses their seat or cards.
  private seatClaims = new Map<number, { id: string; name: string; joinedAt: number; connAt: number }>();
  private activeSeats = new Set<number>();
  private lastRoster: PresencePlayer[] = [];
  // Recently removed client ids (kicked / left). Each entry holds the leaver's
  // last-known connAt plus a hard expiry. A departing player lingers in Supabase
  // presenceState() until their untrack is processed, so a presence "sync" can
  // briefly re-list them; we ignore that STALE echo (same/older connAt) in
  // applyPresence. But a GENUINE return publishes a NEWER connAt, which clears the
  // tombstone immediately — so a player who comes back is visible at once instead of
  // hidden until the grace lapses. (connAt is compared per-device, so it is immune
  // to cross-machine clock skew.)
  private removedTombstones = new Map<string, { connAt: number; until: number }>();
  // Hard fallback expiry so a tombstone can never leak if no fresh presence ever
  // arrives to clear it. The connAt comparison is the real discriminator now, so the
  // old "must exceed AWAY_GRACE" coupling no longer gates visibility. INVARIANT: this
  // must be >= SENIORITY_RECOVERY_MS (40s). Otherwise a player kicked while OFFLINE
  // (whose local identity was never wiped) could reconnect after the tombstone lapsed
  // but inside the seniority window and recover their original seat/host rank as if
  // never kicked. Keeping it >= the recovery window means a returning kicked client is
  // always still suppressed at least as long as it could recover senior seniority.
  private static readonly TOMBSTONE_MS = 45000;
  // Recently-departed host ids (id -> expiry ms). When the host role transfers, the
  // PREVIOUS host is recorded here for a short window so a kick they issued just before
  // the transfer is still accepted by peers whose host view briefly disagrees. The
  // authoritative `removed[]` reconcile is the real guarantee; this only trims latency.
  private recentHosts = new Map<string, number>();
  private static readonly RECENT_HOST_MS = 5000;
  // The last host id we computed, so applyPresence can detect a transfer and stamp the
  // outgoing host into recentHosts.
  private lastHostId = "";
  // "Away" grace: a seat whose owner dropped (closed the tab / lost the network)
  // without sending an explicit `left` stays reserved & dimmed ONLY for this long.
  // If they have not returned by then we vacate the seat for good — release their
  // cards to the public table and stop showing them as "away" — so a player who
  // truly went away never lingers forever in everyone else's view. A reconnect
  // within the window cancels the timer and keeps their seat. Each client runs
  // this independently and converges (claims are local; card release is LWW).
  private awayTimers = new Map<number, number>();
  private static readonly AWAY_GRACE_MS = 30000;
  // How recently the stored identity must have been active for us to RECOVER our
  // seniority (joinedAt) on (re)connect. A quick refresh/drop is well within this
  // window, so we keep host; an absence longer than this (our seat was released long
  // ago) yields a fresh seniority, so we can't reclaim host after being gone.
  // INVARIANT: this must NOT exceed AWAY_GRACE_MS. Peers vacate an away seat and
  // transfer host exactly at the away grace; if the recovery window ran longer, an
  // ex-host returning in the gap [away grace, recovery] would recover its senior
  // joinedAt AND clear its tombstone (fresh connAt), re-winning host and briefly
  // splitting the room into two hosts. Matching the windows means once peers have
  // expired the seat, the returner always ranks last and can never steal host back.
  private static readonly SENIORITY_RECOVERY_MS = Game.AWAY_GRACE_MS;

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
      onFlip: (id) => this.flipSmart(id),
      onGather: (id) => this.gatherAt(id),
      onMix: (id) => this.shuffleAt(id),
      onRotate: (id) => this.rotateSmart(id),
      onInfo: (id) => this.showCardInfo(id),
      canShowInfo: (id) => this.canShowCardInfo(id),
      stackFor: (id) => findConnectedStack(this.state, this.boardSize, id, this.cardMetrics())
    });
    this.header = new Header({
      onRules: () => { void this.audio.play("ui-open"); openRulesModal(this.modal); },
      onSupport: () => { void this.audio.play("ui-open"); openSupportModal(this.modal, { patreonUrl: this.config.patreonUrl, buyMeACoffeeUrl: this.config.buyMeACoffeeUrl, supportUrl: this.config.supportUrl }); },
      onFeedback: () => { void this.audio.play("ui-open"); openFeedbackModal(this.modal, this.config.issuesUrl, this.config.feedbackUrl); },
      onLegal: () => { void this.audio.play("ui-open"); openLegalModal(this.modal); },
      onReset: () => { if (this.spectator) return; void this.audio.play("ui-open"); this.handleReset(); },
      onResetDeck: () => { if (this.spectator || !this.isHost()) return; this.confirmResetDeck(); },
      onSettings: () => { void this.audio.play("ui-open"); openSettingsModal(this.modal, this.audio, () => this.onLocale()); },
      onShortcuts: () => { void this.audio.play("ui-open"); openShortcutsModal(this.modal); },
      onUpdates: () => { void this.audio.play("ui-open"); this.markUpdatesSeen(); openUpdatesModal(this.modal); },
      onJoinRoom: (code) => { void this.joinRoom(code); },
      onJoinByCode: () => { void this.audio.play("ui-open"); openJoinByCode(this.modal, { currentRoom: this.room }, (code) => { void this.joinRoom(code); }); },
      onDiagnose: () => { void this.audio.play("ui-open"); openDiagnosticsModal(this.modal, this.bus); }
    });
    document.body.appendChild(this.header.el);
    this.header.setFeedbackAvailable(hasFeedbackChannel(this.config.issuesUrl, this.config.feedbackUrl));
    // Show the "New" badge on the Updates row when this device hasn't opened the latest
    // entry yet (locale is already loaded at this point, so the version is available).
    this.header.setUpdatesBadge(this.updatesUnseen());

    onLocaleChange(() => this.onLocale());

    this.room = getOrCreateRoom();
    // A broken room link returns "" and getOrCreateRoom has already redirected to the
    // 404 page; stop here so we don't connect to an empty room while the page unloads.
    if (!this.room) return;
    this.header.setRoom(this.room);
    this.installZoneActions();
    // Sweep abandoned/expired kabal:* room data so storage never piles up.
    this.pruneStaleStorage();
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
    // Recover our seniority across a refresh / quick drop (so we KEEP host); a long
    // absence or a genuine leave (identity wiped) yields fresh seniority instead.
    // connAt is ALWAYS fresh so peers never mistake this return for a stale echo.
    this.selfJoinedAt = this.resolveSeniority(ident);
    this.selfConnAt = Date.now();
    // Entry always WANTS a seat: publish a concrete seat (a dropped player's own seat
    // if known, else seat 0 = "any") so resolveSeating can seat us if one is free. We
    // only become a spectator when the room is genuinely full (applyPresence then sets
    // it and re-publishes -1). Never carry a stale spectator state into the first sync.
    this.self.seat = this.self.seat >= 0 ? this.self.seat : 0;
    this.spectator = false;
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

  // First-ever visit on this device: auto-open the About panel once, just after the
  // loader lifts, so a newcomer learns what Vaerum is. A localStorage flag makes it a
  // one-shot — every later load (refresh, new room, return) skips it silently. Called
  // by the boot sequence right after hideLoader(); never throws (storage may be off).
  showAboutOnFirstVisit(): void {
    let seen = true;
    // If storage can't be read we can't remember showing it, so default to NOT
    // nagging on every load — only a confirmed first visit (null flag) opens it.
    try { seen = localStorage.getItem(LS_SEEN_ABOUT) === "1"; } catch { return; }
    if (seen) return;
    try { localStorage.setItem(LS_SEEN_ABOUT, "1"); } catch {}
    // A short beat after the board reveal so the modal doesn't fight the reveal
    // animation. No sound: audio is still gated until the first user gesture.
    window.setTimeout(() => { if (!this.modal.isOpen()) openLegalModal(this.modal); }, 500);
  }

  // True when there's a newer "What's new" entry than the one this device last opened.
  // A read failure (storage off) returns false so we never nag with a stuck badge.
  private updatesUnseen(): boolean {
    const latest = latestUpdateVersion();
    if (!latest) return false;
    try { return localStorage.getItem(LS_SEEN_UPDATES) !== latest; } catch { return false; }
  }
  // Record the latest version as seen and drop the badge (called when the panel opens).
  private markUpdatesSeen(): void {
    const latest = latestUpdateVersion();
    if (latest) { try { localStorage.setItem(LS_SEEN_UPDATES, latest); } catch {} }
    this.header.setUpdatesBadge(false);
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
      joinedAt: this.selfJoinedAt,
      connAt: this.selfConnAt
    };
  }

  // Guarantee our handle is unique on the table. If a peer shares our name, the
  // LATER joiner yields (tie broken by id) so every client resolves the same
  // loser and renames exactly one of the two. We only rename ourselves, then
  // re-publish so peers and our persisted identity stay in sync. Our id is never
  // touched — only the cosmetic handle changes.
  private ensureUniqueName(roster: PresencePlayer[]): void {
    const mine = nameKey(this.self.name);
    const clash = roster.find((p) =>
      p.id !== this.self.id &&
      nameKey(p.name) === mine &&
      // We yield only if THEY have priority: earlier joiner, or equal time + lower id.
      (p.joinedAt < this.selfJoinedAt || (p.joinedAt === this.selfJoinedAt && p.id < this.self.id))
    );
    if (!clash) return;
    const taken = roster.filter((p) => p.id !== this.self.id).map((p) => p.name);
    const fresh = pickNameExcluding(taken);
    if (fresh === this.self.name) return;
    this.self.name = fresh;
    setName(fresh);
    this.writeIdentity();
    this.bus.updateMe(this.presencePayload());
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
          // Only a seat a rival actually holds blocks a drop. An empty seat's area
          // is open public table — a card dropped there lands and stays unowned.
          if (this.seatIsRival(i) && this.pointInZone(i, x, y)) return i;
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
      onReleased: (x, y, pointerType) => this.tooltip.probeAt(x, y, pointerType),
      onDragProgress: (ids) => {
        for (const id of ids) this.dragPreviewIds.add(id);
        this.scheduleDragPreview();
      },
      onCardFlipped: (id) => this.flipCard(id),
      onStackToggleFlip: (id) => this.toggleStackFlip(id),
      setOwnerSeat: (id) => {
        const c = this.state.cards.get(id);
        if (!c) return;
        // Ownership is decided by the privacy-overlap rule on the card's FINAL position
        // (not the pointer at drop), so the persisted flag matches what every viewer
        // sees: a card with even a small part inside a seat's zone belongs to it, and it
        // is public only once it is almost fully out. Concealment is recomputed live too.
        const owner = this.cardZoneOwnerOf(c);
        if (c.ownerSeat !== owner) {
          c.ownerSeat = owner;
          this.dirtyIds.add(id);
          this.scheduleFlush();
        }
      },
      beginHold: (ids) => this.broadcastHold(ids, false),
      endHold: (ids) => this.broadcastHold(ids, true),
      isLocked: (id) => this.isLockedByOther(id),
      isRivalOwned: (id) => this.isRivalOwnedCard(id),
      bringToTop: (ids) => this.bringCardsToTop(ids),
      showContextBar: (id, x, y) => this.contextBar.show(id, x, y),
      hideContextBar: () => this.contextBar.hide(),
      emitCursor: (x, y) => {
        // Spectators are silent observers, never broadcast a cursor (that was
        // the source of the seat-0 "impostor" ghost).
        if (this.spectator) return;
        // The cursor listener is on window (so empty board space, no longer
        // captured by the cards layer, still shares the pointer). While a modal is
        // open the player is in a menu, not at the table: send the off-board
        // sentinel ONCE (like the zone path) so peers hide our ghost instead of
        // leaving it frozen on the board the whole time the menu is open.
        if (this.modal.isOpen()) {
          if (!this.cursorHiddenSent) {
            this.cursorHiddenSent = true;
            this.bus.sendCursor({ id: this.self.id, x: CURSOR_OFFBOARD, y: CURSOR_OFFBOARD, seat: this.self.seat });
          }
          return;
        }
        // Inside our own zone we keep our pointer private: send an off-board
        // sentinel ONCE so peers hide our ghost (instead of freezing it at the
        // zone edge), then stay quiet until we leave the zone again.
        if (this.pointInZone(this.self.seat, x, y)) {
          if (!this.cursorHiddenSent) {
            this.cursorHiddenSent = true;
            this.bus.sendCursor({ id: this.self.id, x: CURSOR_OFFBOARD, y: CURSOR_OFFBOARD, seat: this.self.seat });
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

  // Is a seat actually held by someone? True when a player is present on it
  // (active) OR an away player still holds the claim (dropped but not left). An
  // EMPTY seat — nobody ever sat, or the occupant explicitly left/was kicked — is
  // NOT owned, so its on-screen area behaves like open public table: cards can be
  // dropped there and any card stranded on it is public, not concealed. This is the
  // single source of truth for "does this seat's area belong to a player?".
  // Live view of seat occupancy for the pure helpers in occupancy.ts. activeSeats
  // is the present subset; seatClaims covers active AND away/dropped players (the
  // claim persists). Both are passed by reference as `.has(seat)` lookups — no
  // per-call allocation, since this runs for every card every frame.
  private occupancy(): Occupancy {
    return { activeSeats: this.activeSeats, claimedSeats: this.seatClaims, seatCount: SEAT_COUNT };
  }

  // Resting card z values must stay well BELOW the animation/held band (--z-anim:
  // 500) and seat/cursor layers, or — after a few hundred interactions, since each
  // lift does topZ++ — a table card's z climbs past 500 and renders OVER a held or
  // flipping card (the "my card is under the deck while dragging" bug). We keep z
  // in [1, CARD_Z_CEILING]; once topZ reaches the ceiling we compact the whole
  // board back down to 1..N, preserving the exact stacking order.
  private static readonly CARD_Z_CEILING = 400;

  // Ensure state.topZ is at least as high as every card on the board, so the next
  // "lift to top" actually clears everything. topZ can lag behind reality after a
  // remote snapshot/patch brings in higher z values, which is what let a flipped/
  // grabbed card sink back UNDER a pile (e.g. the deck) it was sitting in. If z has
  // drifted up toward the animation band, compact it back to a dense 1..N first so
  // a subsequent lift can never reach --z-anim.
  private syncTopZ(): void {
    let max = this.state.topZ;
    for (const c of this.state.cards.values()) if (c.z > max) max = c.z;
    this.state.topZ = max;
    if (max >= Game.CARD_Z_CEILING) this.compactZ();
  }

  // Renumber every card's z to a dense 1..N by current stacking order, so the z
  // counter never drifts up into the animation/cursor bands. Order-preserving, so
  // nothing visibly moves. All cards are dirtied so peers converge to the same
  // compact order (LWW by ts is fine: relative order is identical everywhere).
  private compactZ(): void {
    const ordered = Array.from(this.state.cards.values()).sort((a, b) => a.z - b.z);
    let z = 1;
    for (const c of ordered) {
      const nz = z++;
      if (c.z !== nz) { c.z = nz; this.dirtyIds.add(c.id); }
    }
    this.state.topZ = ordered.length;
  }

  // Lift a set of cards above everything else, preserving their internal stacking,
  // so a dropped card/stack rests on top of whatever was at the drop spot.
  private bringCardsToTop(ids: string[]): void {
    this.syncTopZ(); // also compacts if z drifted toward the animation band
    const ordered = ids
      .map((id) => this.state.cards.get(id))
      .filter((c): c is CardState => !!c)
      .sort((a, b) => a.z - b.z);
    for (const c of ordered) {
      this.state.topZ++;
      c.z = this.state.topZ;
    }
  }

  // A seat owned by someone OTHER than us (and we are seated). Used to decide
  // whether dropping/interacting in that area is blocked as a rival's private zone.
  private seatIsRival(seat: number): boolean {
    return seatIsRival(this.occupancy(), seat, this.self.seat, this.spectator);
  }

  // The seat whose private zone currently holds this card, or null. A single low overlap
  // threshold (ZONE_PRIVACY_FRAC, 10% of the card's area) decides it: a card is private
  // once a small part is inside a zone from ANY side, and public again only once it is
  // almost fully out. Because the threshold is low, it hides eagerly and reveals only
  // near the edge, so a card never flashes to the table. Used for both concealment and
  // the "can't touch a rival's card" rule.
  private cardZoneOwnerOf(c: CardState): number | null {
    // Use the SHARED canonical card size, not this device's measured pixels, so the
    // conceal/reveal decision is byte-identical on every screen and for every player
    // (a card dragged out reveals everywhere at once; nudged in, hides everywhere).
    return cardZoneOwner(c.x, c.y, c.rot, CARD_CANON_W, CARD_CANON_H);
  }

  // Is this card in a rival's private area whose seat is still held? Decided by the
  // card's LIVE position (the same 10% overlap rule), not a stale flag, so dragging a
  // card out of a zone reveals it, and dragging it in conceals it, as it crosses the
  // threshold. A zone whose owner left/kicked (or was never occupied) is NOT rival-owned,
  // so the card is public. Spectators treat every owned-zone card as rival-owned.
  private isRivalOwnedCard(id: string): boolean {
    const c = this.state.cards.get(id);
    if (!c) return false;
    return cardIsRivalOwned(this.occupancy(), this.cardZoneOwnerOf(c), this.self.seat, this.spectator);
  }

  // Claim a card for our seat when we interact with it AND it is sitting in our
  // own zone. Mirrors drag-drop ownership (DragController.setOwnerSeat) so that
  // flipping / rotating / gathering / shuffling a card in our area also makes it
  // ours — not only dragging it in. Uses the CANONICAL zone test so it is correct
  // for every seat and board rotation. Returns true if ownership changed. A
  // spectator owns no seat; a card already ours or a rival's is left alone.
  private claimIfInOwnZone(id: string): boolean {
    if (this.spectator || this.self.seat < 0) return false;
    const c = this.state.cards.get(id);
    if (!c || c.ownerSeat === this.self.seat) return false;
    // Never steal a rival's still-private card (guarded elsewhere too).
    if (this.isRivalOwnedCard(id)) return false;
    // Claim only when the card is actually inside OUR zone (privacy-overlap) — same rule
    // as drop ownership, so interacting (flip/rotate/gather) matches dragging in.
    if (this.cardZoneOwnerOf(c) !== this.self.seat) return false;
    c.ownerSeat = this.self.seat;
    this.dirtyIds.add(id);
    return true;
  }

  // The physical zone div (bottom/top/left/right) that an absolute seat occupies
  // on THIS viewer's screen. The local player's own seat is always the bottom
  // slot; the other seats fall out of the same board rotation the cards use, so
  // hit-testing, labels and ownership all agree for every seat.
  private physicalZoneForSeat(seat: number): HTMLDivElement | null {
    const slot = localSlotForSeat(this.self.seat as Seat, seat as Seat);
    return this.refs.zones[SLOT_INDEX[slot]] ?? null;
  }

  // The non-rotating label group (name + status light + kick) for an absolute
  // seat on THIS viewer's screen. Shares the exact physical slot mapping with
  // physicalZoneForSeat, so the label always sits over its own zone.
  private physicalLabelForSeat(seat: number): HTMLDivElement | null {
    const slot = localSlotForSeat(this.self.seat as Seat, seat as Seat);
    return this.refs.labels[SLOT_INDEX[slot]] ?? null;
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
      // `rot` is CUMULATIVE (never wraps), so a card turned a full circle reads
      // upright at rot 4, 8, …, not just 0. Test the visual orientation (mod 4) the
      // way StackOps/SlotGrid do, else a face-down, visually-upright deck card with a
      // non-zero cumulative rot drifts off the marker on resize instead of re-snapping.
      const uprightMod4 = (((c.rot % 4) + 4) % 4) === 0;
      const onDeck = !c.faceUp && uprightMod4 &&
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
      // Both are multi-card actions, so a single card under the cursor triggers
      // nothing at all (no sound, no effect) — the same rule the touch bar applies
      // by disabling these buttons for a lone card.
      if (k === "g" || k === "m") {
        const pt = this.lastPointer;
        if (!pt) return;
        // Board metrics are kept fresh by onViewportChanged; no per-key reflow.
        const top = this.topCardAtCanonicalPoint(pt.x, pt.y);
        if (!top) return;
        const stack = findConnectedStack(this.state, this.boardSize, top.id, this.cardMetrics());
        if (stack.length < 2) return;
        e.preventDefault();
        if (k === "g") this.gatherAt(top.id);
        else this.shuffleAt(top.id);
      }
    });

    window.addEventListener("pointermove", (e) => {
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.lastPointerType = e.pointerType || "mouse";
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

      // Ownership/hold guard: a rival's private card OR a card a peer is holding
      // is off-limits to scroll. A card on a now-empty seat is free.
      if (this.isRivalOwnedCard(top.id) || this.isLockedByOther(top.id)) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      if (this.wheelCooldown()) return;

      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Shift + scroll: turn the whole pile under the cursor 90°. rot is stored
        // CUMULATIVELY so the visual rotation always continues forward instead of
        // snapping back through modulo at 360°.
        const dir = e.deltaY > 0 ? 1 : -1;
        const stack = findConnectedStack(this.state, this.boardSize, top.id, this.cardMetrics());
        // A pile turns and aligns together; a lone card turns in place. Same
        // helpers as the touch rotate so every input path behaves identically.
        if (stack.length > 1) this.rotateStack(top.id, dir);
        else this.rotateCard(top.id, dir);
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl + scroll: flip the whole stack under the cursor.
        this.toggleStackFlip(top.id);
      } else {
        // Bare scroll: flip the single card under the cursor. Routes through
        // flipCard so it gets the same clean turn animation (elevation + settle)
        // as every other flip path.
        this.flipCard(top.id);
      }
    }, { passive: false });

    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private installVisibility(): void {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        // Hidden: push the cursor off-board so peers stop showing a frozen ghost;
        // it reappears on the next pointer move when we return.
        if (!this.spectator) this.bus.sendCursor({ id: this.self.id, x: CURSOR_OFFBOARD, y: CURSOR_OFFBOARD, seat: this.claimSeat });
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
      // A long background can get our heartbeat throttled enough that peers prune us,
      // run the away grace, and tombstone us. On the Supabase path a reconnect bumps
      // connAt to clear that; on the LOCAL-only path "online" never fires, so a
      // re-announce carries the same connAt and the tombstone sticks until its hard
      // expiry. Stamp a fresh connAt and re-publish here so peers see us as genuinely
      // back (newer connAt clears the tombstone) the moment we return to the tab. It
      // is monotonic and harmless when no tombstone exists.
      this.selfConnAt = Date.now();
      this.bus.updateMe(this.presencePayload());
    });
  }

  private wheelCooldownUntil = 0;
  private wheelCooldown(): boolean {
    const now = performance.now();
    if (now < this.wheelCooldownUntil) return true;
    this.wheelCooldownUntil = now + 180;
    return false;
  }

  // Shuffle visual: each card rotates from its OLD angle to the squared-up angle
  // (so a sideways card turns smoothly into place, like gather) while adding a
  // small riffle wobble, all without any positional move. `fromRot` carries each
  // card's pre-shuffle quarter-turn so the keyframe can start there.
  private applyShuffleJitter(ids: string[], fromRot?: Map<string, number>): void {
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
      // --from-rot is where the card visually starts (its OLD angle); --base-rot is
      // the settled, squared-up angle it ends on. The keyframe eases from one to
      // the other, so reorientation matches gather instead of snapping.
      const startRot = fromRot?.get(id) ?? c.rot;
      el.style.setProperty("--from-rot", `${startRot * 90}deg`);
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
        el.style.removeProperty("--from-rot");
        el.style.removeProperty("--base-rot");
        el.style.removeProperty("--a1");
        el.style.removeProperty("--a2");
        // The keyframe owned the transform; repaint so the inline transform is
        // restored cleanly now that the wobble class is gone.
        this.requestRender();
      }, SHUFFLE_ANIM_MS);
    }
  }

  // Turn every card that is currently SHOWING ITS FACE down to its back with a smooth
  // turn, then run `done`. Used before a shuffle so the pile is faced down cleanly
  // first instead of snapping (the riffle's is-shuffling kills the rotateY transition,
  // which is why the face must settle BEFORE the wobble). A pile already face-down
  // skips straight to `done`. The decision reads the PAINTED state (the is-faceup
  // class), so it works both for the actor and for a peer replaying the shuffle.
  private turnPileFaceDown(ids: string[], done: () => void): void {
    const showing = ids.filter((id) => this.cardEls.get(id)?.classList.contains("is-faceup"));
    if (!showing.length) { done(); return; }
    // Purely VISUAL: we only turn the painted faces down here. The authoritative
    // face-down state is stamped + broadcast by shuffleStack's flush (actor) or was
    // already applied by applyPatch (peer replay), so we never write unstamped state.
    this.elevateDuringAnim(ids, FLIP_ANIM_MS);
    // Next frame: drop is-faceup so the .card__inner rotateY transition runs (the
    // cards are is-animating but NOT yet is-shuffling, so the transition is live).
    requestAnimationFrame(() => {
      for (const id of showing) this.cardEls.get(id)?.classList.remove("is-faceup");
    });
    window.setTimeout(done, FLIP_ANIM_MS);
  }

  private resizePending = 0;
  // Re-measure the board and re-align board-relative scaffolding after any
  // viewport / resolution / zoom / orientation change. Card positions are
  // canonical [0,1] fractions so moved cards stay put proportionally; only the
  // deck/discard PILE (a card-width-relative offset) needs the re-snap, and
  // only for cards still sitting on it.
  private onViewportChanged(): void {
    // Refresh the cached board size IMMEDIATELY, before the debounce. boardBox() reads
    // a live center but the cached size, so during the ~50-80ms settle window a drop or
    // broadcast cursor would be scaled by the pre-resize size and land at the wrong
    // canonical spot (then persist + sync). An immediate clientWidth read may catch an
    // intermediate value mid-animation, but that is far closer than the stale one, and
    // the debounced pass below still re-measures once layout settles to re-seat piles.
    this.measureBoard();
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

  // Wipe every trace of THIS client in a room from browser storage — used on an
  // explicit leave and on a kick, so a returning player comes back clean (a brand
  // new presence) and nothing stale lingers to cause a duplicate/ghost. Volume,
  // locale and other global prefs are never touched.
  private clearRoomStorage(room: string): void {
    try { localStorage.removeItem(this.identKey(room)); } catch {}
    try { localStorage.removeItem(SS_SNAPSHOT_PREFIX + room); } catch {}
    try { sessionStorage.removeItem(SS_SEAT_PREFIX + room); } catch {}
    // Note: the livecid heartbeat is keyed by client id (not room) and our id stays
    // live as we move to a fresh room, so it is intentionally left alone here.
  }

  // On boot, sweep expired/abandoned room data so kabal:* keys never pile up: a
  // stale identity past its TTL, and a livecid heartbeat that hasn't beaten in a
  // while (its tab is long gone).
  private pruneStaleStorage(): void {
    try {
      const now = Date.now();
      const dead: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith(LS_IDENT_PREFIX)) {
          try {
            const v = JSON.parse(localStorage.getItem(key) || "{}") as { ts?: number };
            if (typeof v.ts !== "number" || now - v.ts > IDENT_TTL_MS) dead.push(key);
          } catch { dead.push(key); }
        } else if (key.startsWith(SS_SNAPSHOT_PREFIX)) {
          // Snapshots restore only within 12h (see tryRestoreSnapshot); drop older
          // ones so a player who visits many rooms doesn't accumulate MBs of state.
          try {
            const v = JSON.parse(localStorage.getItem(key) || "{}") as { ts?: number };
            if (typeof v.ts !== "number" || now - v.ts > SNAPSHOT_TTL_MS) dead.push(key);
          } catch { dead.push(key); }
        } else if (key.startsWith(LIVE_CID_PREFIX)) {
          const beat = Number(localStorage.getItem(key) || 0);
          if (!beat || now - beat > 60000) dead.push(key); // 60s = many missed beats
        }
      }
      for (const k of dead) { try { localStorage.removeItem(k); } catch {} }
    } catch {}
  }

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
      // Identities written before joinedAt existed fall back to `ts` (their last
      // touch) — a safe seniority that never predates their real presence.
      const joinedAt = typeof v.joinedAt === "number" && Number.isFinite(v.joinedAt) && v.joinedAt > 0 ? v.joinedAt : v.ts;
      return { id: v.id, name: v.name, seat, joinedAt, ts: v.ts };
    } catch { return null; }
  }

  // Decide our seniority (joinedAt) on (re)entry: recover the stored value when the
  // identity was active recently (a refresh / quick drop → we keep host and our seat
  // order), else start fresh (a long absence or a genuine leave → we cannot reclaim
  // host over players who stayed). connAt is handled separately and is always fresh.
  private resolveSeniority(ident: RoomIdentity | null): number {
    return seniorityOnReturn(ident, Date.now(), Game.SENIORITY_RECOVERY_MS);
  }

  private writeIdentity(): void {
    try {
      // Spectators hold no seat to reclaim, so we don't pin one for them. joinedAt is
      // our STABLE seniority (never bumped here); ts is the last-active touch that
      // gates seniority recovery, refreshed on every write (incl. the periodic save).
      const seat = this.spectator ? -1 : this.self.seat;
      const ident: RoomIdentity = { id: this.self.id, name: this.self.name, seat, joinedAt: this.selfJoinedAt, ts: Date.now() };
      localStorage.setItem(this.identKey(this.room), JSON.stringify(ident));
    } catch {}
  }

  // Ask before reshuffling the whole table back into the deck — a destructive,
  // shared action, so it routes through the same plain confirm dialog as leave.
  private confirmResetDeck(): void {
    // Host-only: resetting the shared deck affects everyone, so a non-host (or a
    // spectator) can never trigger it even if the control is reached some other way.
    if (this.spectator || !this.isHost()) return;
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
  // True if any of these cards is mid flip/shuffle/tidy animation. Used to ignore a
  // repeat flip/shuffle on a pile that is still animating, so a double-click during
  // the tidy→act window can't stack two gestures and play the turn twice.
  private anyAnimating(ids: string[]): boolean {
    for (const id of ids) if (this.animTimers.has(id)) return true;
    return false;
  }
  private elevateDuringAnim(ids: string[], durMs: number): void {
    // Preserve internal order by current z so the pile keeps its stacking.
    const ordered = ids
      .map((id) => ({ id, z: this.state.cards.get(id)?.z ?? 0 }))
      .sort((a, b) => a.z - b.z);
    const minZ = ordered.length ? ordered[0]!.z : 0;
    for (const { id, z } of ordered) {
      const el = this.cardEls.get(id);
      if (!el) continue;
      el.classList.add("is-animating");
      // Paint at ANIM_Z_BASE + offset from the pile's lowest z, preserving the FULL
      // internal order for any pile size (a 72-card flip/shuffle no longer collapses
      // its bottom cards onto one z). The band cannot climb over seat labels/cursors:
      // the cards live inside .board__perspective, whose rotation transform is a
      // stacking context that contains the whole band beneath the sibling label layer
      // (--z-seat) and the body-level cursors, regardless of the internal z value.
      el.style.zIndex = String(ANIM_Z_BASE + (z - minZ));
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

  // Write the live transform for these cards directly to their elements, so a
  // change made while they are elevated (is-animating, where the render loop skips
  // transform writes) still ANIMATES via the .card CSS transition instead of only
  // jumping into place at settle. Used by the straighten/gather tidy phases.
  private animateCardTransforms(ids: string[]): void {
    const { w: cardW, h: cardH } = this.cardMetrics();
    for (const id of ids) {
      const c = this.state.cards.get(id);
      const el = this.cardEls.get(id);
      if (!c || !el) continue;
      const tf = this.cardTransform(c.x, c.y, c.rot, cardW, cardH);
      el.style.transform = tf;
      el.dataset.tf = tf; // keep the render loop's dedup in sync
    }
  }

  private saveSnapshot(): void {
    // Don't resurrect storage we just wiped while leaving a room (the room field is
    // mid-switch). Also refresh our identity's last-active touch so a refresh keeps
    // our seniority-recovery window alive (joinedAt itself is never bumped here).
    if (this.leaving) return;
    this.writeIdentity();
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
      if (Date.now() - data.ts > SNAPSHOT_TTL_MS) return false; // 12h freshness
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
    // Concealed rival cards (still-held seat) reveal nothing; a card on an empty
    // seat is public, so its info is fine to show.
    if (this.isRivalOwnedCard(id)) return false;
    return true;
  }

  private showCardInfo(id: string): void {
    const el = this.cardEls.get(id);
    if (el && this.canShowCardInfo(id)) this.tooltip.showForCard(el);
  }

  private rotateCard(id: string, dir = 1): void {
    const c = this.state.cards.get(id);
    if (!c) return;
    if (this.isRivalOwnedCard(id) || this.isLockedByOther(id)) return;
    // Cumulative rotation: keep adding turns so 270°→360°→450° flows forward
    // visually instead of teleporting back to 0°.
    c.rot = c.rot + dir;
    // Interacting with a card in our own zone claims it (same as a drag-in).
    this.claimIfInOwnZone(id);
    // A card you just turned comes to the top and stays there (see flipCard).
    this.bringCardsToTop([id]);
    this.dirtyIds.add(id);
    this.scheduleFlush();
    void this.audio.play("flip");
  }

  // Turn a whole pile 90° (dir = +1 / -1) like a real stack: gather onto the
  // anchor card and square EVERY card to the new angle by the shortest path, so a
  // ragged, mixed-angle pile aligns as it turns instead of staying crooked.
  // gatherStack leaves faceUp untouched, so open/closed cards keep their faces.
  private rotateStack(id: string, dir: number): void {
    const stack = findConnectedStack(this.state, this.boardSize, id, this.cardMetrics());
    if (this.stackBlocked(stack)) return;
    // Ignore a repeat while this pile is still animating, so a rotate landing in
    // another stack action's animation window can't double-apply and re-flush.
    if (this.anyAnimating(stack)) return;
    const anchor = this.state.cards.get(id);
    if (!anchor) return;
    this.syncTopZ(); // gatherStack lifts via topZ; keep it above all board cards
    // The anchor (card under the cursor) turns exactly `dir`; every other card squares
    // to the anchor's NEW angle by the SHORTEST path. gatherStack snaps each card via
    // nearestCongruentRot(c.rot, anchor.rot + dir), whose result is always within ±2
    // quarter-turns of the card's OWN angle — so a 90° card turns back to 0° and a 270°
    // card turns forward to 360°, never the long way round, and the CSS rotate
    // transition (interpolating rot*90deg) travels that same short arc.
    gatherStack(this.state, stack, anchor.x, anchor.y, anchor.rot + dir);
    for (const cid of stack) { this.claimIfInOwnZone(cid); this.dirtyIds.add(cid); }
    this.scheduleFlush();
    void this.audio.play("flip");
  }

  // Touch / single rotate dispatcher: a pile turns and aligns together; a lone
  // card just turns in place. Mirrors flipSmart so touch and mouse agree.
  private rotateSmart(id: string): void {
    const stack = findConnectedStack(this.state, this.boardSize, id, this.cardMetrics());
    if (stack.length > 1) this.rotateStack(id, 1);
    else this.rotateCard(id, 1);
  }

  private flipCard(id: string): void {
    const c = this.state.cards.get(id);
    if (!c) return;
    if (this.isRivalOwnedCard(id) || this.isLockedByOther(id)) return;
    c.faceUp = !c.faceUp;
    // Interacting with a card in our own zone claims it (same as a drag-in).
    this.claimIfInOwnZone(id);
    // A card you just flipped comes to the top and STAYS there, like turning a
    // real card over on the table — otherwise it sinks back under a pile/deck it
    // was sitting in once the turn animation settles.
    this.bringCardsToTop([id]);
    this.dirtyIds.add(id);
    // Drive the turn through the shared visual (old face → rAF → new face) so the
    // rotateY animates now that renderAllCards no longer toggles is-faceup mid-flip.
    this.runFlipVisual([id], id, FLIP_ANIM_MS);
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
    // Hover info is a mouse affordance only. On touch (no hover), the panel must be
    // reached solely via the ContextBar Info button — re-arming it here would pop a
    // stale, mis-positioned box after a tap-flip. Skip touch/pen entirely.
    if (this.lastPointerType === "touch" || this.lastPointerType === "pen") return;
    window.setTimeout(() => {
      const p = this.lastPointer;
      if (p) this.tooltip.probeAt(p.x, p.y, this.lastPointerType);
    }, FLIP_ANIM_MS + 20);
  }

  // One smart "flip" for the touch action bar: turn the WHOLE pile under the
  // finger when there's more than one card there, otherwise just the single card.
  // This matches what right-click does on desktop and is what a player expects
  // when they flip a stack on a phone (the old bar's single-card "flip" only
  // turned the top card).
  private flipSmart(id: string): void {
    const stack = findConnectedStack(this.state, this.boardSize, id, this.cardMetrics());
    if (stack.length > 1) this.toggleStackFlip(id);
    else this.flipCard(id);
  }

  // Orchestrate the smooth, ORDERED tidy before a stack action (flip or shuffle):
  //   1. STRAIGHTEN — if the cards face different ways, rotate them all to one
  //      orientation first (no movement), so a fanned/cross-laid pile lines up.
  //   2. GATHER — slide every card into one square pile on the anchor's spot.
  //   3. ACT — run `act()` (flip or riffle) on the now-tidy pile.
  // Phases that aren't needed are skipped (an already-square pile goes straight to
  // gather; an already-tidy single-spot pile straightens in place). The pile stays
  // elevated across all phases. `actMs` is the acting animation's length so the
  // elevation covers it. Each phase plays its own soft cue for a clean audio flow.
  private tidyStackThen(stack: string[], anchorId: string, act: () => void, actMs: number): void {
    const anchor = this.state.cards.get(anchorId);
    if (!anchor) return;
    const target = this.viewerUprightRot(anchor.rot);
    // Already a tidy single stack (resting deck/discard)? Skip the dead-time and
    // turn/shuffle it instantly — only a scattered or fanned pile needs the tidy.
    if (isTidyStack(this.state, stack, anchor.x, anchor.y, target)) {
      this.syncTopZ();
      act();
      return;
    }
    const needStraighten = rotationsDiffer(this.state, stack, target);
    const gatherMs = STACK_TIDY_MS;
    const straightenMs = needStraighten ? STACK_STRAIGHTEN_MS : 0;
    const total = straightenMs + gatherMs + actMs;
    this.syncTopZ();
    this.elevateDuringAnim(stack, total);

    const doGather = () => {
      // Re-resolve the anchor's spot (it may have a fresh position) and collect.
      const a = this.state.cards.get(anchorId) ?? anchor;
      gatherStack(this.state, stack, a.x, a.y, this.viewerUprightRot(a.rot));
      for (const cid of stack) { this.claimIfInOwnZone(cid); this.dirtyIds.add(cid); }
      this.elevateDuringAnim(stack, gatherMs + actMs);
      // Write the gathered transforms so the cards SLIDE together via the CSS
      // transition (the render loop skips transforms while is-animating).
      this.animateCardTransforms(stack);
      this.scheduleFlush();
      void this.audio.play("gather");
      window.setTimeout(act, gatherMs);
    };

    if (needStraighten) {
      // PHASE 1: straighten orientation in place (no move), then gather, then act.
      // This phase is VISUAL only (no sound): the player hears the two events that
      // matter — the gather swoosh and then the flip/shuffle — in a clean sequence,
      // rather than three sounds crowding into a third of a second.
      alignRotation(this.state, stack, target);
      for (const cid of stack) { this.claimIfInOwnZone(cid); this.dirtyIds.add(cid); }
      // Write the new (straightened) transforms NOW so the rotation actually
      // animates via the CSS transition instead of jumping at settle — the cards
      // are elevated (is-animating), so the render loop won't write them for us.
      this.animateCardTransforms(stack);
      this.scheduleFlush();
      window.setTimeout(doGather, straightenMs);
    } else {
      doGather();
    }
  }

  private toggleStackFlip(id: string): void {
    const stack = findConnectedStack(this.state, this.boardSize, id, this.cardMetrics());
    if (!stack.length) return;
    // Ownership guard: if any card in the stack is in a rival's (still-held)
    // private area, the whole gesture is blocked. Otherwise mixed-seat flips would
    // leak private orientation across players. Cards on empty seats are free.
    for (const cid of stack) {
      if (this.isRivalOwnedCard(cid)) return;
      if (this.isLockedByOther(cid)) return;
    }
    // Ignore a repeat while this pile is still animating (e.g. a double-click in
    // the tidy→flip window) so the turn never plays twice.
    if (this.anyAnimating(stack)) return;
    // A lone card just flips, no tidy needed.
    if (stack.length < 2) { this.performStackFlip(stack); return; }
    // The visible top card (highest z) anchors the tidy. Straighten → gather → flip.
    let topId = stack[stack.length - 1]!;
    let topZ = -Infinity;
    for (const cid of stack) {
      const c = this.state.cards.get(cid);
      if (c && c.z > topZ) { topZ = c.z; topId = cid; }
    }
    // Lock the whole pile to peers for the entire straighten→gather→flip flow so no
    // one can grab/flip/rotate a card out from under the animation. Released by a
    // guaranteed timer covering the worst-case (straighten + gather + flip) duration.
    this.lockPileForAnim(stack, STACK_STRAIGHTEN_MS + STACK_TIDY_MS + FLIP_ANIM_MS);
    this.tidyStackThen(stack, topId, () => this.performStackFlip(stack), FLIP_ANIM_MS);
  }

  // The flip itself: reverse depth order + toggle every face, then float the pile
  // and hide all but the card that ends up on top so the 3D turn reads as one solid
  // block (only its outer face is ever visible). Used for a lone card directly and
  // for a stack after the tidy stage.
  // Play the 3D turn for a pile (or a single card) AFTER the state faces/z are
  // already set. `visibleId` is the one card kept on screen (the others hide via
  // is-flip-quiet) so the pile reads as one solid block. Because renderAllCards no
  // longer toggles is-faceup while a card is animating, we drive the rotateY here:
  // write each card's OLD face first, then on the next frame switch to its real
  // (already-set) face so the CSS .card__inner transition animates. At settle the
  // quiet class is dropped and the render loop writes the authoritative faces.
  private runFlipVisual(ids: string[], visibleId: string | null, durMs: number): void {
    this.elevateDuringAnim(ids, durMs);
    // Stage the OLD face now (state already holds the NEW face → old = !current).
    for (const id of ids) {
      const c = this.state.cards.get(id);
      const el = this.cardEls.get(id);
      if (!c || !el) continue;
      el.classList.toggle("is-faceup", !c.faceUp);
    }
    // Pin the visible card one slot above the WHOLE pile's animation band so it is
    // never covered, even for a 72-card pile (the band now spans the full z range, no
    // longer capped at +18). Hide the rest for the turn.
    if (visibleId) {
      this.cardEls.get(visibleId)?.style.setProperty("z-index", String(ANIM_Z_BASE + this.pileZSpan(ids) + 1));
      for (const id of ids) {
        if (id !== visibleId) this.cardEls.get(id)?.classList.add("is-flip-quiet");
      }
    }
    // Next frame: flip to the real face so the rotateY transition fires.
    requestAnimationFrame(() => {
      for (const id of ids) {
        const c = this.state.cards.get(id);
        const el = this.cardEls.get(id);
        if (!c || !el) continue;
        el.classList.toggle("is-faceup", c.faceUp);
      }
    });
    window.setTimeout(() => {
      for (const id of ids) this.cardEls.get(id)?.classList.remove("is-flip-quiet");
      // Let the render loop settle the faces/z on its next tick. We must NOT paint
      // synchronously here: is-animating has just cleared, so a synchronous pass would
      // toggle is-concealed and let `.is-concealed:not(.is-animating)` snap the card's
      // rotateY, replaying the turn a second time. The connected-stack capture already
      // gathers the pile onto one spot, so the depth settle is invisible regardless.
      this.requestRender();
    }, durMs);
  }

  // The z span of a pile (max − min current z), used to pin the visible flip card one
  // slot above the WHOLE animation band so it is never covered even for a big pile.
  private pileZSpan(ids: string[]): number {
    let min = Infinity;
    let max = -Infinity;
    for (const id of ids) {
      const c = this.state.cards.get(id);
      if (!c) continue;
      if (c.z < min) min = c.z;
      if (c.z > max) max = c.z;
    }
    return max >= min ? max - min : 0;
  }

  // Drive the VISUAL of a pile turning to ONE shared face with a single synchronised
  // 3D turn. The state mutation (depth reversal + unified faces) was already done by
  // turnStackOver; this only animates it. We stage the UNIFORM old face (!targetFaceUp)
  // on EVERY card — even ones already at the target — so the rotateY transition fires
  // for all of them and the pile turns as one block. The single `visibleId` is pinned
  // on top; the rest go transparent for the turn so no undercard flashes at the edge-on
  // instant. At settle the quiet class drops and the render loop writes the
  // authoritative faces; we requestRender (never a synchronous paint) so is-animating
  // has cleared before any concealment toggle, avoiding the rotateY snap that replayed
  // the turn a second time.
  private runSameFaceTurn(ids: string[], visibleId: string | null, targetFaceUp: boolean, durMs: number): void {
    this.elevateDuringAnim(ids, durMs);
    // Stage the uniform OLD face for every card so all of them animate. This is done
    // WITHOUT a transition (is-flip-staging sets .card__inner transition:none), so a card
    // whose current face differs from the staged one snaps to it instead of animating
    // backwards first — the jitter/pop when a closed card sat on an open pile. We force a
    // reflow, drop the staging class, then flip to the target on the next frame so the
    // 3D turn runs cleanly forward from the staged face.
    let probe: HTMLElement | null = null;
    for (const id of ids) {
      const el = this.cardEls.get(id);
      if (!el) continue;
      el.classList.add("is-flip-staging");
      el.classList.toggle("is-faceup", !targetFaceUp);
      probe = el;
    }
    if (visibleId) {
      this.cardEls.get(visibleId)?.style.setProperty("z-index", String(ANIM_Z_BASE + this.pileZSpan(ids) + 1));
      for (const id of ids) {
        if (id !== visibleId) this.cardEls.get(id)?.classList.add("is-flip-quiet");
      }
    }
    // Commit the staged face with no transition (one reflow), then re-enable transitions.
    if (probe) void probe.offsetWidth;
    for (const id of ids) this.cardEls.get(id)?.classList.remove("is-flip-staging");
    // Next frame: flip every card to the shared target face so the transition runs.
    requestAnimationFrame(() => {
      for (const id of ids) this.cardEls.get(id)?.classList.toggle("is-faceup", targetFaceUp);
    });
    window.setTimeout(() => {
      for (const id of ids) this.cardEls.get(id)?.classList.remove("is-flip-quiet");
      this.requestRender();
    }, durMs);
  }

  private performStackFlip(stack: string[]): void {
    if (!stack.length) return;
    // Re-check ownership/locks: a card could have changed hands during the tidy
    // delay before this stage runs.
    for (const cid of stack) {
      if (this.isRivalOwnedCard(cid) || this.isLockedByOther(cid)) return;
    }
    // Turn the pile OVER like a real stack of cards: the depth order reverses (the
    // bottom card ends up on top, the top card you were looking at goes to the bottom)
    // AND every card is squared to ONE consistent face. The target face is the toggle
    // of the current TOP card (the reference): a face-up-topped pile turns to all-backs,
    // a face-down-topped pile turns to all-faces. Squaring to one face fixes the mixed
    // open/closed "exception" cards (no undercard flashes the wrong way), while the
    // depth reversal keeps the move physically honest.
    const refTopId = topVisibleId(this.state, stack);
    const target = !(refTopId ? this.state.cards.get(refTopId)?.faceUp ?? false : false);
    // Lift the whole pile ABOVE every other table card first (preserving its internal
    // order), so a flipped card/pile is never left underneath another card. turnStackOver
    // then reverses the depth WITHIN these top slots, so the pile stays on top and reads
    // as physically turned over. (A resting tidy pile skips the gather lift upstream, so
    // without this a deck with a stray card on top would flip but stay buried.)
    this.bringCardsToTop(stack);
    turnStackOver(this.state, stack, target);
    for (const cid of stack) { this.claimIfInOwnZone(cid); this.dirtyIds.add(cid); }
    // After the reversal, pick the card that should stay visible through the 3D turn
    // so it reads as one solid block with no art-pop: opening shows the NEW top, closing
    // keeps the OLD top (now at the bottom).
    const visibleId = flipVisibleCardId(this.state, stack, target);
    this.runSameFaceTurn(stack, visibleId, target, FLIP_ANIM_MS);
    // Send immediately with a flip hint so peers replay the same solid-block turn. The
    // reversed z + unified faces ride in the patch; `toFaceUp` is the shared target.
    this.flushWithAnim(stack, { kind: "flip", ids: stack, toFaceUp: target });
    void this.audio.play("flip");
    this.rearmTooltipAtPointer();
  }

  // A stack cannot be gathered/shuffled/flipped if any card in it belongs to a
  // rival seat or is held by a peer. Returns true when the gesture must be
  // rejected (silently, no sound).
  private stackBlocked(stack: string[]): boolean {
    for (const cid of stack) {
      if (this.isLockedByOther(cid)) return true;
      if (this.isRivalOwnedCard(cid)) return true;
    }
    return false;
  }

  private gatherAt(id: string): void {
    const stack = findConnectedStack(this.state, this.boardSize, id, this.cardMetrics());
    // Gather is a multi-card action: a lone card is already "gathered". Reject
    // silently (no sound) so a key/tap on a single card never plays a sound that
    // does nothing — keeping the "one sound = one real action" contract.
    if (stack.length < 2) return;
    if (this.stackBlocked(stack)) return;
    // Ignore a repeat while this pile is still tidying/animating, so a gather fired
    // during another stack action's straighten window can't re-mutate and re-flush
    // the same cards twice (diverging z/rotation/position from peers).
    if (this.anyAnimating(stack)) return;
    const seed = this.state.cards.get(id);
    if (!seed) return;
    // Square the pile up to the angle that reads upright for THIS viewer, so a
    // jumble of 90°/180° cards becomes a clean stack from where they're sitting.
    const upright = this.viewerUprightRot(seed.rot);
    // Already a tidy single stack squared to upright? Gathering it again would
    // move nothing, yet still play a sound and broadcast a redundant patch — the
    // "spam" a repeated G on a resting deck produces. A collected pile stays
    // collected silently. (Shuffle and flip are intentionally repeatable and are
    // NOT guarded this way.)
    if (isTidyStack(this.state, stack, seed.x, seed.y, upright)) return;
    this.syncTopZ(); // lift the gathered pile above every board card
    gatherStack(this.state, stack, seed.x, seed.y, upright);
    for (const cid of stack) { this.claimIfInOwnZone(cid); this.dirtyIds.add(cid); }
    this.scheduleFlush();
    void this.audio.play("gather");
  }

  private shuffleAt(id: string): void {
    const stack = findConnectedStack(this.state, this.boardSize, id, this.cardMetrics());
    if (stack.length < 2) return;
    if (this.stackBlocked(stack)) return;
    // Ignore a repeat while this pile is still tidying/shuffling.
    if (this.anyAnimating(stack)) return;
    const seed = this.state.cards.get(id);
    if (!seed) return;
    const upright = this.viewerUprightRot(seed.rot);
    // Lock the whole pile to peers for the entire face-down → straighten → gather →
    // riffle flow so no card can be grabbed mid-shuffle. Worst-case duration covers
    // every phase; the guaranteed release timer frees it even on an early return.
    this.lockPileForAnim(stack, FLIP_ANIM_MS + STACK_STRAIGHTEN_MS + STACK_TIDY_MS + SHUFFLE_ANIM_MS);
    // Three clean beats: turn the whole pile face-DOWN (so no faces flash through the
    // gather), THEN straighten + gather into one pile, THEN riffle-shuffle the squared
    // deck. A face-down resting deck skips the turn and shuffles at once.
    this.turnPileFaceDown(stack, () => {
      this.tidyStackThen(stack, id, () => {
        if (this.stackBlocked(stack)) return; // re-confirm after the tidy delay
        shuffleStack(this.state, stack, upright); // randomise z-order; faces already down
        for (const cid of stack) { this.claimIfInOwnZone(cid); this.dirtyIds.add(cid); }
        this.elevateDuringAnim(stack, SHUFFLE_ANIM_MS);
        this.applyShuffleJitter(stack); // faces already down, so just the clean riffle wobble
        // Send immediately with a shuffle hint so peers riffle the same pile.
        this.flushWithAnim(stack, { kind: "shuffle", ids: stack });
        void this.audio.play("shuffle");
      }, SHUFFLE_ANIM_MS);
    });
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
    // A finished gesture is a commit, not a preview: it must not be dropped by the
    // send-rate bucket during a busy drag, or peers keep the stale position.
    this.bus.sendCommit({ v: this.patchVersion, by: this.self.id, cards });
    if (this.debug) this.debug.sent++;
    this.dirtyIds.clear();
  }

  // Send a flip/shuffle's cards IMMEDIATELY (bypassing the 40ms batch) carrying a
  // cosmetic `anim` hint so remote peers replay the same flourish instead of
  // snapping. The hinted ids are stamped here and REMOVED from dirtyIds so the next
  // ordinary flush can't re-send them with a newer ts (which would double-fire /
  // race). Any other still-dirty cards (e.g. ownership-only) flush normally after.
  private flushWithAnim(ids: string[], anim: PatchAnim): void {
    const now = this.stamp();
    const cards = ids.slice(0, 200).map((id) => {
      // Clear the dirty flag for every requested id, even one whose card vanished
      // (a race between the gesture and a deletion), so a missing id can never
      // linger in dirtyIds and get retried forever by the next flush.
      this.dirtyIds.delete(id);
      const c = this.state.cards.get(id);
      if (!c) return null;
      c.ts = now;
      c.by = this.self.id;
      return this.wireCard(c);
    }).filter((c): c is PatchCard => !!c);
    if (!cards.length) return;
    this.patchVersion++;
    // Flip/shuffle is a commit with a one-shot cosmetic hint: never throttle it,
    // or a peer mid-drag misses the flourish and the face/order diverges.
    this.bus.sendCommit({ v: this.patchVersion, by: this.self.id, cards, anim });
    if (this.debug) this.debug.sent++;
    if (this.dirtyIds.size) this.scheduleFlush();
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
      // Drop anyone we just kicked/removed: they can linger in presenceState for a
      // moment after removal, and must not be resurrected. (Never tombstone self.)
      this.pruneTombstones();
      // A tombstoned client that re-appears with a NEWER connAt is genuinely back
      // (not a stale presence echo): clear its tombstone so we show them at once,
      // instead of hiding the returnee until the grace lapses. connAt is per-device,
      // so this is skew-safe. The remaining tombstones are true stale echoes.
      for (const p of players) {
        const tomb = this.removedTombstones.get(p.id);
        if (tomb && shouldClearTombstone(tomb.connAt, p.connAt)) this.removedTombstones.delete(p.id);
      }
      const roster = (players.length ? players.slice() : [this.presencePayload()])
        .filter((p) => p.id === this.self.id || !this.removedTombstones.has(p.id));
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
      // Pure, tested seat resolution: dedupes one seat per id (kills the away-ghost
      // duplicate on return), reclaims a returning player's own free seat, never
      // seats a tombstoned (kicked/left) id, and never auto-seats a pure spectator.
      const byId = new Map(sorted.map((p) => [p.id, p]));
      const claimList: SeatClaimEntry[] = [...this.seatClaims].map(([seat, c]) => ({ seat, id: c.id }));
      const seating = resolveSeating(
        sorted.map((p) => ({ id: p.id, seat: p.seat, joinedAt: p.joinedAt })),
        claimList,
        this.removedTombstones,
        SEAT_COUNT
      );
      const bySeat = new Map<number, PresencePlayer>();
      for (const [seat, id] of seating.bySeat) { const p = byId.get(id); if (p) bySeat.set(seat, p); }
      const resolved = seating.resolved;

      // 2) Rebuild claims to EXACTLY match the resolved seating: a present player owns
      // their resolved seat; a seat with no present owner keeps its away claim UNLESS
      // that claim's id is now seated elsewhere or tombstoned (no duplicate/ghost).
      this.activeSeats = new Set(bySeat.keys());
      const seatedIds = new Set([...bySeat.values()].map((p) => p.id));
      // Retain connAt on the claim too, so an away player's last-known connAt is
      // available if their seat later expires and we tombstone them (lets a stale
      // zombie echo stay suppressed while a genuine return clears it).
      for (const [seat, p] of bySeat) this.seatClaims.set(seat, { id: p.id, name: p.name, joinedAt: p.joinedAt, connAt: p.connAt });
      for (const [seat, claim] of [...this.seatClaims]) {
        if (this.activeSeats.has(seat)) continue; // owned by a present player, fine
        // An away claim is kept only if its owner isn't tombstoned and isn't now
        // seated on another seat (which would make this an id-duplicate ghost).
        if (this.removedTombstones.has(claim.id) || seatedIds.has(claim.id)) {
          this.seatClaims.delete(seat);
        }
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

      // Track host transfer: when the role moves, remember the OUTGOING host briefly so
      // a kick they issued just before the handoff is still honoured by peers (see
      // handleKicked). Prune expired entries so the map stays tiny.
      const nowHost = this.hostId();
      if (nowHost !== this.lastHostId) {
        if (this.lastHostId) this.recentHosts.set(this.lastHostId, Date.now() + Game.RECENT_HOST_MS);
        this.lastHostId = nowHost;
      }
      const nowMs = Date.now();
      for (const [hid, until] of this.recentHosts) if (until <= nowMs) this.recentHosts.delete(hid);

      // Keep every handle on the table unique. If another player shares our name,
      // exactly ONE of us yields — the LATER joiner (tie broken by id), so all
      // clients pick the same loser deterministically and the table never shows
      // two identical names. We only ever rename OURSELVES (our id is unchanged),
      // then re-publish so peers see the new handle.
      this.ensureUniqueName(sorted);

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
      // Arm / cancel the away-grace timer per seat: a seat that is reserved by a
      // dropped owner (claim present but not active) starts a countdown to full
      // eviction; a seat that is active again or empty clears any pending timer.
      this.manageAwayTimers();
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

  // Mark an id as recently removed so a lagging presence sync can't resurrect it. We
  // record the leaver's LAST-KNOWN connAt (read from the live roster BEFORE we prune
  // them) so a later presence with a newer connAt is recognised as a genuine return
  // and the tombstone is cleared (see applyPresence). The hard `until` is a leak guard.
  private tombstone(id: string, connAtHint?: number): void {
    if (!id || id === this.self.id) return;
    // The leaver's last-known connАt: caller hint (their claim, captured before it
    // was freed) wins, else the live roster, else any retained claim. A stale echo
    // re-publishes this same connAt and stays suppressed; a genuine return publishes
    // a newer one and clears the tombstone (see applyPresence).
    let connAt = connAtHint ?? this.players.get(id)?.connAt ?? this.lastRoster.find((p) => p.id === id)?.connAt;
    if (connAt === undefined) {
      for (const c of this.seatClaims.values()) if (c.id === id) { connAt = c.connAt; break; }
    }
    // Monotonic connAt: never LOWER an existing tombstone's stamp. A later call with a
    // stale/0 connAt (e.g. a kick handled before presence seated the returning player)
    // must not downgrade a tombstone set with the real connAt, or the player's own
    // current presence would clear it and the kick would be undone (the "first kick does
    // nothing, second works" bug). Only a genuinely newer reconnect (a higher connAt in
    // applyPresence) clears it.
    const prev = this.removedTombstones.get(id);
    const next = Math.max(connAt ?? 0, prev?.connAt ?? 0);
    this.removedTombstones.set(id, { connAt: next, until: Date.now() + Game.TOMBSTONE_MS });
  }
  private pruneTombstones(): void {
    const now = Date.now();
    for (const [id, t] of this.removedTombstones) if (t.until <= now) this.removedTombstones.delete(id);
  }

  // Start a grace countdown for every seat that is currently "away" (a persistent
  // claim whose owner is not present), and cancel the countdown for any seat that
  // is active again or has become empty. When a countdown elapses the seat is
  // vacated for good (expireSeat), so a player who really left never stays shown
  // as "away" forever — while a quick drop+reconnect keeps their seat.
  private manageAwayTimers(): void {
    for (let seat = 0; seat < SEAT_COUNT; seat++) {
      const claim = this.seatClaims.get(seat);
      const away = !!claim && !this.activeSeats.has(seat);
      const pending = this.awayTimers.get(seat);
      if (away) {
        if (pending) continue; // already counting down for this seat
        const claimId = claim!.id;
        const handle = window.setTimeout(() => {
          this.awayTimers.delete(seat);
          this.expireSeat(seat, claimId);
        }, Game.AWAY_GRACE_MS);
        this.awayTimers.set(seat, handle);
      } else if (pending) {
        window.clearTimeout(pending);
        this.awayTimers.delete(seat);
      }
    }
  }

  // The away grace lapsed: if the seat is STILL held by the same dropped claim,
  // vacate it for good. applyLeft already frees the seat, releases that seat's
  // cards to the public table and tombstones the owner — exactly what we want.
  private expireSeat(seat: number, claimId: string): void {
    const claim = this.seatClaims.get(seat);
    if (!claim || claim.id !== claimId) return; // reclaimed or already gone
    if (this.activeSeats.has(seat)) return; // owner came back just in time
    this.applyLeft({ id: claimId, seat });
    // Each client runs its own away countdown, so they can lapse a few moments
    // apart (or a late joiner never saw the away state at all). Broadcast the
    // departure so every peer frees the seat and releases its cards at once
    // instead of waiting for its own timer or the next host reconcile. applyLeft
    // is idempotent and tombstoned, so a redundant `left` from another client is a
    // harmless no-op.
    this.bus.sendLeft({ id: claimId, seat });
  }

  private clearAwayTimers(): void {
    for (const handle of this.awayTimers.values()) window.clearTimeout(handle);
    this.awayTimers.clear();
  }

  // Handle an explicit departure (leave / kick): free the seat and release every
  // card that seat owned so the table becomes public/interactable again.
  private applyLeft(l: LeftMsg): void {
    if (l.seat < 0) return;
    // Guard against a stale `left`: only act if this id still holds the seat. If
    // someone else has already reclaimed it, leave their claim untouched.
    const claim = this.seatClaims.get(l.seat);
    if (claim && claim.id !== l.id) {
      // Just prune the stale leaver from the roster; don't free the new occupant.
      this.players.delete(l.id);
      this.lastRoster = this.lastRoster.filter((p) => p.id !== l.id);
      return;
    }
    this.seatClaims.delete(l.seat);
    this.activeSeats.delete(l.seat);
    // The seat is vacated now: drop any pending away-grace countdown for it.
    const pendingAway = this.awayTimers.get(l.seat);
    if (pendingAway) { window.clearTimeout(pendingAway); this.awayTimers.delete(l.seat); }
    // Forget the leaver entirely so a re-evaluation can't resurrect them from a
    // stale roster (e.g. presence sync hasn't dropped them yet after a kick). The
    // tombstone makes the next applyPresence ignore their lingering presence too.
    // Pass the freed claim's connAt (the local ref outlives the map delete above) so
    // an away-expired leaver — absent from the live roster — is still tombstoned with
    // their real last connAt, not 0.
    this.tombstone(l.id, claim?.connAt);
    this.players.delete(l.id);
    this.lastRoster = this.lastRoster.filter((p) => p.id !== l.id);
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
    // Remove the leaver's ghost cursor and release any hold-locks they held, so
    // their just-freed cards are immediately grabbable (not stuck until the 6s TTL).
    const el = this.cursorEls.get(l.id);
    if (el) { el.remove(); this.cursorEls.delete(l.id); }
    for (const [cid, h] of this.heldByOther) {
      if (h.seat === l.seat) this.heldByOther.delete(cid);
    }
    // Free ONLY this seat and repaint. We deliberately do NOT re-run applyPresence
    // here: it was being fed this.lastRoster (a stale snapshot), which — with the
    // leaver already pruned from this.players — re-evaluated against an old roster
    // and flipped still-active players to "away". The next real presence sync
    // (debounced) re-seats correctly; a spectator taking the freed seat one sync
    // later is a fine trade for never showing a false "everyone is away".
    this.manageAwayTimers();
    this.refreshZones();
    if (released) this.scheduleFlush();
    this.requestRender();
  }

  // Merge seat claims taught to us by an authoritative peer's snapshot. The
  // snapshot's sender is the host (lowest active seat), so its claims are the
  // source of truth for AWAY seats — every client must converge on the same away
  // picture. We overwrite our claim for any seat that is NOT currently held by an
  // active player (an active seat's claim comes from live presence; leave it). A
  // newcomer thus learns about players who dropped before it joined, and a stale
  // local claim is corrected to match the host.
  private mergeClaims(claims: SeatClaim[]): void {
    let changed = false;
    const fromSnapshot = new Set<number>();
    for (const c of claims) {
      if (c.seat < 0 || c.seat >= SEAT_COUNT) continue;
      fromSnapshot.add(c.seat);
      if (this.activeSeats.has(c.seat)) continue; // live presence owns active seats
      // Don't resurrect a player we just removed (kick/leave) — tombstones win.
      if (this.removedTombstones.has(c.id)) continue;
      const cur = this.seatClaims.get(c.seat);
      // Prefer the wire's seniority when it carries one (so a newcomer learns an away
      // host's real joinedAt and ranks host the same as everyone else); else keep ours.
      const wireJoinedAt = typeof c.joinedAt === "number" && c.joinedAt > 0 ? c.joinedAt : 0;
      const nextJoinedAt = wireJoinedAt || cur?.joinedAt || 0;
      // Prefer the wire's connAt too (monotonic: never lower a known stamp), so a claim
      // learned from a snapshot has a real connAt and a kick of that away player sticks.
      const wireConnAt = typeof c.connAt === "number" && c.connAt > 0 ? c.connAt : 0;
      const nextConnAt = Math.max(wireConnAt, cur?.connAt ?? 0);
      const needsUpdate = !cur || cur.id !== c.id || cur.name !== c.name || cur.joinedAt !== nextJoinedAt || cur.connAt !== nextConnAt;
      if (needsUpdate) {
        this.seatClaims.set(c.seat, { id: c.id, name: c.name, joinedAt: nextJoinedAt, connAt: nextConnAt });
        changed = true;
      }
    }
    // A seat the authoritative snapshot does NOT claim, and that no active player
    // holds, is genuinely empty — drop a stale local away-claim for it so we don't
    // keep showing a dropped player the host has already let go.
    for (const [seat] of this.seatClaims) {
      if (!fromSnapshot.has(seat) && !this.activeSeats.has(seat)) {
        this.seatClaims.delete(seat);
        changed = true;
      }
    }
    if (changed) { this.manageAwayTimers(); this.refreshZones(); }
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
      if (s === "online") {
        // On a genuine RECONNECT (not the first connect), stamp a fresh connAt and
        // re-publish, so peers who tombstoned us after the away grace see a newer
        // connAt and clear it — we reappear at once instead of staying hidden until
        // the tombstone's hard expiry. The first connect already has a fresh connAt.
        if (this.hasBeenOnline) {
          this.selfConnAt = Date.now();
          this.bus.updateMe(this.presencePayload());
        }
        this.hasBeenOnline = true;
      }
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

  // The host is the room's "owner": the present, seated player who has been here the
  // LONGEST (earliest joinedAt). It transfers to the next-oldest present player the
  // moment the host leaves, and a returning ex-host can never steal it back (their
  // reconnect gives them a newer joinedAt). Only the host can kick / reset the deck.
  private hostCandidates(): HostCandidate[] {
    const active: HostCandidate[] = [];
    for (const p of this.players.values()) {
      if (p.seat >= 0 && this.activeSeats.has(p.seat)) {
        active.push({ id: p.id, joinedAt: p.joinedAt, seat: p.seat });
      }
    }
    // Our own presence may not be in `players` yet on the very first paint; include
    // self when seated so isHost() is correct immediately.
    if (!this.spectator && this.claimSeat >= 0 && !active.some((c) => c.id === this.self.id)) {
      active.push({ id: this.self.id, joinedAt: this.selfJoinedAt, seat: this.claimSeat });
    }
    // Include AWAY claims (seat reserved, owner not currently present) so a host that
    // merely DROPPED keeps the role for the whole away-grace window instead of it
    // bouncing to another player the instant their presence vanishes. The dropped host
    // is the earliest joiner, so hostId() keeps them; once the claim is released (real
    // leave/kick or grace expiry) the role transfers to the next-oldest active player.
    const awayClaims: AwayHostClaim[] = [];
    for (const [seat, claim] of this.seatClaims) {
      if (this.activeSeats.has(seat)) continue;
      awayClaims.push({ id: claim.id, joinedAt: claim.joinedAt, seat });
    }
    return hostCandidatesWithAway(active, awayClaims);
  }
  private hostId(): string {
    return hostId(this.hostCandidates());
  }
  private isHost(): boolean {
    return isHost(this.self.id, this.hostCandidates(), this.spectator);
  }

  // True if `id` is the host now OR was the host within the last few seconds (a
  // just-departed host whose handoff our roster may not have caught up to yet). Used
  // to accept a kick issued right before a host transfer; the authoritative `removed[]`
  // reconcile converges anyone we still reject.
  private hostOrRecent(id: string): boolean {
    if (id && id === this.hostId()) return true;
    const until = this.recentHosts.get(id);
    if (until === undefined) return false;
    if (until <= Date.now()) { this.recentHosts.delete(id); return false; }
    return true;
  }

  // A kick was broadcast. Every client acts on it, not just the target:
  //  - the TARGET leaves to a fresh room as host;
  //  - everyone ELSE evicts that player immediately (seat freed, cards public,
  //    tombstoned) so a kick removes them for good even if the target is offline
  //    and never sends its own `left`. A kicked player is GONE for all, never
  //    shown as "away".
  private handleKicked(k: KickMsg): void {
    // Only honour a kick issued by the current host (or a host that stepped down in
    // the last few seconds, so a handoff race doesn't drop a valid kick). This blocks a
    // forged kick from a non-host peer (the kick button is host-only in the UI, but the
    // channel is untrusted). Anyone we still wrongly reject converges via the host's
    // authoritative `removed[]` reconcile.
    if (!k.by || !this.hostOrRecent(k.by)) return;
    if (k.target === this.self.id) {
      // We were kicked: wipe ALL our data for this room so we return as a brand-new
      // presence (and can't reclaim the seat), then move to a fresh empty room.
      this.clearRoomStorage(this.room);
      void this.joinRoom(newRoom()).then(() => toast(t("kick.kicked")));
      return;
    }
    // A peer (not the target): evict the kicked player. Tombstone FIRST, with a connAt
    // that their current presence cannot clear (the host's stamp, maxed with anything we
    // know locally), so the eviction sticks even if our presence has not seated the
    // returning player yet. Then free the seat and release its cards if we have it.
    const known = this.players.get(k.target)?.connAt ?? this.lastRoster.find((p) => p.id === k.target)?.connAt ?? 0;
    this.tombstone(k.target, Math.max(k.connAt ?? 0, known));
    const seat = this.seatOfId(k.target);
    if (seat >= 0) {
      this.applyLeft({ id: k.target, seat });
    } else {
      this.players.delete(k.target);
      this.lastRoster = this.lastRoster.filter((p) => p.id !== k.target);
      this.refreshZones();
      this.requestRender();
    }
  }

  // Resolve the seat a client id currently holds (active or claimed), else -1.
  private seatOfId(id: string): number {
    const p = this.players.get(id);
    if (p && p.seat >= 0) return p.seat;
    for (const [seat, claim] of this.seatClaims) if (claim.id === id) return seat;
    return -1;
  }

  // Host-only: confirm, then ask the player on `seat` to leave. Works on an
  // ACTIVE occupant or a DROPPED/away seat (resolved from its persistent claim),
  // so the host can always clear a seat — present or not.
  private confirmKick(seat: number): void {
    if (!this.isHost() || seat === this.self.seat) return;
    const occupant = Array.from(this.players.values()).find((p) => p.seat === seat);
    const claim = this.seatClaims.get(seat);
    const target = occupant
      ? { id: occupant.id, name: occupant.name, connAt: occupant.connAt }
      : (claim ? { id: claim.id, name: claim.name, connAt: claim.connAt } : null);
    if (!target) return;
    void this.audio.play("ui-open");
    openConfirm(
      this.modal,
      {
        title: t("kick.title"),
        body: t("kick.body", { name: target.name }),
        confirmLabel: t("kick.confirm"),
        danger: true
      },
      () => {
        // Carry the target's last-known connAt so every peer tombstones them with a
        // stamp their own current presence cannot clear (a returning, re-kicked player
        // is removed on the FIRST kick, not the second).
        this.bus.sendKick(target.id, this.self.id, target.connAt);
        // Apply the eviction locally right away rather than waiting for the kicked
        // client to echo a `left` (which races, or never arrives if they are
        // offline): free the seat, release that seat's cards to the table, and drop
        // them from our roster so they vanish from our screen immediately. Peers
        // converge the same way via the kicked client's `left` and presence sync.
        this.players.delete(target.id);
        this.applyLeft({ id: target.id, seat });
        toast(t("kick.done", { name: target.name }));
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
      // The holder re-broadcasts the same hold every HOLD_TTL_MS/2 to refresh the TTL.
      // Only a genuinely NEW lock (or a seat change) alters the visual, so render only
      // then — a plain TTL refresh on an unchanged set extends `until` silently instead
      // of forcing a repaint every few seconds for every held pile.
      for (const id of h.ids) {
        const prev = this.heldByOther.get(id);
        if (!prev || prev.seat !== h.seat) changed = true;
        this.heldByOther.set(id, { seat: h.seat, until: h.until });
      }
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

  // Lock a whole pile to peers for the duration of a multi-phase animation
  // (straighten → gather → flip/shuffle), then release it automatically. Peers see the
  // cards as held (is-locked) and every interaction path rejects them, so no one can
  // grab/flip/rotate a card out from under the running animation. The release is a
  // GUARANTEED timer covering the worst-case total, so an early return inside the
  // flow can never leave a stuck lock. We never clobber an in-progress drag hold
  // (mutually exclusive in practice, but guarded so a stray gesture can't release a
  // drag's cards early). Locking uses the same myHeldIds/heldByOther machinery as a
  // drag, so applyPatch leaves the actor's pile untouched while it animates too.
  private lockPileForAnim(stack: string[], totalMs: number): void {
    if (this.spectator || stack.length < 2) return;
    if (this.myHeldIds.length) return; // a drag hold is active — don't clobber it
    this.broadcastHold(stack, false);
    const ids = stack.slice();
    const token = ids.join(",");
    window.setTimeout(() => {
      // Release only if WE still own this exact lock. If a drag started in the
      // meantime it replaced myHeldIds with its own cards; releasing here would clear
      // the drag's hold, so we leave it alone (the orphaned pile lock auto-expires at
      // the hold TTL on peers — bounded and harmless).
      if (this.myHeldIds.join(",") === token) this.broadcastHold(ids, true);
    }, totalMs + 80);
  }

  private sendSnapshot(): void {
    this.patchVersion++;
    const cards: PatchCard[] = Array.from(this.state.cards.values()).slice(0, 200).map((c) => this.wireCard(c));
    // Teach the receiver our known seat claims so a player who dropped before
    // they joined still shows as a reserved (dimmed) seat, not an empty one.
    const claims: SeatClaim[] = Array.from(this.seatClaims.entries()).map(([seat, c]) => ({ seat, id: c.id, name: c.name, joinedAt: c.joinedAt, connAt: c.connAt }));
    // Teach the receiver who we have authoritatively removed (kicked/left) so a joiner
    // or a client that missed the one-shot message converges instead of resurrecting
    // them from a lingering presence echo.
    this.bus.sendSnapshot({ v: this.patchVersion, by: this.self.id, cards, claims, removed: this.buildRemovedList() });
  }

  // Snapshot of the players we have authoritatively removed (kicked/left), for the
  // reconcile/snapshot `removed[]` field. Capped at 16 (far above the 4 seats) so it
  // can never bloat the payload; expired tombstones are pruned first.
  private buildRemovedList(): RemovedEntry[] {
    this.pruneTombstones();
    const out: RemovedEntry[] = [];
    for (const [id, tomb] of this.removedTombstones) {
      out.push({ id, connAt: tomb.connAt, seat: this.seatOfId(id) });
      if (out.length >= 16) break;
    }
    return out;
  }

  // Converge an authoritative removal list (from a reconcile/snapshot): for each id we
  // still consider present-or-claimed, free its seat and tombstone it — UNLESS it is
  // genuinely back with a newer connAt (shouldReTombstone), in which case the removal
  // is stale and ignored. Idempotent: a replay finds nothing left to do.
  private applyRemoved(removed: RemovedEntry[]): void {
    for (const r of removed) {
      if (!r.id || r.id === this.self.id) continue;
      const present = this.players.get(r.id);
      if (!shouldReTombstone(r.connAt, present?.connAt)) continue; // they're back
      const seat = this.seatOfId(r.id);
      if (seat >= 0) {
        this.applyLeft({ id: r.id, seat }); // frees seat, releases cards, tombstones
      } else if (!this.removedTombstones.has(r.id)) {
        this.tombstone(r.id, r.connAt);
        if (this.players.delete(r.id)) this.requestRender();
        this.lastRoster = this.lastRoster.filter((p) => p.id !== r.id);
      }
    }
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
        // Skew-proof LWW (shared, unit-tested rule): newer ts wins; equal ts broken
        // by writer id. Advancing our clock past everything we see lets our next
        // edit win in turn.
        if (!isNewerWrite(upd.ts, writer, c.ts, c.by)) continue;
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
    // Converge on the sender's authoritative removals (reconcile + snapshot): a client
    // that missed a one-shot left/kick frees the seat and tombstones the player here,
    // so a kicked/departed player never lingers as "away" on some screens.
    if (p.removed && p.removed.length) this.applyRemoved(p.removed);
    // Replay the actor's flip/shuffle flourish on our side (state is already set;
    // this is purely cosmetic). Snapshots carry no anim hint.
    if (!isSnapshot && p.anim) this.playRemoteAnim(p.anim);
    this.requestRender();
  }

  // A remote peer flipped/shuffled a pile; play the same animation here. State is
  // already applied by applyPatch, so this only drives the visual. Defensive: skip
  // ids we don't have or aren't rendering, skip if already animating (idempotent),
  // and NEVER animate a rival's private card (privacy — such flips are blocked
  // upstream anyway, this is a second layer).
  private playRemoteAnim(anim: PatchAnim): void {
    const ids = anim.ids.filter((id) => this.state.cards.has(id) && this.cardEls.has(id));
    if (!ids.length || this.anyAnimating(ids)) return;
    for (const id of ids) if (this.isRivalOwnedCard(id)) return;
    if (anim.kind === "flip") {
      // Physical turn-over: the patch already carries the reversed z and the unified
      // target faces, so flipVisibleCardId picks the SAME visible card the actor saw,
      // and the whole pile turns as one solid block to the shared face.
      const toFaceUp = anim.toFaceUp === true;
      const visibleId = flipVisibleCardId(this.state, ids, toFaceUp);
      this.runSameFaceTurn(ids, visibleId, toFaceUp, FLIP_ANIM_MS);
    } else {
      // Shuffle: turn any showing faces down smoothly first (mirrors the actor, no
      // snap), then riffle. State already faced the cards down via applyPatch.
      this.turnPileFaceDown(ids, () => {
        this.elevateDuringAnim(ids, SHUFFLE_ANIM_MS);
        this.applyShuffleJitter(ids);
      });
    }
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
      // Gate on the TOTAL roster, not just seated/active players: a host with one
      // active seat but a spectator (or an away peer) still needs to broadcast the
      // authoritative removed[] so a peer that missed a one-shot kick/left converges.
      // Using activeSeats here let a kicked player linger forever on a spectator that
      // dropped the kick packet, since the reconcile that would heal it went silent.
      if (this.players.size <= 1 || !this.isHost()) return;
      this.patchVersion++;
      const cards = Array.from(this.state.cards.values()).slice(0, 200).map((c) => this.wireCard(c));
      // Reconcile is a LWW patch (each card keeps its stored ts), sent on a path
      // exempt from the send-rate cap so a busy table never drops the self-heal. It
      // also carries the authoritative removed[] list so a peer that missed a
      // left/kick converges within the 2s cadence instead of after the away grace.
      this.bus.sendReconcile({ v: this.patchVersion, by: this.self.id, cards, removed: this.buildRemovedList() });
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
      // The face class is gated by the SAME `busy` guard as transform/z/concealment.
      // While a card is mid-turn (is-animating), its flip is driven by runFlipVisual
      // (old face → rAF → new face) so the rotateY actually animates. If the render
      // loop also toggled is-faceup here, a remote/late state write would SNAP the
      // face instantly and the turn would never play. The settle frame (busy clears)
      // writes the authoritative face.
      if (!busy) {
        const wasFaceUp = el.classList.contains("is-faceup");
        el.classList.toggle("is-faceup", c.faceUp);
        // If a card just turned face-down, dismiss any tooltip it was showing.
        if (wasFaceUp && !c.faceUp) this.tooltip.hide();
      }
      // A card owned by a rival seat that is STILL HELD by someone (active or away)
      // is shown to us as its blurred back, however the owner placed or flipped it.
      // Only the owner sees their own card face. A spectator owns no seat, so every
      // held-seat card is concealed from them. Crucially, a card whose owner seat is
      // now EMPTY (the player left/was kicked, or nobody ever sat there) is NOT
      // concealed — it has no private zone anymore, so it reads as a public table
      // card that anyone can see and grab. Skip the toggle WHILE a turn is
      // animating: the concealment rule forces rotateY(0), which would fight a
      // flip mid-rotation; the very next frame after the turn settles writes the
      // correct class.
      if (!busy) el.classList.toggle("is-concealed", this.isRivalOwnedCard(c.id));
      // Busy indicator while a peer is holding this card. Skip while WE are dragging
      // or animating it (busy): a stale peer lock would otherwise paint the dashed
      // "locked" outline on top of our own grab/flip. The settle frame restores it.
      if (!busy) el.classList.toggle("is-locked", this.isLockedByOther(c.id));
      else el.classList.remove("is-locked");
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
    // Keep the menu's host-only controls (reset deck) in sync with who the host is.
    this.header.setHostMode(host);
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

      // The name / status light / kick live in the non-rotating label layer that
      // shares this seat's physical slot, so they stay upright and above cards.
      const labelEl = this.physicalLabelForSeat(seat);
      if (labelEl) {
        labelEl.style.setProperty("--seat-color", `var(--seat-${seat})`);
        labelEl.dataset.seat = String(seat);
        labelEl.classList.toggle("is-empty", !isActive && !isDropped);
        labelEl.classList.toggle("is-active", isActive);
        labelEl.classList.toggle("is-dropped", isDropped);

        const nameEl = labelEl.querySelector<HTMLElement>('[data-role="name"]');
        if (nameEl) {
          let label = "";
          if (occupant) label = occupant.id === this.self.id ? `${occupant.name}${youSuffix}` : occupant.name;
          else if (isSelfSeat) label = `${this.self.name}${youSuffix}`;
          else if (isDropped && claim) label = `${claim.name}${droppedSuffix}`;
          if (nameEl.textContent !== label) nameEl.textContent = label;
        }

        // Host-only kick control on any rival seat that is occupied OR dropped
        // (away). The host must be able to evict a player who has gone away, not
        // just an active one — so a stuck "away" seat can always be cleared.
        const kickBtn = labelEl.querySelector<HTMLButtonElement>('[data-action="kick"]');
        if (kickBtn) {
          const kickName = occupant ? occupant.name : (isDropped && claim ? claim.name : "");
          const canKick = host && seat !== this.self.seat && (!!occupant || (isDropped && !!claim));
          kickBtn.hidden = !canKick;
          kickBtn.dataset.seat = String(seat);
          if (canKick && kickName) kickBtn.setAttribute("aria-label", t("kick.aria", { name: kickName }));
        }
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
    this.leaving = true; // suspend the periodic save so it can't rewrite OLD-room storage mid-switch
    try {
      // Leaving the current room for another: wipe our data for the OLD room (we're
      // deliberately leaving it) and free our seat there before hopping over. Await
      // the broadcast so peers receive the `left` before we tear the channel down —
      // otherwise they only see a presence drop and show us "away" for the grace.
      this.clearRoomStorage(this.room);
      if (this.claimSeat >= 0) await this.bus.sendLeftAndWait({ id: this.self.id, seat: this.claimSeat });
      this.seatClaims.clear();
      await this.bus.disconnect();
      this.resetTable();
      this.room = slug;
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
      // Recover seniority for a room we recently held (so we keep host); a long
      // absence or no identity yields fresh seniority. connAt is ALWAYS fresh so peers
      // read this as a real (re)join, never a stale presence echo to suppress.
      this.selfJoinedAt = this.resolveSeniority(ident);
      this.selfConnAt = Date.now();
      // Re-entry always WANTS a seat. CRITICAL: joinRoom reuses this Game instance, so
      // a prior session that ended as a spectator left this.spectator=true and
      // claimSeat=-1; without this reset the first presence payload would publish -1
      // ("established spectator") and resolveSeating would keep us out even when a seat
      // is free. Reset to a concrete wanted seat so a returning ex-spectator can play.
      this.self.seat = this.self.seat >= 0 ? this.self.seat : 0;
      this.spectator = false;
      this.header.setSpectatorMode(false);
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
      this.leaving = false;
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
      this.leaving = true; // suspend the periodic save during the room switch (see joinRoom)
      try {
        // We're leaving on purpose: wipe ALL of our data for this room so we return
        // as a brand-new presence and nothing stale lingers to cause a ghost.
        this.clearRoomStorage(this.room);
        // Tell peers we are LEAVING (not merely dropping): they free our seat and
        // release every card we owned so the table is interactable again.
        if (this.claimSeat >= 0) await this.bus.sendLeftAndWait({ id: this.self.id, seat: this.claimSeat });
        this.seatClaims.clear();
        // Fresh room → fresh handle. The next visit rolls a new Vaerum name.
        resetName();
        this.self.name = getOrAssignName();
        // A deliberate leave → fresh seniority AND a fresh connection stamp: we open
        // the new room as its host and can never reclaim the old room's host.
        this.selfJoinedAt = Date.now();
        this.selfConnAt = Date.now();
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
        this.leaving = false;
        hideLoader();
      }
    });
  }

  private resetTable(): void {
    // Hide any open card tooltip first: its anchor card element is about to be
    // wiped, which would otherwise leave a tooltip pinned to a card that no longer
    // exists in the new room.
    this.tooltip.hide();
    this.refs.cardsLayer.innerHTML = "";
    this.state.cards.clear();
    this.cardEls.clear();
    this.state.topZ = 10;
    this.dirtyIds.clear();
    this.patchVersion = 0;
    for (const el of this.cursorEls.values()) el.remove();
    this.cursorEls.clear();
    // Leaving the room wipes ALL roster/seat state, not just the cards. Without
    // this, the old room's players/activeSeats/claims bleed into the fresh room,
    // so a lone host in a new room sees phantom "away" players. Clear every
    // per-room collection here, the single point every room switch passes through.
    this.activeSeats.clear();
    this.players.clear();
    this.seatClaims.clear();
    this.lastRoster = [];
    this.removedTombstones.clear();
    this.heldByOther.clear();
    // Cancel every pending away-grace countdown so a stale timer can't fire
    // against the fresh room's seats.
    this.clearAwayTimers();
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
