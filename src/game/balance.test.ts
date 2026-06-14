import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { BALANCE } from "./balance.js";
import { CARD_DEFS, totalCardCount } from "./cards.js";

// Make balance.ts a real single source of truth: if the documented numbers ever
// drift from the card set or the rulebook copy, CI fails here instead of the game
// shipping with a rulebook that contradicts itself.

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const en = JSON.parse(readFileSync(resolve(root, "public/locales/en.json"), "utf8"));
const tr = JSON.parse(readFileSync(resolve(root, "public/locales/tr.json"), "utf8"));

function rulesText(doc: { rulesDoc: { sections: Array<{ body: string[] }> } }): string {
  return doc.rulesDoc.sections.flatMap((s) => s.body).join("\n");
}

describe("card set matches BALANCE", () => {
  it("the deck sums to TOTAL_CARDS", () => {
    expect(totalCardCount()).toBe(BALANCE.TOTAL_CARDS);
  });

  it("category counts are the documented 16/24/16/16", () => {
    const byCat = { seal: 0, spell: 0, intervention: 0, servant: 0 } as Record<string, number>;
    for (const d of CARD_DEFS) byCat[d.category] = (byCat[d.category] ?? 0) + d.count;
    expect(byCat.seal).toBe(16);
    expect(byCat.spell).toBe(24);
    expect(byCat.intervention).toBe(16);
    expect(byCat.servant).toBe(16);
    expect(byCat.seal + byCat.spell + byCat.intervention + byCat.servant).toBe(BALANCE.TOTAL_CARDS);
  });

  it("the deck has 15 unique faces (4 seals, 5 spells, 3 interventions, 3 servants)", () => {
    const faces = { seal: 0, spell: 0, intervention: 0, servant: 0 } as Record<string, number>;
    for (const d of CARD_DEFS) faces[d.category] = (faces[d.category] ?? 0) + 1;
    expect(faces.seal).toBe(4);
    expect(faces.spell).toBe(5);
    expect(faces.intervention).toBe(3);
    expect(faces.servant).toBe(3);
    expect(CARD_DEFS.length).toBe(15);
  });

  it("seal count never exceeds the in-play cap, ascension threshold is reachable", () => {
    expect(BALANCE.ASCENSION_SEAL_THRESHOLD).toBeLessThanOrEqual(BALANCE.MAX_SEALS_IN_PLAY);
    expect(BALANCE.HP_BASE).toBeLessThanOrEqual(BALANCE.HP_CAP);
  });
});

describe("rulebook copy agrees with BALANCE (both locales)", () => {
  for (const [name, doc] of [["en", en], ["tr", tr]] as const) {
    it(`${name}: quick-reference numbers are consistent`, () => {
      const text = rulesText(doc);
      // The total deck size and the headline distribution must appear verbatim.
      expect(text).toContain(String(BALANCE.TOTAL_CARDS));
      expect(text).toContain("16 " + (name === "en" ? "Seals" : "Mühür"));
      // Hand limit and HP cap appear in the quick reference.
      expect(text).toContain(String(BALANCE.HAND_LIMIT));
      expect(text).toContain(String(BALANCE.HP_CAP));
    });
  }
});

describe("card encyclopedia docs agree with the card set", () => {
  // The CARDS.{en,tr}.md summary line states the deck size and the UNIQUE face count.
  // Derive both from the card defs so a face added or removed can never leave a stale
  // headline (this guards the exact "15 vs 16 faces" drift the locale rulebook misses).
  const uniqueFaces = CARD_DEFS.length;
  for (const [name, total, faces] of [
    ["en", `${BALANCE.TOTAL_CARDS} cards`, `${uniqueFaces} unique faces`],
    ["tr", `${BALANCE.TOTAL_CARDS} kart`, `${uniqueFaces} benzersiz yüz`],
  ] as const) {
    it(`${name}: CARDS.${name}.md headline matches the deck and face count`, () => {
      const md = readFileSync(resolve(root, `docs/CARDS.${name}.md`), "utf8");
      expect(md).toContain(total);
      expect(md).toContain(faces);
    });
  }
});
