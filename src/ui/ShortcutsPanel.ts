import { Modal, escape } from "./Modal.js";
import { t, tArr, tObj } from "../i18n/index.js";

export function openShortcutsModal(modal: Modal): void {
  const subtitle = t("shortcutsList.subtitle");
  const items = tArr<{ keys: string; desc: string }>("shortcutsList.items");
  const noteObj = tObj<{ mobileNote?: string }>("shortcutsList");
  const note = noteObj?.mobileNote || "";
  const bodyHtml = `
    <div class="shortcuts-grid">
      ${items
        .map(
          (i) => `<div><kbd>${escape(i.keys)}</kbd><span>${escape(i.desc)}</span></div>`
        )
        .join("")}
    </div>
    ${note ? `<p class="shortcuts-note">${escape(note)}</p>` : ""}
  `;
  modal.open({ title: t("shortcutsList.title"), subtitle, bodyHtml });
}

export function mountShortcutsFab(host: HTMLElement, onOpen: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "shortcuts-fab";
  btn.setAttribute("aria-label", "Shortcuts");
  btn.textContent = "?";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onOpen();
  });
  host.appendChild(btn);
  return btn;
}
