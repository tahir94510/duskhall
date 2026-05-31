import { Modal, escape } from "./Modal.js";
import { t } from "../i18n/index.js";

// Lets anyone send a bug report, request, or note. Offers whichever channels are
// configured: a GitHub Issues page (open to read, posting needs a GitHub account)
// and/or an account-less form (Google Form / Tally). Mirrors openSupportModal.
export function openFeedbackModal(modal: Modal, issuesUrl: string, feedbackUrl: string): void {
  const buttons: string[] = [];
  if (feedbackUrl) {
    buttons.push(
      `<a class="btn btn--primary" href="${escape(feedbackUrl)}" target="_blank" rel="noopener">${escape(t("feedback.form"))}</a>`
    );
  }
  if (issuesUrl) {
    buttons.push(
      `<a class="btn" href="${escape(issuesUrl)}" target="_blank" rel="noopener">${escape(t("feedback.issues"))}</a>`
    );
  }
  const body = buttons.length
    ? `<p>${escape(t("feedback.intro"))}</p><div class="support__cta">${buttons.join("")}</div>`
    : `<p class="modal__sub">${escape(t("feedback.none"))}</p>`;
  modal.open({ title: t("feedback.title"), bodyHtml: body });
}

/** True when at least one feedback channel is configured (controls menu‑row visibility). */
export function hasFeedbackChannel(issuesUrl: string, feedbackUrl: string): boolean {
  return !!(issuesUrl || feedbackUrl);
}
