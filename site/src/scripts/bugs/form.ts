// The Report a bug dialog (docs/specs/bug-zapper.md §7; mockup "Report form"): Give it a short name / What happened? / What did you expect instead? / Which page or feature?
// (prefilled only from ?page=) / Steps (optional) / How bad is it? (four cards) / Screenshot (.bt-dropzone) / "We'll attach: BROWSER on OS, W × H" with Don't attach / the
// security checkbox, and "Which part of the site?" (Service Hub: a select of the services, pre-selected from ?page= when it matches; "Not sure" lets the server
// go by the page). Sending: a spinner. Sent: the ZAPPED IN stamp with an ice-and-lamp burst, "It's on the board", the Night Shift line when a live mission counted it,
// See your report / Report another. A screenshot that fails to upload never loses the report (the saved-anyway notice and Add the screenshot). Rate limit: its own view.
// Visitors get the Join dialog titled "Join to report bugs"; members with an unverified email get the verify dialog. A token per open dialog makes a double click send one report.
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { burst } from "../../../../shared/ui/burst.js";
import { messageFor, reasonOf } from "../../lib/errors";
import { SEVERITY, type Severity } from "./data";
import { submit, newToken, prepareShot } from "./store";
import { requireVerified, verifyPrompt } from "./gate";
import { getAuthState } from "../../lib/auth";
import { esc, sevBadge, stamp, longDate } from "./ui";
import { isPreview, isAdmin } from "./gate";
import { loadServices, serviceForPage, serviceSelectHtml } from "../services-pick";

export interface Device { browser: string; os: string; viewport: string }

