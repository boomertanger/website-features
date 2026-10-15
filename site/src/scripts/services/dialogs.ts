// Service Hub dialogs (docs/specs/service-hub.md §5, §6, §8; mockup service-hub-round-1.html sections 1 and 9), used by /services and the page
// strip: openRate (R1, the kit's .bt-rate), quickRate (the strip's one tap for Like it / Love it, with the toast's "Add a comment"), openTest (the
// walkthrough checks) and the short celebration when a badge lands. Who may act: the gate first (Join free, Finish signup, verify your email),
// then the callables check again.
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { toast } from "../../../../shared/ui/toast.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { rateHtml, initRate, RATE_ICON, RATE_LABEL } from "../../../../shared/ui/rate.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { getAuthState } from "../../lib/auth";
import { messageFor, reasonOf } from "../../lib/errors";
import { gate, my, serviceOf, ratingOf, checksOf, rate, test, watchBadges, toPick, toValue, BADGES, type Pick, type Service } from "./data";
import { badgeAlertButtons } from "../trophies/links";

const FEATURE = "services";
const JOIN = "Join free to rate";
/** The strip's toast after a rating (the compact strip has no privacy line of its own). Ratings are per service, so it names the service. */
const thanksLine = (name: string) => `Thanks! That's your rating for all of ${name}. Only Boomer and the admins see ratings.`;
const saidLine = (p: Pick, name: string) => (p === "love" ? `Saved: you love ${name}.` : p === "like" ? `Saved: you like ${name}.` : `Saved: ${name} isn't for you. Thanks for saying why.`);

/** A server refusal about the member themselves gets the right step (the gate already checked, but a session can go stale). */
async function handled(err: unknown): Promise<boolean> {
  const r = reasonOf(err);
  if (r === "needsSignup") { const { openSignIn } = await import("../account/dialog"); openSignIn({}); return true; }
  if (r === "emailNotVerified") { gate.verifyPrompt(getAuthState().user?.email || ""); return true; }
  return false;
}
const unavailable = (s: Service | null) => toast(s ? `${s.name} can't be rated right now.` : "That service isn't here.", { kind: "info" });

// ---------------------------------------------------------------------------------------------- the celebration
function celebrate(ids: string[]) {
  const known = ids.filter((id) => BADGES[id]);
  if (!known.length) return;
  const full = known.includes("services-full-coverage");
  const main = full ? "services-full-coverage" : known[known.length - 1];
  const b = BADGES[main];
  const others = known.filter((id) => id !== main).map((id) => BADGES[id].name);
  openModal({
    feature: FEATURE, title: `Badge: ${b.name}`,
    content: modalHeader(full ? "Every core service rated" : "New badge")
      + `<div class="sv-celebrate"><div class="sv-stampbox">${stampHtml({ kicker: "Badge", label: b.name, sub: full ? "All rated" : "", tone: full ? "lime" : "" })}</div>`
      + `<p>${esc(b.line)}${others.length ? ` Also: ${esc(others.join(", "))}.` : ""} It's in your Trophy Room.</p></div>`
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--ghost" data-bt-close>Nice</button>${badgeAlertButtons(main)}</div>`,
  });
}
/** Run a save, then watch for the badges it pays (captured before, so a fast trigger still counts). */
async function saving<T>(run: () => Promise<T>): Promise<T> {
  const before = { ...(await my()).badges };
  const out = await run();
  void watchBadges(before, celebrate);
  return out;
}

// ---------------------------------------------------------------------------------------------- one tap (the strip)
/** Like it / Love it from the strip: saves straight away with the toast; Not for me opens the dialog (it needs a comment). */
export async function quickRate(serviceId: string, pick: Pick): Promise<boolean> {
  if (pick === "nope") { await openRate({ serviceId, start: "nope", thanks: true }); return false; }
  if (!(await gate.requireVerified(JOIN))) return false;
  const s = await serviceOf(serviceId);
  if (!s) { unavailable(null); return false; }
  const prev = await ratingOf(serviceId);
  try {
    const keep = prev && toPick(prev.value) === pick ? prev.comment : "";
    await saving(() => rate(serviceId, toValue(pick), keep));
    toast(thanksLine(s.name), { ms: 7000, action: { label: keep ? "Edit your comment" : "Add a comment", onClick: () => void openRate({ serviceId, start: pick }) } });
    return true;
  } catch (err) {
    if (!(await handled(err))) toast(messageFor(err, "Couldn't save your rating. Try again."), { kind: "error" });
    return false;
  }
}

