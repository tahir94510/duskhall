import { Modal, escape } from "./Modal.js";
import { t, tArr, tObj } from "../i18n/index.js";

interface ShortcutItem { keys: string; desc: string }
interface ShortcutGroup { title: string; items: ShortcutItem[] }

function gridHtml(items: ShortcutItem[]): string {
  return `<div class="shortcuts-grid">
    ${items.map((i) => `<div><kbd>${escape(i.keys)}</kbd><span>${escape(i.desc)}</span></div>`).join("")}
  </div>`;
}

export function openShortcutsModal(modal: Modal): void {
  const subtitle = t("shortcutsList.subtitle");
  const noteObj = tObj<{ mobileNote?: string }>("shortcutsList");
  const note = noteObj?.mobileNote || "";
  // Themed groups (Basics / Piles / View / Your area / Touch) so the list reads as a
  // small skill ladder instead of one flat wall. A stale cached locale may predate
  // the groups shape; fall back to the old flat list so the panel is never empty.
  const groups = tArr<ShortcutGroup>("shortcutsList.groups").filter((g) => g && Array.isArray(g.items));
  const flat = groups.length ? [] : tArr<ShortcutItem>("shortcutsList.items");
  const bodyHtml = `
    ${groups.map((g) => `<section class="shortcuts-group"><h3>${escape(g.title)}</h3>${gridHtml(g.items)}</section>`).join("")}
    ${flat.length ? gridHtml(flat) : ""}
    ${note ? `<p class="shortcuts-note">${escape(note)}</p>` : ""}
  `;
  modal.open({ title: t("shortcutsList.title"), subtitle, bodyHtml });
}
