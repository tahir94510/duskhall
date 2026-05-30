import { Modal, escape } from "./Modal.js";
import { t, getLocale, loadLocale, type Locale } from "../i18n/index.js";
import type { AudioEngine } from "../audio/Audio.js";

function setFill(input: HTMLInputElement): void {
  const v = parseInt(input.value, 10) / 100;
  input.style.setProperty("--fill", `${(v * 100).toFixed(0)}%`);
}

export function openSettingsModal(
  modal: Modal,
  audio: AudioEngine,
  onLangChange: (loc: Locale) => void
): void {
  const master = Math.round(audio.masterVolume * 100);
  const music = Math.round(audio.musicVolume * 100);
  const sfx = Math.round(audio.sfxVolume * 100);
  const loc = getLocale();
  const bodyHtml = `
    <div class="settings">
      <div class="settings__group">
        <div class="settings__legend">${escape(t("settings.audio"))}</div>
        <div class="settings__row settings__row--master">
          <label for="set-master">${escape(t("settings.master"))}</label>
          <input id="set-master" class="settings__slider" type="range" min="0" max="100" step="1" value="${master}" style="--fill:${master}%" />
          <span class="settings__value" data-role="master-val">${master}</span>
        </div>
        <div class="settings__row">
          <label for="set-music">${escape(t("settings.music"))}</label>
          <input id="set-music" class="settings__slider" type="range" min="0" max="100" step="1" value="${music}" style="--fill:${music}%" />
          <span class="settings__value" data-role="music-val">${music}</span>
        </div>
        <div class="settings__row">
          <label for="set-sfx">${escape(t("settings.sfx"))}</label>
          <input id="set-sfx" class="settings__slider" type="range" min="0" max="100" step="1" value="${sfx}" style="--fill:${sfx}%" />
          <span class="settings__value" data-role="sfx-val">${sfx}</span>
        </div>
        <button type="button" class="settings__reset" data-role="reset-audio">${escape(t("settings.resetDefaults"))}</button>
        <p class="settings__hint">${escape(t("settings.resetDefaultsHint"))}</p>
      </div>
      <div class="settings__group">
        <div class="settings__legend">${escape(t("settings.language"))}</div>
        <div class="settings__lang" role="group" aria-label="${escape(t("settings.language"))}">
          <button type="button" class="lang-pill" data-lang="en" ${loc === "en" ? 'aria-pressed="true"' : ""}>English</button>
          <button type="button" class="lang-pill" data-lang="tr" ${loc === "tr" ? 'aria-pressed="true"' : ""}>Türkçe</button>
        </div>
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
    setFill(masterInput);
  });
  musicInput.addEventListener("input", () => {
    const n = parseInt(musicInput.value, 10);
    audio.setMusicVolume(n / 100);
    musicVal.textContent = String(n);
    setFill(musicInput);
  });
  sfxInput.addEventListener("input", () => {
    const n = parseInt(sfxInput.value, 10);
    audio.setSfxVolume(n / 100);
    sfxVal.textContent = String(n);
    setFill(sfxInput);
  });

  const syncSliders = () => {
    const m = Math.round(audio.masterVolume * 100);
    const mu = Math.round(audio.musicVolume * 100);
    const s = Math.round(audio.sfxVolume * 100);
    masterInput.value = String(m); masterVal.textContent = String(m); setFill(masterInput);
    musicInput.value = String(mu); musicVal.textContent = String(mu); setFill(musicInput);
    sfxInput.value = String(s); sfxVal.textContent = String(s); setFill(sfxInput);
  };

  body.querySelector<HTMLButtonElement>('[data-role="reset-audio"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    audio.restoreDefaults();
    syncSliders();
  });

  body.querySelectorAll<HTMLButtonElement>(".lang-pill").forEach((pill) => {
    const code = pill.dataset.lang as Locale;
    pill.classList.toggle("is-active", getLocale() === code);
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      if (getLocale() === code) return;
      void loadLocale(code).then(() => {
        body.querySelectorAll<HTMLButtonElement>(".lang-pill").forEach((p) => {
          const active = p.dataset.lang === code;
          p.classList.toggle("is-active", active);
          p.setAttribute("aria-pressed", active ? "true" : "false");
        });
        onLangChange(code);
      });
    });
  });
}
