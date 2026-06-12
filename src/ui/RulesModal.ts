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
const GLOSSARY_KEYS = [
  "etherResonance", "ascension", "servantShield",
  // Core vocabulary so EVERY rules term opens its info panel: the zones, the turn phases, the
  // 1-HP actions, HP itself, the Ascension trial, and untargetable status.
  "hand", "tableau", "deck", "discard",
  "focus", "action", "closing",
  "create", "study", "cleanse",
  "hp", "trial", "untargetable"
];
const CATEGORY_KEYS = ["seal", "spell", "intervention", "servant"];
function buildTermToKey(): Map<string, string> {
  const m = new Map<string, string>();
  for (const key of GLOSSARY_KEYS) {
    const term = t(`glossary.${key}.term`);
    if (term && term !== `glossary.${key}.term`) m.set(term, `g:${key}`);
  }
  for (const key of CATEGORY_KEYS) {
    // Both singular and plural forms (Seal/Seals, Mühür/Mühürler) so a type name is hover-able
    // wherever it appears in the prose. Matching is case-insensitive (see linkify), so the
    // uppercase colour-key forms (SEAL, SPELL) are covered too.
    for (const field of ["name", "namePlural"]) {
      const term = t(`categories.${key}.${field}`);
      if (term && term !== `categories.${key}.${field}` && !m.has(term)) m.set(term, `c:${key}`);
    }
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

// Resolve a phrase to a card or a term, CASE-INSENSITIVELY, so "Seal", "Seals", "SEAL" all hit
// the same panel. Card names win over terms (longest-phrase-first in the caller keeps multi-word
// names from being shadowed). Small maps (~20 cards + ~11 terms), so the linear scan is cheap.
function resolveTerm(
  phrase: string,
  nameToId?: Map<string, string>,
  termToKey?: Map<string, string>
): { kind: "card" | "term"; val: string } | null {
  const lc = phrase.toLowerCase();
  for (const [name, id] of nameToId ?? []) if (name.toLowerCase() === lc) return { kind: "card", val: id };
  for (const [term, key] of termToKey ?? []) if (term.toLowerCase() === lc) return { kind: "term", val: key };
  return null;
}

// One button markup for every hover term, so a card name, a glossary term and a card-type name
// all read identically (the styling lives in modal.css; both classes share it). `text` keeps the
// ORIGINAL casing from the prose; the data attribute carries the resolved id/key.
function termButton(hit: { kind: "card" | "term"; val: string }, text: string): string {
  const cls = hit.kind === "card" ? "card-link" : "term-link";
  const attr = hit.kind === "card" ? "data-card-id" : "data-term";
  return `<button type="button" class="${cls}" ${attr}="${escape(hit.val)}">${escape(text)}</button>`;
}

// Inline-link every card name, glossary term and card-type name wherever it appears in a line,
// so hovering (or tapping) it opens the same info panel the table uses. Matches are taken on the
// RAW text at word boundaries (Unicode-aware, so Turkish letters and a trailing apostrophe-suffix
// are handled), CASE-INSENSITIVELY, longest phrase first so "Shadow Slayer" wins over "Shadow".
// Gaps are escaped and run through the markdown-lite, so the output HTML is only our own tags.
function linkify(raw: string, nameToId?: Map<string, string>, termToKey?: Map<string, string>): string {
  const phrases = [...(nameToId?.keys() ?? []), ...(termToKey?.keys() ?? [])].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!phrases.length) return applyInline(escape(raw));
  const re = new RegExp("(?<![\\p{L}\\d])(" + phrases.map(escapeRegExp).join("|") + ")(?![\\p{L}\\d])", "giu");
  let out = "";
  let last = 0;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    out += applyInline(escape(raw.slice(last, m.index)));
    const phrase = m[1]!;
    const hit = resolveTerm(phrase, nameToId, termToKey);
    out += hit ? termButton(hit, phrase) : applyInline(escape(phrase));
    last = m.index + phrase.length;
  }
  out += applyInline(escape(raw.slice(last)));
  return out;
}

// Line-level rendering for paragraphs and list items: a leading label that ends in a colon
// ("HAND:", "CREATE (1 HP):", "Time Rift:") leads the line. If the label is a card/term/type it
// becomes the SAME hover button as inline (so its info panel is reachable there too); otherwise
// it is bolded as a plain structural label. The rest of the line is inline-linked.
function richLine(raw: string, nameToId?: Map<string, string>, termToKey?: Map<string, string>): string {
  const m = raw.match(/^([^:.!?]{2,46}):(\s+)(.+)$/s);
  if (m) {
    const hit = resolveTerm(m[1]!.trim(), nameToId, termToKey);
    const labelHtml = hit ? termButton(hit, m[1]!) : `<strong>${escape(m[1]!)}</strong>`;
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

    // Subheading: "### Timing and seals" clusters a long section (the edge-case
    // guide) into themed groups. Markdown-native in the docs mirror; here it
    // renders as an h3. Must be checked before the other line shapes.
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      flushAll();
      out.push(`<h3>${linkify(heading[1]!, nameToId, termToKey)}</h3>`);
      continue;
    }

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
  // Closing the rulebook must also dismiss any term/card info panel opened from inside it —
  // otherwise a sticky tooltip whose anchor (a term button) was just removed with the modal
  // lingers, stranded at a stale position (the top-left "ghost bubble"). hide() clears it.
  // The section observer below is disconnected on the same path.
  let sectionObserver: IntersectionObserver | null = null;
  modal.open({ title, subtitle, bodyHtml, onClose: () => { tooltip?.hide(); sectionObserver?.disconnect(); } });

  const body = modal.bodyEl();
  const setActiveToc = (id: string): void => {
    body?.querySelectorAll<HTMLAnchorElement>(".rules__toc a").forEach((a) => {
      a.classList.toggle("is-active", a.getAttribute("href") === `#${id}`);
    });
  };
  body?.querySelectorAll<HTMLAnchorElement>('.rules__toc a').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const id = a.getAttribute("href");
      if (!id) return;
      const target = body.querySelector(id);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      // Mark the clicked entry at once; the observer settles on the same section
      // when the smooth scroll lands, so there is no flicker in between.
      setActiveToc(id.slice(1));
    });
  });

  // Reading-position indicator: while the content scrolls, the TOC entry of the
  // section currently occupying the top quarter of the view is highlighted, so a
  // reader deep in a long rulebook always knows where they are. The modal body is
  // the scroll container, hence the explicit root; the bottom margin shrinks the
  // observed band to that top quarter. Of every section touching the band, the
  // FIRST in document order is the one the eye is actually in, so it wins.
  if (body && typeof IntersectionObserver === "function") {
    const sections = Array.from(body.querySelectorAll<HTMLElement>('section[id^="sec-"]'));
    if (sections.length) {
      setActiveToc(sections[0]!.id);
      const inBand = new Set<string>();
      sectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target.id);
          else inBand.delete(entry.target.id);
        }
        const current = sections.find((s) => inBand.has(s.id));
        if (current) setActiveToc(current.id);
      }, { root: body, rootMargin: "0px 0px -75% 0px", threshold: 0 });
      for (const s of sections) sectionObserver.observe(s);
    }
  }

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
