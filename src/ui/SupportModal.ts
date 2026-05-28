import { Modal, escape } from "./Modal.js";
import { t, tArr } from "../i18n/index.js";

// Support lines contain inline <strong> markup intentionally; render raw but
// keep dynamic text safe via a small allowlist.
function renderLine(html: string): string {
  // allow only <strong>...</strong>
  const escaped = escape(html);
  return escaped.replace(/&lt;strong&gt;/g, "<strong>").replace(/&lt;\/strong&gt;/g, "</strong>");
}

export function openSupportModal(modal: Modal, supportUrl: string): void {
  const lines = tArr<string>("support.lines");
  const cta = supportUrl
    ? `<a class="btn btn--primary" href="${escape(supportUrl)}" target="_blank" rel="noopener">${escape(t("support.cta"))}</a>`
    : `<p class="modal__sub">${escape(t("support.noUrl"))}</p>`;
  const bodyHtml = `
    <p>${escape(t("support.intro"))}</p>
    <ul class="support__list">
      ${lines.map((l) => `<li>${renderLine(l)}</li>`).join("")}
    </ul>
    <div class="support__cta">${cta}</div>
    <p class="modal__sub" style="margin-top:14px;">${escape(t("support.thanks"))}</p>
  `;
  modal.open({ title: t("support.title"), bodyHtml });
}
