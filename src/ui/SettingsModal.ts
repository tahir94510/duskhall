import { Modal, escape } from "./Modal.js";
import { t } from "../i18n/index.js";
import type { AudioEngine } from "../audio/Audio.js";

export function openSettingsModal(modal: Modal, audio: AudioEngine): void {
  const master = Math.round(audio.masterVolume * 100);
  const music = Math.round(audio.musicVolume * 100);
  const sfx = Math.round(audio.sfxVolume * 100);
  const bodyHtml = `
    <div class="settings">
      <div class="settings__row settings__row--master">
        <label for="set-master">${escape(t("settings.master"))}</label>
        <input id="set-master" type="range" min="0" max="100" step="1" value="${master}" />
        <span class="settings__value" data-role="master-val">${master}</span>
      </div>
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
    </div>
  `;
  modal.open({ title: t("settings.title"), bodyHtml });

  const body = modal.bodyEl();
  if (!body) return;
  const masterInput = body.querySelector<HTMLInputElement>("#set-master")!;
  const musicInput = body.querySelector<HTMLInputElement>("#set-music")!;
  const sfxInput = body.querySelector<HTMLInputElement>("#set-sfx")!;
  const masterVal = body.querySelector<HTMLElement>('[data-role="master-val"]')!;
  const musicVal = body.querySelector<HTMLElement>('[data-role="music-val"]')!;
  const sfxVal = body.querySelector<HTMLElement>('[data-role="sfx-val"]')!;

  masterInput.addEventListener("input", () => {
    const n = parseInt(masterInput.value, 10);
    audio.setMasterVolume(n / 100);
    masterVal.textContent = String(n);
  });
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
}