/** "Chrome 129 on Windows, 1920 × 1080" from what the browser says. Never sent unless the reporter leaves it on. */
export function detectDevice(): Device {
  const ua = navigator.userAgent;
  const pick = (re: RegExp) => ua.match(re)?.[1] || "";
  const browser = /Edg\//.test(ua) ? `Edge ${pick(/Edg\/(\d+)/)}` : /OPR\//.test(ua) ? `Opera ${pick(/OPR\/(\d+)/)}` : /Firefox\//.test(ua) ? `Firefox ${pick(/Firefox\/(\d+)/)}` : /Chrome\//.test(ua) ? `Chrome ${pick(/Chrome\/(\d+)/)}` : /Safari\//.test(ua) ? `Safari ${pick(/Version\/(\d+)/)}` : "Browser";
  const plat = (navigator as any).userAgentData?.platform as string | undefined;
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : plat || (/Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS");
  return { browser: browser.trim(), os, viewport: `${window.innerWidth} × ${window.innerHeight}` };
}
const deviceText = (d: Device) => `${d.browser} on ${d.os}, ${d.viewport}`;

const MAX_SHOT = 10 * 1024 * 1024;

export async function openForm({ page = "", onSent, openReport }: { page?: string; onSent: (id: string) => void; openReport: (id: string) => void }) {
  if (!(await requireVerified("Join to report bugs"))) return;
  const device = detectDevice();
  const st = { severity: null as Severity | null, file: null as File | null, deviceOn: true, priv: false, token: newToken(), service: "", serviceTouched: false };
  const m = openModal({ title: "Report a bug", feature: "bug-zapper", content: "" });
  const modal = m.modal;

  const form = (keep: Record<string, string> = {}) => {
    modal.innerHTML = `${modalHeader("Report a bug", "Tell us what broke. The more detail, the faster it gets zapped.")}
    <div class="bt-form">
    <div class="bt-field"><label class="bt-label" for="bz-f-title">Give it a short name</label><input id="bz-f-title" class="bt-input" type="text" maxlength="200" placeholder="e.g. Timer keeps running after I pause" value="${esc(keep.title || "")}" autocomplete="off"></div>
    <div class="bt-field"><label class="bt-label" for="bz-f-what">What happened?</label><textarea id="bz-f-what" class="bt-textarea" rows="3" maxlength="2000" placeholder="Describe what you saw.">${esc(keep.what || "")}</textarea></div>
    <div class="bt-field"><label class="bt-label" for="bz-f-exp">What did you expect instead?</label><textarea id="bz-f-exp" class="bt-textarea" rows="2" maxlength="2000" placeholder="Describe what should have happened.">${esc(keep.exp || "")}</textarea></div>
    <div class="bt-field"><label class="bt-label" for="bz-f-page">Which page or feature?</label><input id="bz-f-page" class="bt-input" type="text" maxlength="300" placeholder="e.g. www.boomertanger.com/live" value="${esc(keep.page ?? page)}" autocomplete="off"><span class="bt-hint">Paste the address of the page where it happened.</span></div>
    <div data-svc-slot></div>
    <div class="bt-field"><label class="bt-label" for="bz-f-steps">Steps to reproduce (optional)</label><textarea id="bz-f-steps" class="bt-textarea" rows="3" maxlength="2000" placeholder="1. Go to…&#10;2. Click…&#10;3. See…">${esc(keep.steps || "")}</textarea></div>
    <div class="bt-field"><span class="bt-label" id="bz-f-sev">How bad is it?</span><div class="bz-sev-pick" role="radiogroup" aria-labelledby="bz-f-sev" aria-required="true">${(Object.keys(SEVERITY) as Severity[]).map((k) => `<button type="button" role="radio" aria-checked="${st.severity === k}" data-sev-pick="${k}">${sevBadge(k)}<span>${SEVERITY[k].help}</span></button>`).join("")}</div><p class="bt-error" data-sev-err role="alert" hidden>Pick how bad it is.</p></div>
    <div class="bt-field"><span class="bt-label">Screenshot (optional)</span><div data-shot></div><input type="file" accept="image/png,image/jpeg,image/webp" hidden data-file></div>
    <div class="bz-device-line${st.deviceOn ? "" : " is-off"}" data-device><span>We'll attach: ${esc(deviceText(device))}</span><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-device-toggle>${st.deviceOn ? "Don't attach" : "Attach"}</button></div>
    <label class="bt-check bz-private"><input type="checkbox" data-priv ${st.priv ? "checked" : ""}><span><b>This is a security or privacy problem.</b> Only you and the team will see this report, and it won't go on the public board.</span></label>
    <p class="bt-error" hidden data-err role="alert"></p>
    </div>
    <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-send>Send report</button></div>`;
    drawShot();
    void drawService(keep.page ?? page);
    modal.querySelector<HTMLInputElement>("#bz-f-title")?.focus();
  };
  /** "Which part of the site?": filled once the list is in (the form never waits for it); the reporter's own pick is kept across redraws. */
  const drawService = async (pageText: string) => {
    const list = await loadServices({ preview: isPreview() });
    const slot = modal.querySelector<HTMLElement>("[data-svc-slot]");
    if (!slot || !list.length) return;
    if (!st.serviceTouched) { const guess = await serviceForPage(pageText); st.service = guess && list.some((s) => s.id === guess) ? guess : ""; }
    slot.innerHTML = serviceSelectHtml({ id: "bz-f-svc", label: "Which part of the site?", list, value: st.service, none: "Not sure" });
  };
  const drawShot = () => {
    const box = modal.querySelector<HTMLElement>("[data-shot]");
    if (!box) return;
    box.innerHTML = st.file
      ? `<div class="bz-device-line"><span>📎 ${esc(st.file.name)} · ${(st.file.size / 1048576).toFixed(1)} MB</span><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-shot-remove>Remove</button></div>`
      : `<button type="button" class="bt-dropzone" data-shot-pick><span><b>Drop a screenshot</b> or click to choose</span><span class="bt-hint">JPG, PNG or WebP, up to 10 MB. Only you and the team will see it.</span></button><p class="bt-hint"><a href="/cloud-stash/how-it-works" target="_blank" rel="noopener">What happens to your screenshot?</a></p>`;
  };
  const read = () => ({ title: modal.querySelector<HTMLInputElement>("#bz-f-title")!.value, what: modal.querySelector<HTMLTextAreaElement>("#bz-f-what")!.value, exp: modal.querySelector<HTMLTextAreaElement>("#bz-f-exp")!.value, page: modal.querySelector<HTMLInputElement>("#bz-f-page")!.value, steps: modal.querySelector<HTMLTextAreaElement>("#bz-f-steps")!.value });
  const setFile = async (f: File | undefined) => {
    const err = modal.querySelector<HTMLElement>("[data-err]");
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { if (err) { err.textContent = "Use a JPG, PNG or WebP file."; err.hidden = false; } return; }
    if (f.size > MAX_SHOT * 4) { if (err) { err.textContent = "That file is too big. Screenshots can be up to 10 MB."; err.hidden = false; } return; }
    st.file = f; if (err) err.hidden = true; drawShot();
  };

  const view = (title: string, body: string, actions: string, subtitle = "") => { modal.innerHTML = `${modalHeader(title, subtitle)}${body}<div class="bt-modal-actions">${actions}</div>`; };
  const done = (id: string, counted: boolean, shot: "none" | "ok" | "failed" | "paused") => {
    view("Report sent", `<div class="bz-done"><div class="bz-done-art" data-done-art>${stamp("Zapped in", "Bug report", longDate(Date.now()).replace(/, \d{4}$/, ""))}</div><h3>It's on the board</h3><p>${st.priv ? "Only you and the team can see it. You'll hear back here and in your alerts." : "Others can add a “bit me too” now. You'll hear when the team takes a look."}</p>${counted ? '<span class="bz-ns-line">🌙 Night Shift: Bug hunter counted</span>' : ""}${shot === "failed" ? `<div class="bt-notice bt-notice--error" style="width:100%;text-align:left">Your screenshot didn't upload, but your report is saved. Add the screenshot from your report.<br><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-see>Add the screenshot</button></div>` : shot === "paused" ? `<div class="bt-notice" style="width:100%;text-align:left">Your report is saved. Uploads are paused for a bit, so your screenshot wasn't attached. You can add it from your report later.</div>` : ""}</div>`,
      `<button type="button" class="bt-btn bt-btn--secondary" data-again>Report another</button><button type="button" class="bt-btn bt-btn--primary" data-see>See your report</button>`);
    burst(modal.querySelector<HTMLElement>("[data-done-art]"), { colors: ["var(--bt-ice)", "var(--bt-lamp)", "var(--bt-title)"], n: 20 });
    modal.querySelectorAll("[data-see]").forEach((b) => b.addEventListener("click", () => { m.close(); openReport(id); }));
    modal.querySelector("[data-again]")?.addEventListener("click", () => { st.file = null; st.token = newToken(); st.priv = false; st.service = ""; st.serviceTouched = false; form({ page: "" }); });
  };

  modal.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const sev = t.closest<HTMLElement>("[data-sev-pick]");
    if (sev) { st.severity = sev.dataset.sevPick as Severity; modal.querySelector<HTMLElement>("[data-sev-err]")!.hidden = true; modal.querySelectorAll<HTMLElement>("[data-sev-pick]").forEach((x) => x.setAttribute("aria-checked", String(x === sev))); return; }
    if (t.closest("[data-shot-pick]")) { modal.querySelector<HTMLInputElement>("[data-file]")?.click(); return; }
    if (t.closest("[data-shot-remove]")) { st.file = null; drawShot(); return; }
    if (t.closest("[data-device-toggle]")) { st.deviceOn = !st.deviceOn; const line = modal.querySelector<HTMLElement>("[data-device]")!; line.classList.toggle("is-off", !st.deviceOn); line.querySelector("button")!.textContent = st.deviceOn ? "Don't attach" : "Attach"; return; }
    const send = t.closest<HTMLButtonElement>("[data-send]");
    if (!send) return;
    const f = read(), err = modal.querySelector<HTMLElement>("[data-err]")!;
    err.hidden = true;
    const fail = (msg: string) => { err.textContent = msg; err.hidden = false; };
    if (f.title.trim().length < 3) return fail("Give it a short name (3 to 200 characters).");
    if (f.what.trim().length < 10) return fail("Say what happened (at least 10 characters).");
    if (!f.page.trim()) return fail("Say which page or feature it was on.");
    if (!st.severity) { const hint = modal.querySelector<HTMLElement>("[data-sev-err]")!; hint.hidden = false; modal.querySelector<HTMLElement>("[data-sev-pick]")?.focus(); return; }
    send.disabled = true;
    send.innerHTML = '<span class="bt-spinner" aria-hidden="true"></span>Sending…';
    modal.querySelectorAll<HTMLButtonElement>("[data-bt-close]").forEach((b) => (b.disabled = true));
    m.setDismissible(false);
    try {
      const blob = st.file ? await prepareShot(st.file) : null;
      const res = await submit({ title: f.title.trim(), page: f.page.trim(), whatHappened: f.what.trim(), expected: f.exp.trim(), steps: f.steps.trim(), severity: st.severity as Severity, private: st.priv, device: st.deviceOn ? device : null, token: st.token, ...(st.service ? { serviceId: st.service } : {}) }, blob);
      m.setDismissible(true);
      onSent(res.id);
      done(res.id, res.counted, res.shot);
    } catch (ex) {
      m.setDismissible(true);
      const reason = reasonOf(ex);
      if (reason === "rateLimit") {
        // the server decides the limit (5 a day for members and mods; a 200-a-day backstop for the owner and admins); this only words it
        if (isAdmin()) view("That's 200 reports today", `<div class="bt-notice">${esc(messageFor(ex, "That's 200 reports today. Try again tomorrow."))}</div>`, `<button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button>`);
        else view("That's 5 reports today", `<div class="bt-notice">You can report again tomorrow. Found more? Add them to the thread on one of today's reports and the team will see them.</div>`, `<button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button>`);
        return;
      }
      if (reason === "emailNotVerified" || reason === "needsSignup") { m.close(); verifyPrompt(getAuthState().user?.email || ""); return; }
      const keep = read();
      form(keep);
      const e2 = modal.querySelector<HTMLElement>("[data-err]")!;
      e2.textContent = messageFor(ex, "Couldn't send your report. Try again."); e2.hidden = false;
    }
  });
  modal.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.matches("[data-file]")) void setFile(t.files?.[0]);
    if (t.matches("[data-priv]")) st.priv = t.checked;
    if (t.matches("#bz-f-svc")) { st.service = (t as unknown as HTMLSelectElement).value; st.serviceTouched = true; }
  });
  modal.addEventListener("dragover", (e) => { if ((e.target as Element).closest("[data-shot-pick]")) e.preventDefault(); });
  modal.addEventListener("drop", (e) => { const z = (e.target as Element).closest("[data-shot-pick]"); if (!z) return; e.preventDefault(); void setFile((e as DragEvent).dataTransfer?.files?.[0]); });
  form();
}
