import { Modal, escape } from "./Modal.js";
import { t, tArr } from "../i18n/index.js";
import { ICON_PATREON, ICON_COFFEE, ICON_SUPPORT } from "./icons.js";
import { nameKey } from "../util/names.js";

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

// The supporters wall is sourced from public/supporters.json (an array of names,
// editable on GitHub with no redeploy) merged with an optional build-time
// VITE_SUPPORTERS env (comma-separated). The result is trimmed, de-duplicated
// (case-insensitive), length-capped per name and total-capped, so a malformed or
// oversized file can never break or bloat the panel. Cached after the first load.
let supportersCache: Promise<string[]> | null = null;
function envSupporters(): string[] {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
  return (env.VITE_SUPPORTERS || "").split(",");
}
function cleanSupporters(raw: unknown, fromEnv: string[]): string[] {
  // Convention: supporters.json (and VITE_SUPPORTERS) are kept oldest→newest — you
  // APPEND each new supporter to the end. We present the wall NEWEST-FIRST (most recent
  // names at the top) so a fresh supporter sees themselves right away; de-dup keeps the
  // FIRST (newest) spelling when a name appears twice. Reverse before de-dup so the
  // newest occurrence wins and leads.
  const list = (Array.isArray(raw) ? raw : []).concat(fromEnv).reverse();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    if (typeof v !== "string") continue;
    const name = v.trim().slice(0, 40);
    if (!name) continue;
    const key = nameKey(name); // case- AND Turkish-I-safe, so "Tılsım"/"TILSIM" de-dupe
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 500) break;
  }
  return out;
}
function loadSupporters(): Promise<string[]> {
  if (supportersCache) return supportersCache;
  supportersCache = (async () => {
    let json: unknown = [];
    try {
      const res = await fetch("/supporters.json", { cache: "no-store" });
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("json")) json = await res.json();
    } catch { /* no file / offline — fall back to env only */ }
    return cleanSupporters(json, envSupporters());
  })();
  return supportersCache;
}

// Offers whichever support channels are configured — Patreon, Buy Me a Coffee
// and/or a generic page — each behind its own env var, exactly like the Feedback
// modal lists whichever feedback channels are set. The first available one is the
// primary (filled) button; the rest are secondary. Below the call-to-action it shows
// a supporters / thank-you wall and a quiet hint on how to be listed.
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
    <div class="support__thanks">
      <h3 class="support__thanks-title">${escape(t("support.supportersTitle"))}</h3>
      <div class="support__names" data-role="supporters"></div>
      <p class="support__hint">${escape(t("support.supportersHint"))}</p>
    </div>
    <p class="modal__sub" style="margin-top:14px;">${escape(t("support.thanks"))}</p>
  `;
  modal.open({ title: t("support.title"), bodyHtml });

  // Fill the names asynchronously; the dialog may already be closed by the time the
  // fetch resolves, so we re-find the (still-open) container and skip if it's gone.
  const namesEl = modal.bodyEl()?.querySelector<HTMLElement>('[data-role="supporters"]') ?? null;
  if (!namesEl) return;
  void loadSupporters().then((names) => {
    if (!namesEl.isConnected || !names.length) return;
    namesEl.innerHTML = names.map((n) => `<span class="support__name">${escape(n)}</span>`).join("");
  });
}
