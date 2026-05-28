import { Modal, escape } from "./Modal.js";
import { t, tArr } from "../i18n/index.js";

interface RuleSection {
  id: string;
  title: string;
  body: string[];
}

function renderBody(lines: string[]): string {
  // Group consecutive lines: bullet items (`x: y` short factoids) into <ul>, Q/A into .qa,
  // everything else stays as <p>.
  const out: string[] = [];
  let bulletBuffer: string[] = [];
  const flushBullets = () => {
    if (!bulletBuffer.length) return;
    out.push(`<ul>${bulletBuffer.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>`);
    bulletBuffer = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^Q\.\s/.test(line) || /^S\.\s/.test(line)) {
      flushBullets();
      const m = line.match(/^(Q\.|S\.)\s+(.+?)\s+(A\.|C\.)\s+(.+)$/);
      if (m) {
        out.push(`<div class="qa"><b>${escape(m[1]!)}</b><span>${escape(m[2]!)}</span><b>${escape(m[3]!)}</b><span>${escape(m[4]!)}</span></div>`);
        continue;
      }
    }
    // Lines like "FOO: bar" or short statements get bulleted if they look like list items
    if (/^[A-ZÜÇŞĞİÖ][A-ZÜÇŞĞİÖ \-]+:/.test(line) && line.length < 120) {
      bulletBuffer.push(line);
      continue;
    }
    flushBullets();
    out.push(`<p>${escape(line)}</p>`);
  }
  flushBullets();
  return out.join("");
}

export function openRulesModal(modal: Modal): void {
  const title = t("rulesDoc.title");
  const subtitle = `${t("rulesDoc.subtitle")} • ${t("rulesDoc.tldr")}`;
  const sections = tArr<RuleSection>("rulesDoc.sections");
  const tocHtml = sections.map((s) => `<a href="#sec-${s.id}">${escape(s.title)}</a>`).join("");
  const introHtml = `<p class="intro">${escape(t("rulesDoc.intro"))}</p>`;
  const sectionsHtml = sections
    .map((s) => `<section id="sec-${s.id}"><h2>${escape(s.title)}</h2>${renderBody(s.body || [])}</section>`)
    .join("");
  const closingHtml = `<div class="closing">${escape(t("rulesDoc.closing"))}</div>`;
  const bodyHtml = `<div class="rules">
    <nav class="rules__toc" aria-label="TOC">${tocHtml}</nav>
    <div class="rules__content">${introHtml}${sectionsHtml}${closingHtml}</div>
  </div>`;
  modal.open({ title, subtitle, bodyHtml });

  // wire smooth-scroll for TOC clicks
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
