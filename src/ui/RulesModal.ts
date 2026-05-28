import { Modal, escape } from "./Modal.js";
import { t, tArr } from "../i18n/index.js";

interface RuleSection {
  id: string;
  title: string;
  body: string[];
}

export function openRulesModal(modal: Modal): void {
  const title = t("rulesDoc.title");
  const subtitle = `${t("rulesDoc.subtitle")} · ${t("rulesDoc.tldr")}`;
  const sections = tArr<RuleSection>("rulesDoc.sections");
  const introHtml = `<p class="intro">${escape(t("rulesDoc.intro"))}</p>`;
  const sectionsHtml = sections
    .map(
      (s) => `<section class="rules-section">
        <h2>${escape(s.title)}</h2>
        ${(s.body || []).map((p) => `<p>${escape(p)}</p>`).join("")}
      </section>`
    )
    .join("");
  const closingHtml = `<div class="closing">${escape(t("rulesDoc.closing"))}</div>`;
  const bodyHtml = `<div class="rules">${introHtml}${sectionsHtml}${closingHtml}</div>`;
  modal.open({ title, subtitle, bodyHtml });
}
