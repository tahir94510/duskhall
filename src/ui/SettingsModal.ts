import { Modal, escape } from "./Modal.js";
import { t } from "../i18n/index.js";
import type { AudioEngine } from "../audio/Audio.js";

export function openSettingsModal(modal: Modal, audio: AudioEngine): void {
  const sfx = Math.round(audio.sfxVolume * 100);
  const music = Math.round(audio.musicVolume * 100);
  const muted = audio.muted;
  const bodyHtml = `
    <div class="settings__row">
      <label for="set-music">${escape(t("settings.music"))}</label>
      <input id="set-music" type="range" min="0" max="100" step="1" value="${music}" />
      <span class="settings__value" data-role="music-val">${music}</span>
    </div>
    <div class="settings__row">
      <label for="set-sfx">${escape(t("settings.sfx"))}</label>
      <input id="set-sfx" type="range" min="0" max="100" step="1" value="${sfx}" />
      <span class="settings__value" data-role="sfx-val">${sfx}</span>
    </div>
    <div class="settings__row" style="grid-template-columns: 1fr; padding-top: 14px;">
      <label class="settings__check">
        <input id="set-mute" type="checkbox" ${muted ? "checked" : ""} />
        <span>${escape(t("settings.muteAll"))}</span>
      </label>
    </div>
  `;
  modal.open({ title: t("settings.title"), bodyHtml });

  const body = modal.bodyEl();
  if (!body) return;
  const musicInput = body.querySelector<HTMLInputElement>("#set-music")!;
  const sfxInput = body.querySelector<HTMLInputElement>("#set-sfx")!;
  const muteInput = body.querySelector<HTMLInputElement>("#set-mute")!;
  const musicVal = body.querySelector<HTMLElement>('[data-role="music-val"]')!;
  const sfxVal = body.querySelector<HTMLElement>('[data-role="sfx-val"]')!;

  musicInput.addEventListener("input", () => {
    const n = parseInt(musicInput.value, 10);
    audio.setMusicVolume(n / 100);
    musicVal.textContent = String(n);
  });
  sfxInput.addEventListener("input", () => {
    const n = parseInt(sfxInput.value, 10);
    audio.setSfxVolume(n / 100);
    sfxVal.textContent = String(n);
  });
  muteInput.addEventListener("change", () => {
    audio.setMuted(muteInput.checked);
  });
}
