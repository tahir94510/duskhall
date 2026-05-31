import { Modal, escape } from "./Modal.js";
import { t, tArr } from "../i18n/index.js";

interface LegalSection {
  id: string;
  title: string;
  body: string[];
}

// Inline emphasis only (**bold**), applied after escaping so the generated tags
// are the sole HTML in the output. Legal/about copy is plain prose — paragraphs
// and the occasional bold lead — so the renderer stays deliberately simple.
function inline(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderBody(lines: string[]): string {
  return lines
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line) => `<p>${inline(escape(line))}</p>`)
    .join("");
}

// About / Privacy / Terms / Copyright, presented in the same side-nav + content
// layout as the rulebook (reuses the .rules CSS) so it feels native to the app.
export function openLegalModal(modal: Modal): void {
  const sections = tArr<LegalSection>("legalDoc.sections");
  const toc = sections.map((s) => `<a href="#legal-${s.id}">${escape(s.title)}</a>`).join("");
  const intro = `<p class="intro">${inline(escape(t("legalDoc.intro")))}</p>`;
  const content = sections
    .map((s) => `<section id="legal-${s.id}"><h2>${escape(s.title)}</h2>${renderBody(s.body || [])}</section>`)
    .join("");
  const bodyHtml = `<div class="rules">
    <nav class="rules__toc" aria-label="${escape(t("legalDoc.title"))}">${toc}</nav>
    <div class="rules__content">${intro}${content}</div>
  </div>`;
  modal.open({ title: t("legalDoc.title"), subtitle: t("legalDoc.subtitle"), bodyHtml });

  const body = modal.bodyEl();
  body?.querySelectorAll<HTMLAnchorElement>(".rules__toc a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const id = a.getAttribute("href");
      if (!id) return;
      body.querySelector(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}
