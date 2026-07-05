import { Modal, escape } from "./Modal.js";
import { t } from "../i18n/index.js";
import { MODES } from "../modes/registry.js";
import { assetRoot, type ModeDef } from "../modes/types.js";

// The mode picker: a list of every game Duskhall hosts, each with its localized name, a one-line
// description, a difficulty rating (dots), and player count + duration. Picking a game (other than
// the current one) calls onPick, which runs Game.switchMode behind the loading screen.
//
// The card names/descriptions come from the SHARED locale (modePicker.modes.<id>.*), not the
// per-mode locale files, because the picker lists ALL modes while only the active mode's own
// locale is merged in. This keeps every game's blurb available in the list regardless of which
// game is currently loaded.

function difficultyDots(level: number): string {
  let dots = "";
  for (let i = 1; i <= 5; i++) dots += `<span class="modepick__dot${i <= level ? " is-on" : ""}"></span>`;
  return dots;
}

function playersLabel(m: ModeDef): string {
  const { minPlayers, maxPlayers } = m.meta;
  return minPlayers === maxPlayers
    ? t("modePicker.playersExact", { n: maxPlayers })
    : t("modePicker.playersRange", { min: minPlayers, max: maxPlayers });
}

export function openModePicker(modal: Modal, activeId: string, onPick: (id: string) => void): void {
  const cards = MODES.map((m) => {
    const isActive = m.id === activeId;
    const name = t(`modePicker.modes.${m.id}.name`);
    const desc = t(`modePicker.modes.${m.id}.desc`);
    const diffLabel = `${t("modePicker.difficulty")} ${m.meta.difficulty}/5`;
    return `
      <button type="button" class="modepick__card${isActive ? " is-active" : ""}" data-mode="${escape(m.id)}"${isActive ? ' aria-current="true"' : ""}>
        <span class="modepick__brand" aria-hidden="true"><img src="${assetRoot(m)}/brand/icon.svg" alt="" width="34" height="45"/></span>
        <span class="modepick__main">
          <span class="modepick__head">
            <span class="modepick__name">${escape(name)}</span>
            ${isActive ? `<span class="modepick__active">${escape(t("modePicker.active"))}</span>` : ""}
          </span>
          <span class="modepick__desc">${escape(desc)}</span>
          <span class="modepick__meta">
            <span class="modepick__stat modepick__stat--diff">
              <span class="modepick__stat-label">${escape(t("modePicker.difficulty"))}</span>
              <span class="modepick__dots" role="img" aria-label="${escape(diffLabel)}">${difficultyDots(m.meta.difficulty)}</span>
            </span>
            <span class="modepick__stat">${escape(playersLabel(m))}</span>
            <span class="modepick__stat">${escape(t("modePicker.duration", { min: m.meta.durationMin, max: m.meta.durationMax }))}</span>
          </span>
        </span>
      </button>`;
  }).join("");

  const sub = t("modePicker.subtitle");
  modal.open({
    title: t("modePicker.title"),
    subtitle: sub && sub !== "modePicker.subtitle" ? sub : undefined,
    bodyHtml: `<div class="modepick">${cards}</div>`
  });

  const root = modal.bodyEl()?.closest(".modal") as HTMLElement | null;
  root?.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.mode!;
      modal.close();
      if (id !== activeId) onPick(id);
    });
  });
}
