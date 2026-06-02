import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalBus } from "./localBus.js";
import type { GameMsg, PresencePlayer, CardPatch } from "./realtime.js";

// Node 18+ ships BroadcastChannel, so two LocalBus instances in the same process
// model two browser tabs on one machine. These tests pin the keystone guarantee:
// with Supabase out of the picture, a second tab still receives every action.

function player(id: string, seat: number): PresencePlayer {
  return { id, name: id, seat, color: "#fff", joinedAt: Date.now(), connAt: Date.now() };
}

function patch(id: string): CardPatch {
  return { v: 1, by: id, cards: [{ id: "c1", x: 0.5, y: 0.5, z: 1, rot: 0, faceUp: true, ownerSeat: null, ts: 1 }] };
}

describe("LocalBus same-device transport", () => {
  let a: LocalBus;
  let b: LocalBus;
  const ROOM = "TESTRM";

  beforeEach(() => { a = new LocalBus(); b = new LocalBus(); });
  afterEach(() => { a.disconnect(); b.disconnect(); });

  it("is supported in this runtime", () => {
    expect(LocalBus.isSupported()).toBe(true);
  });

  it("delivers a game patch from one tab to the other (not back to sender)", async () => {
    const got: GameMsg[] = [];
    const gotSelf: GameMsg[] = [];
    b.onGame((m) => got.push(m));
    a.onGame((m) => gotSelf.push(m));
    a.connect(ROOM, player("A", 0));
    b.connect(ROOM, player("B", 1));
    a.sendGame({ type: "patch", payload: patch("A") });
    await tick(30);
    expect(got.length).toBe(1);
    expect(got[0]!.type).toBe("patch");
    // The sender never receives its own broadcast (no echo loop).
    expect(gotSelf.length).toBe(0);
  });

  it("merges presence so each tab sees the other player", async () => {
    let rosterB: PresencePlayer[] = [];
    b.onPresence((p) => { rosterB = p; });
    a.connect(ROOM, player("A", 0));
    b.connect(ROOM, player("B", 1));
    await tick(40);
    const ids = new Set(rosterB.map((p) => p.id));
    expect(ids.has("A")).toBe(true);
    expect(ids.has("B")).toBe(true);
  });

  it("drops a peer from presence when it leaves", async () => {
    let rosterB: PresencePlayer[] = [];
    b.onPresence((p) => { rosterB = p; });
    a.connect(ROOM, player("A", 0));
    b.connect(ROOM, player("B", 1));
    await tick(40);
    expect(rosterB.some((p) => p.id === "A")).toBe(true);
    a.disconnect();
    await tick(40);
    expect(rosterB.some((p) => p.id === "A")).toBe(false);
  });

  it("keeps two different rooms isolated", async () => {
    const got: GameMsg[] = [];
    b.onGame((m) => got.push(m));
    a.connect("ROOM_A", player("A", 0));
    b.connect("ROOM_B", player("B", 0));
    a.sendGame({ type: "patch", payload: patch("A") });
    await tick(30);
    expect(got.length).toBe(0); // different room → no delivery
  });
});

function tick(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
