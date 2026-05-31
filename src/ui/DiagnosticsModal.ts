import { Modal, escape } from "./Modal.js";
import { t } from "../i18n/index.js";
import type { RealtimeBus, DiagnosticsReport, DiagnosticStep } from "../net/realtime.js";
import { ICON_CHECK, ICON_CLOSE } from "./icons.js";

// A self-test the player can run from the menu to confirm their Supabase setup
// without a second device. It calls RealtimeBus.diagnose() (config → URL → REST
// → Realtime) and shows each step with a pass/fail mark and a plain explanation,
// then a single clear verdict. This is the "did I wire Supabase right?" answer.

const STEP_LABEL: Record<DiagnosticStep["id"], string> = {
  config: "diag.stepConfig",
  url: "diag.stepUrl",
  rest: "diag.stepRest",
  realtime: "diag.stepRealtime"
};

export function openDiagnosticsModal(modal: Modal, bus: RealtimeBus): void {
  modal.open({
    title: t("diag.title"),
    subtitle: t("diag.subtitle"),
    bodyHtml: `<div class="diag" data-role="diag"><div class="diag__running">${escape(t("diag.running"))}</div></div>`
  });

  const body = modal.bodyEl();
  const root = body?.querySelector<HTMLElement>('[data-role="diag"]');
  if (!root) return;

  void bus.diagnose().then((report) => {
    // The modal may have been closed while the probe ran; bail if so.
    if (!root.isConnected) return;
    root.innerHTML = renderReport(report);
  }).catch(() => {
    if (!root.isConnected) return;
    root.innerHTML = `<div class="diag__verdict diag__verdict--bad">${escape(t("diag.error"))}</div>`;
  });
}

function renderReport(report: DiagnosticsReport): string {
  const rows = report.steps.map((s) => {
    const mark = s.ok
      ? `<span class="diag__mark diag__mark--ok" aria-hidden="true">${ICON_CHECK}</span>`
      : `<span class="diag__mark diag__mark--bad" aria-hidden="true">${ICON_CLOSE}</span>`;
    return `
      <li class="diag__step ${s.ok ? "is-ok" : "is-bad"}">
        ${mark}
        <div class="diag__step-text">
          <div class="diag__step-name">${escape(t(STEP_LABEL[s.id]))}</div>
          <div class="diag__step-detail">${escape(s.detail)}</div>
        </div>
      </li>`;
  }).join("");

  const verdictKey = report.ok ? "diag.verdictOk" : "diag.verdictBad";
  const hintKey = `diag.hint_${report.summary}`;
  const hint = report.ok ? "" : `<p class="diag__hint">${escape(t(hintKey))}</p>`;

  return `
    <ul class="diag__steps">${rows}</ul>
    <div class="diag__verdict ${report.ok ? "diag__verdict--ok" : "diag__verdict--bad"}">${escape(t(verdictKey))}</div>
    ${hint}
  `;
}
