import { Modal, escape } from "./Modal.js";
import { t, tArr } from "../i18n/index.js";
import { CARD_DEFS } from "../game/cards.js";
import type { Tooltip } from "./Tooltip.js";

// Localised card name -> def id, so the rulebook can turn a card name (e.g. an encyclopedia
// entry's leading label) into a clickable button that opens that card's info panel. Rebuilt
// per open() because it depends on the active locale.
function buildNameToId(): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of CARD_DEFS) m.set(t(`cards.${d.id}.name`), d.id);
  return m;
}

// Non-card rules concepts that get the SAME hover/tap info panel as a card name: glossary
// entries AND the four card-type categories (Seal/Spell/Intervention/Servant). The map value
// is a source-tagged key — "g:<glossaryKey>" or "c:<categoryKey>" — so a single linkify pass
// and a single wiring path cover every term consistently. Localised term text -> tagged key.
// Keep these lists in step with the `glossary` and `categories` blocks in the locales.
const GLOSSARY_KEYS = ["etherResonance", "ascension", "servantShield"];
const CATEGORY_KEYS = ["seal", "spell", "intervention", "servant"];
function buildTermToKey(): Map<string, string> {
  const m = new Map<string, string>();
  for (const key of GLOSSARY_KEYS) {
    const term = t(`glossary.${key}.term`);
    if (term && term !== `glossary.${key}.term`) m.set(term, `g:${key}`);
  }
  for (const key of CATEGORY_KEYS) {
    const name = t(`categories.${key}.name`);
    // Don't let a type name shadow a card actually named after it (none today), and skip a
    // missing key gracefully. Longest-phrase-first in linkify keeps multi-word names winning.
    if (name && name !== `categories.${key}.name` && !m.has(name)) m.set(name, `c:${key}`);
  }
  return m;
}

interface RuleSection {
  id: string;
  title: string;
  body: string[];
}

// Inline markdown-lite: **bold** and _italic_. Runs AFTER escape so the
// generated tags are the only HTML in the output.
function applyInline(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:!?])/g, '$1<em>$2</em>');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Inline-link every card name and glossary term wherever it appears in a line, so hovering
// (or tapping) it opens the same info panel the table uses. Matches are taken on the RAW text
// at word boundaries (Unicode-aware, so Turkish letters and a trailing apostrophe-suffix are
// handled), longest phrase first so "Shadow Slayer" wins over "Shadow". Gaps are escaped and
// run through the markdown-lite, so the output HTML is only our own generated tags.
function linkify(raw: string, nameToId?: Map<string, string>, termToKey?: Map<string, string>): string {
  const phrases = [...(nameToId?.keys() ?? []), ...(termToKey?.keys() ?? [])].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!phrases.length) return applyInline(escape(raw));
  const re = new RegExp("(?<![\\p{L}\\d])(" + phrases.map(escapeRegExp).join("|") + ")(?![\\p{L}\\d])", "gu");
  let out = "";
  let last = 0;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    out += applyInline(escape(raw.slice(last, m.index)));
    const phrase = m[1]!;
    const id = nameToId?.get(phrase);
    const term = termToKey?.get(phrase);
    if (id) out += `<button type="button" class="card-link" data-card-id="${escape(id)}">${escape(phrase)}</button>`;
    else if (term) out += `<button type="button" class="term-link" data-term="${escape(term)}">${escape(phrase)}</button>`;
    else out += applyInline(escape(phrase));
    last = m.index + phrase.length;
  }
  out += applyInline(escape(raw.slice(last)));
  return out;
}

// Line-level rendering for paragraphs and list items: bold a leading label that ends in a
// colon ("HAND:", "CREATE (1 HP):", "Time Rift:") so the rulebook reads as structured
// definitions, and inline-link every card/term in the rest.
function richLine(raw: string, nameToId?: Map<string, string>, termToKey?: Map<string, string>): string {
  const m = raw.match(/^([^:.!?]{2,46}):(\s+)(.+)$/s);
  if (m) {
    const label = m[1]!.trim();
    const id = nameToId?.get(label);
    const labelHtml = id
      ? `<button type="button" class="card-link" data-card-id="${escape(id)}">${escape(m[1]!)}</button>`
      : `<strong>${escape(m[1]!)}</strong>`;
    return `${labelHtml}:${m[2]}${linkify(m[3]!, nameToId, termToKey)}`;
  }
  return linkify(raw, nameToId, termToKey);
}

