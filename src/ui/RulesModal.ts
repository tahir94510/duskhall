import { Modal, escape } from "./Modal.js";
import { t, tArr } from "../i18n/index.js";

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

// Line-level rendering for paragraphs and list items: bold a leading label
// that ends in a colon ("HAND:", "CREATE (1 HP):", "Time Rift:") so the
// rulebook reads as structured definitions instead of a flat wall of text.
function richLine(raw: string): string {
  const escaped = escape(raw);
  const m = escaped.match(/^([^:.!?]{2,46}):(\s+)(.+)$/s);
  if (m) {
    return `<strong>${m[1]}</strong>:${m[2]}${applyInline(m[3]!)}`;
  }
  return applyInline(escaped);
}

function renderBody(lines: string[]): string {
  const out: string[] = [];
  let bulletBuffer: string[] = [];
  let numberedBuffer: string[] = [];

  const flushBullets = () => {
    if (!bulletBuffer.length) return;
    out.push(`<ul>${bulletBuffer.map((l) => `<li>${richLine(l)}</li>`).join("")}</ul>`);
    bulletBuffer = [];
  };
  const flushNumbered = () => {
    if (!numberedBuffer.length) return;
    out.push(`<ol>${numberedBuffer.map((l) => `<li>${applyInline(escape(l))}</li>`).join("")}</ol>`);
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
          `<div class="qa"><b>${escape(m[1]!)}</b><span>${applyInline(escape(m[2]!))}</span>` +
          `<b>${escape(m[3]!)}</b><span>${applyInline(escape(m[4]!))}</span></div>`
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
    out.push(`<p>${richLine(line)}</p>`);
  }
  flushAll();
  return out.join("");
}

export function openRulesModal(modal: Modal): void {
  const title = t("rulesDoc.title");
  const subtitle = `${t("rulesDoc.subtitle")} • ${t("rulesDoc.tldr")}`;
  const sections = tArr<RuleSection>("rulesDoc.sections");
  const tocHtml = sections.map((s) => `<a href="#sec-${s.id}">${escape(s.title)}</a>`).join("");
  const introHtml = `<p class="intro">${applyInline(escape(t("rulesDoc.intro")))}</p>`;
  const sectionsHtml = sections
    .map((s) => `<section id="sec-${s.id}"><h2>${escape(s.title)}</h2>${renderBody(s.body || [])}</section>`)
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
}
