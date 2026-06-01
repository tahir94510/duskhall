import { Modal, escape } from "./Modal.js";
import { t, tArr } from "../i18n/index.js";
import { ICON_PATREON, ICON_COFFEE, ICON_SUPPORT } from "./icons.js";

// Support lines contain inline <strong> markup intentionally; render raw but
// keep dynamic text safe via a small allowlist.
function renderLine(html: string): string {
  // allow only <strong>...</strong>
  const escaped = escape(html);
  return escaped.replace(/&lt;strong&gt;/g, "<strong>").replace(/&lt;\/strong&gt;/g, "</strong>");
}

export interface SupportLinks {
  /** Patreon page. */
  patreonUrl: string;
  /** Buy Me a Coffee page. */
  buyMeACoffeeUrl: string;
  /** Generic support / donate page (the original single button). */
  supportUrl: string;
}

function button(url: string, label: string, icon: string, primary: boolean): string {
  const cls = primary ? "btn btn--primary" : "btn";
  return `<a class="${cls}" href="${escape(url)}" target="_blank" rel="noopener">${icon}<span>${escape(label)}</span></a>`;
}

// Offers whichever support channels are configured — Patreon, Buy Me a Coffee
// and/or a generic page — each behind its own env var, exactly like the Feedback
// modal lists whichever feedback channels are set. The first available one is the
// primary (filled) button; the rest are secondary.
export function openSupportModal(modal: Modal, links: SupportLinks): void {
  const lines = tArr<string>("support.lines");
  const buttons: string[] = [];
  if (links.patreonUrl) buttons.push(button(links.patreonUrl, t("support.patreon"), ICON_PATREON, buttons.length === 0));
  if (links.buyMeACoffeeUrl) buttons.push(button(links.buyMeACoffeeUrl, t("support.buymeacoffee"), ICON_COFFEE, buttons.length === 0));
  if (links.supportUrl) buttons.push(button(links.supportUrl, t("support.cta"), ICON_SUPPORT, buttons.length === 0));

  const cta = buttons.length
    ? `<div class="support__cta">${buttons.join("")}</div>`
    : `<p class="modal__sub">${escape(t("support.noUrl"))}</p>`;
  const bodyHtml = `
    <p>${escape(t("support.intro"))}</p>
    <ul class="support__list">
      ${lines.map((l) => `<li>${renderLine(l)}</li>`).join("")}
    </ul>
    ${cta}
    <p class="modal__sub" style="margin-top:14px;">${escape(t("support.thanks"))}</p>
  `;
  modal.open({ title: t("support.title"), bodyHtml });
}