function renderBody(lines: string[], nameToId?: Map<string, string>, termToKey?: Map<string, string>): string {
  const out: string[] = [];
  let bulletBuffer: string[] = [];
  let numberedBuffer: string[] = [];

  const flushBullets = () => {
    if (!bulletBuffer.length) return;
    out.push(`<ul>${bulletBuffer.map((l) => `<li>${richLine(l, nameToId, termToKey)}</li>`).join("")}</ul>`);
    bulletBuffer = [];
  };
  const flushNumbered = () => {
    if (!numberedBuffer.length) return;
    out.push(`<ol>${numberedBuffer.map((l) => `<li>${linkify(l, nameToId, termToKey)}</li>`).join("")}</ol>`);
    numberedBuffer = [];
  };
  const flushAll = () => { flushBullets(); flushNumbered(); };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Q&A grid
    if (/^Q\.\s/.test(line) || /^S\.\s/.test(line)) {
      flushAll();
      const m = line.match(/^(Q\.|S\.)\s+(.+?)\s+(A\.|C\.)\s+(.+)$/);
      if (m) {
        out.push(
          `<div class="qa"><b>${escape(m[1]!)}</b><span>${linkify(m[2]!, nameToId, termToKey)}</span>` +
          `<b>${escape(m[3]!)}</b><span>${linkify(m[4]!, nameToId, termToKey)}</span></div>`
        );
        continue;
      }
    }

    // Numbered list: "1. foo", "2. bar"
    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      flushBullets();
      numberedBuffer.push(numbered[2]!);
      continue;
    }

    // Bulleted: "FOO: bar" short factoid
    if (/^[A-ZÜÇŞĞİÖ][A-ZÜÇŞĞİÖ \-]+:/.test(line) && line.length < 120) {
      flushNumbered();
      bulletBuffer.push(line);
      continue;
    }

    flushAll();
    out.push(`<p>${richLine(line, nameToId, termToKey)}</p>`);
  }
  flushAll();
  return out.join("");
}

export function openRulesModal(modal: Modal, tooltip?: Tooltip): void {
  const title = t("rulesDoc.title");
  const subtitle = `${t("rulesDoc.subtitle")} • ${t("rulesDoc.tldr")}`;
  const sections = tArr<RuleSection>("rulesDoc.sections");
  const nameToId = buildNameToId();
  const termToKey = buildTermToKey();
  const tocHtml = sections.map((s) => `<a href="#sec-${s.id}">${escape(s.title)}</a>`).join("");
  const introHtml = `<p class="intro">${linkify(t("rulesDoc.intro"), nameToId, termToKey)}</p>`;
  const sectionsHtml = sections
    .map((s) => `<section id="sec-${s.id}"><h2>${escape(s.title)}</h2>${renderBody(s.body || [], nameToId, termToKey)}</section>`)
    .join("");
  const closingHtml = `<div class="closing">${escape(t("rulesDoc.closing"))}</div>`;
  const bodyHtml = `<div class="rules">
    <nav class="rules__toc" aria-label="TOC">${tocHtml}</nav>
    <div class="rules__content">${introHtml}${sectionsHtml}${closingHtml}</div>
  </div>`;
  modal.open({ title, subtitle, bodyHtml });

  const body = modal.bodyEl();
  body?.querySelectorAll<HTMLAnchorElement>('.rules__toc a').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const id = a.getAttribute("href");
      if (!id) return;
      const target = body.querySelector(id);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // A card name or glossary term in the rulebook opens the same info panel the table uses:
  // on HOVER after a short delay (like hovering a card), and on click/tap (sticky, for touch).
  // The hover-leave only hides a non-pinned panel, so a tapped one stays until a tap outside.
  if (tooltip && body) {
    const HOVER_DELAY = 300;
    let hoverTimer = 0;
    const wire = (btn: HTMLElement, run: (sticky: boolean) => void) => {
      btn.addEventListener("pointerenter", (e) => {
        if ((e as PointerEvent).pointerType === "touch") return;
        window.clearTimeout(hoverTimer);
        hoverTimer = window.setTimeout(() => run(false), HOVER_DELAY);
      });
      btn.addEventListener("pointerleave", () => {
        window.clearTimeout(hoverTimer);
        if (!tooltip.isSticky()) tooltip.hide();
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        window.clearTimeout(hoverTimer);
        run(true);
      });
    };
    body.querySelectorAll<HTMLButtonElement>(".card-link").forEach((btn) => {
      const id = btn.dataset.cardId;
      if (id) wire(btn, (sticky) => tooltip.showForDef(id, btn, sticky));
    });
    body.querySelectorAll<HTMLButtonElement>(".term-link").forEach((btn) => {
      const tag = btn.dataset.term;
      if (!tag) return;
      // "c:<key>" -> card-type category (name + description); anything else -> glossary term.
      const isCat = tag.startsWith("c:");
      const key = tag.slice(2);
      const title = isCat ? t(`categories.${key}.name`) : t(`glossary.${key}.term`);
      const def = isCat ? t(`categories.${key}.description`) : t(`glossary.${key}.def`);
      wire(btn, (sticky) => tooltip.showTerm(title, def, btn, sticky));
    });
  }
}
