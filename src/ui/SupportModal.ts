import { Modal, escape } from "./Modal.js";
import { t, tArr } from "../i18n/index.js";

export function openSupportModal(modal: Modal, supportUrl: string): void {
  const lines = tArr<string>("support.lines");
  const inviteRow = supportUrl
    ? `<a class="btn btn--primary" href="${escape(supportUrl)}" target="_blank" rel="noopener">${escape(t("support.cta"))}</a>`
    : `<p class="modal__sub">${escape(t("support.noUrl"))}</p>`;
  const bodyHtml = `
    <p>${escape(t("support.intro"))}</p>
    <ul class="support__list">
      ${lines.map((l) => `<li>${escape(l)}</li>`).join("")}
    </ul>
    <div class="support__cta">${inviteRow}</div>
    <p class="modal__sub" style="margin-top:12px;">${escape(t("support.thanks"))}</p>
  `;
  modal.open({ title: t("support.title"), bodyHtml });
}