// ---------------------------------------------------------------------------------------------- the rating dialog (R1)
/** thanks: opened from the page strip, so the toast after the save is the strip's thanks line. */
export async function openRate({ serviceId, start, onSaved, thanks = false }: { serviceId: string; start?: Pick; onSaved?: (p: Pick) => void; thanks?: boolean }) {
  if (!(await gate.requireVerified(JOIN))) return;
  const s = await serviceOf(serviceId);
  if (!s) { unavailable(null); return; }
  const prev = await ratingOf(serviceId);
  const prevPick = prev ? toPick(prev.value) : "";
  const moved = !!prev && prev.version !== s.version && !start;
  const sub = `v${esc(s.version)} · your rating is private: only Boomer and the admins see comments`;
  const { modal, close } = openModal({ feature: FEATURE, title: `Rate ${s.name}`, content: modalHeader(`Rate ${esc(s.name)}`, sub) + `<div data-sv-body></div>` });
  const body = modal.querySelector<HTMLElement>("[data-sv-body]")!;

  const save = async (pick: Pick, comment: string, btn: HTMLButtonElement, err: HTMLElement) => {
    btn.disabled = true; btn.classList.add("is-loading"); err.hidden = true;
    try {
      await saving(() => rate(serviceId, toValue(pick), comment));
      close();
      toast(thanks ? thanksLine(s.name) : saidLine(pick, s.name));
      onSaved?.(pick);
    } catch (e) {
      btn.disabled = false; btn.classList.remove("is-loading");
      if (await handled(e)) { close(); return; }
      err.textContent = messageFor(e, "Couldn't save your rating. Try again."); err.hidden = false;
    }
  };

  const showKeep = () => {
    const p = prevPick as Pick;
    body.innerHTML = `<div class="sv-keep"><span class="sv-myrate" data-v="${p}">${RATE_ICON[p]}${esc(RATE_LABEL[p])}</span><p><b>You rated v${esc(prev!.version)}. Still feel the same?</b> ${esc(s.name)} is on v${esc(s.version)} now. Keep saves the same rating for the new version.</p>${prev!.comment ? `<blockquote>${esc(prev!.comment)}</blockquote>` : ""}</div>`
      + `<p class="bt-error" role="alert" hidden></p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-sv-change>Change</button><button type="button" class="bt-btn bt-btn--primary" data-sv-keep>Keep</button></div>`;
    body.querySelector("[data-sv-change]")!.addEventListener("click", () => showForm(p));
    const keep = body.querySelector<HTMLButtonElement>("[data-sv-keep]")!;
    keep.addEventListener("click", () => void save(p, prev!.comment, keep, body.querySelector(".bt-error")!));
    keep.focus();
  };
  const showForm = (pick: Pick | "") => {
    body.innerHTML = rateHtml({ value: pick, commentText: prev?.comment || "", id: "sv-rate" })
      + `<p class="bt-error" role="alert" hidden></p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-sv-save>Save rating</button></div>`;
    const ctl = initRate(body);
    const btn = body.querySelector<HTMLButtonElement>("[data-sv-save]")!;
    btn.addEventListener("click", () => { if (ctl.validate()) void save(ctl.value() as Pick, ctl.comment(), btn, body.querySelector(":scope > .bt-error")!); });
    const box = body.querySelector<HTMLTextAreaElement>("textarea");
    if (pick === "nope" && box) box.focus();
    else body.querySelector<HTMLElement>(`.bt-rate-btn[aria-checked="true"], .bt-rate-btn`)?.focus();
  };
  if (moved) showKeep(); else showForm(start || prevPick);
}

