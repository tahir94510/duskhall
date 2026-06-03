import { Modal, escape } from "./Modal.js";
import { t, tArr } from "../i18n/index.js";

interface UpdateEntry {
  /** Stable version id (e.g. a date "2026-06"), used for the seen/new comparison.
   *  Must be identical across locales — it is an id, not translated copy. */
  v: string;
  /** Human-readable date label shown in the panel header. */
  date: string;
  /** Short headline for the entry. */
  title: string;
  /** Bullet list of changes. */
  items: string[];
}

export function updateEntries(): UpdateEntry[] {
  const e = tArr<UpdateEntry>("updates.entries");
  return Array.isArray(e) ? e.filter((x) => x && typeof x.v === "string") : [];
}

/** The newest update's version id (entries are newest-first), or "" if none. The
 *  "New" badge shows while the stored seen-version differs from this. */
export function latestUpdateVersion(): string {
  const e = updateEntries();
  return e.length ? String(e[0]!.v) : "";
}

// A simple, localized changelog: newest entry first, each with a date, a headline,
// and a bullet list. Reuses the rules/legal modal layout language so it feels native.
export function openUpdatesModal(modal: Modal): void {
  const entries = updateEntries();
  const content = entries.length
    ? entries.map((en) => `
        <section class="updates__entry">
          <div class="updates__meta">
            <span class="updates__entry-title">${escape(en.title)}</span>
            <span class="updates__date">${escape(en.date)}</span>
          </div>
          <ul class="updates__items">
            ${(Array.isArray(en.items) ? en.items : []).map((it) => `<li>${escape(it)}</li>`).join("")}
          </ul>
        </section>`).join("")
    : `<p class="modal__sub">${escape(t("updates.empty"))}</p>`;
  modal.open({ title: t("updates.title"), bodyHtml: `<div class="updates">${content}</div>` });
}