// ---------------------------------------------------------------------------------------------- the walkthrough test (mockup section 9)
const IC_PHONE = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/></svg>`;
const IC_DESK = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>`;
const IC_CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>`;

export async function openTest({ serviceId, onSaved }: { serviceId: string; onSaved?: () => void }) {
  if (!(await gate.requireVerified("Join free to test"))) return;
  const [s, checks, m] = await Promise.all([serviceOf(serviceId), checksOf(serviceId), my()]);
  if (!s || s.status !== "live") { unavailable(s); return; }
  if (checks.length < 3) { toast(`${s.name} has no test checks yet.`, { kind: "info" }); return; }
  const done = m.tested[serviceId] === s.version;
  const mins = Math.max(2, Math.round(checks.length * 0.8));
  const { modal, close } = openModal({
    feature: FEATURE, wide: true, title: `Test ${s.name}`,
    content: modalHeader(`Test ${esc(s.name)}`, `v${esc(s.version)} · ${checks.length} checks · about ${mins} minutes. Counts once per version.`) + `<div data-sv-body></div>`,
  });
  const body = modal.querySelector<HTMLElement>("[data-sv-body]")!;
  const ans: ({ ok: boolean; note: string } | null)[] = checks.map(() => null);
  let device: "phone" | "desktop" = matchMedia("(pointer: coarse)").matches ? "phone" : "desktop";
  const bugHref = `/bug-zapper?new=1&page=${encodeURIComponent(s.link || "/")}`;

  const draw = () => {
    const answered = ans.filter(Boolean).length, problems = ans.filter((a) => a && !a.ok).length;
    body.innerHTML = (done ? `<div class="bt-notice bt-notice--ok">You already tested v${esc(s.version)}. Thanks! Another run won't count again, but the checks are here if you want them.</div>` : "")
      + `<div class="bt-view-switch" role="radiogroup" aria-label="Device">${([["phone", IC_PHONE, "Phone"], ["desktop", IC_DESK, "Desktop"]] as const).map(([k, ic, l]) => `<button type="button" role="radio" data-dev="${k}" aria-checked="${device === k}">${ic}${l}</button>`).join("")}</div>`
      + `<ol class="sv-steps">${checks.map((c, i) => { const a = ans[i]; return `<li class="sv-step${a ? (a.ok ? " is-ok" : " is-bad") : ""}"><div class="sv-step-row"><span class="n" aria-hidden="true">${a?.ok ? IC_CHECK : i + 1}</span><span class="sv-step-t">${esc(c)}</span><span class="sv-okbad" role="group" aria-label="Check ${i + 1}"><button type="button" data-i="${i}" data-ok="1" aria-pressed="${a?.ok === true}">OK</button><button type="button" data-i="${i}" data-ok="0" aria-pressed="${a?.ok === false}">Problem</button></span></div>`
        + (a && !a.ok ? `<div class="bt-field"><label class="bt-label" for="sv-n${i}">What happened on step ${i + 1}?</label><textarea class="bt-textarea" id="sv-n${i}" data-note="${i}" rows="2" maxlength="300" placeholder="What you tapped, and what went wrong">${esc(a.note)}</textarea></div>` : "") + `</li>`; }).join("")}</ol>`
      + (problems ? `<div class="bt-notice">Problems can go straight to Bug Zapper with this page and service filled in. <a class="bt-link-btn" href="${esc(bugHref)}" target="_blank" rel="noopener">Report it in Bug Zapper</a></div>` : "")
      + `<div><div class="bt-steps-label">${answered} of ${checks.length} checks answered</div><div class="bt-steps" aria-hidden="true">${checks.map((_, i) => `<i${ans[i] ? ' class="is-on"' : ""}></i>`).join("")}</div></div>`
      + `<p class="bt-error" role="alert" hidden></p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-sv-save${answered < checks.length ? " disabled" : ""}>Save test</button></div>`;
  };
  draw();
  body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const dev = t.closest<HTMLElement>("[data-dev]");
    if (dev) { device = dev.dataset.dev as typeof device; draw(); return; }
    const b = t.closest<HTMLElement>("[data-ok]");
    if (b) {
      const i = Number(b.dataset.i), ok = b.dataset.ok === "1";
      ans[i] = { ok, note: ans[i]?.note || "" };
      draw();
      if (!ok) body.querySelector<HTMLTextAreaElement>(`[data-note="${i}"]`)?.focus();
      return;
    }
    if (t.closest("[data-sv-save]")) void submit(t.closest<HTMLButtonElement>("[data-sv-save]")!);
  });
  body.addEventListener("input", (e) => {
    const t = e.target as HTMLTextAreaElement;
    if (t.dataset.note != null) { const a = ans[Number(t.dataset.note)]; if (a) a.note = t.value; }
  });
  async function submit(btn: HTMLButtonElement) {
    const err = body.querySelector<HTMLElement>(":scope > .bt-error")!;
    const missing = ans.findIndex((a) => a && !a.ok && a.note.trim().length < 3);
    if (missing >= 0) { err.textContent = `Say what went wrong on step ${missing + 1}.`; err.hidden = false; body.querySelector<HTMLTextAreaElement>(`[data-note="${missing}"]`)?.focus(); return; }
    btn.disabled = true; btn.classList.add("is-loading"); err.hidden = true;
    try {
      const before = { ...(await my()).badges };
      const r = await test(serviceId, device, ans.map((a) => (a!.ok ? { ok: true } : { ok: false, note: a!.note.trim() })));
      if (r.counted) void watchBadges(before, celebrate);
      body.innerHTML = `<div class="sv-celebrate"><div class="sv-stampbox">${stampHtml({ kicker: device === "phone" ? "Phone" : "Desktop", label: "Tested", sub: `v${r.version}`, tone: "lime" })}</div>`
        + `<p>${r.counted ? (r.problems ? `Saved, with ${r.problems} problem${r.problems === 1 ? "" : "s"}. The crew will look into ${r.problems === 1 ? "it" : "them"}.` : "Saved. Everything worked: thanks for checking it.") : `You already tested v${esc(r.version)}, so this run doesn't count again. Thanks anyway.`}</p>`
        + (r.problems ? `<a class="bt-btn bt-btn--secondary" href="${esc(bugHref)}">Report it in Bug Zapper</a>` : "") + `</div><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--primary" data-bt-close>Done</button></div>`;
      onSaved?.();
    } catch (e) {
      btn.disabled = false; btn.classList.remove("is-loading");
      if (await handled(e)) { close(); return; }
      err.textContent = messageFor(e, "Couldn't save your test. Try again."); err.hidden = false;
    }
  }
}
