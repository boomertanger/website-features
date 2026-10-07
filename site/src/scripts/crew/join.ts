// /crew/join (docs/specs/mod-machina.md §10). Visitors get a Join free / Log in card; signed-in members get the live
// "Can I apply?" checklist (crewMe().apply.items) and, when they can apply, the application form -> crewApply.
// Afterwards (and whenever an application is open) they see their band and the expiry date. Not-now applicants see
// the kind note and the reapply date; crew see "You're on the crew". The server checks everything again; this
// only decides what to show. Sample data under ?as= (non-production).
import { onAccess } from "./layout";
import { esc, loadMe, errText, dateLabel, isPreview, reasonText, q } from "./public";
import { CHATS, CHAT_NAME, crewCall, type Chat, type Me, type Pref, type Prefs } from "./api";
import { prefHtml, initPrefs, initRadioGroup } from "../../../../shared/ui/pref.js";
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import type { AuthState } from "../../lib/auth";

const root = document.querySelector<HTMLElement>("[data-cp-join]")!;
const main = root.querySelector<HTMLElement>("[data-cp-main]")!;
const check = root.querySelector<HTMLElement>("[data-cp-check]")!;
const DAYS: [string, string][] = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
const DEVICES: [string, string][] = [["desktop", "Computer"], ["phone", "Phone"], ["both", "Both"]];
const NEEDED: Chat[] = ["ytLandscape", "ytVertical"];
let me: AuthState;

onAccess(async (s) => {
  me = s;
  if (s.status === "signedOut") return visitor();
  if (s.status === "needsSignup") return needsSignup();
  try {
    show(await loadMe(s));
  } catch (err) {
    main.innerHTML = `<div class="bt-notice bt-notice--error">${esc(errText(err, "We couldn't check your account just now. Refresh the page to try again."))}</div>`;
  }
});

function visitor() {
  check.hidden = true;
  main.innerHTML = `<div class="bt-card cp-apply-card"><span class="bt-card-title">Apply to join</span>
    <p>Applying needs a free account, so we can check the basics: you're 18 or older, your account is a couple of weeks old, and you've been around for a few streams.</p>
    <div class="cp-acts"><a class="bt-btn bt-btn--primary" href="/account" data-signin="join" data-signin-title="Join to apply for the crew">Join free</a><a class="bt-btn bt-btn--secondary" href="/account" data-signin="signin">Log in</a></div></div>`;
}
function needsSignup() {
  check.hidden = true;
  main.innerHTML = `<div class="bt-card cp-apply-card"><span class="bt-card-title">Finish signing up first</span><p>Your account needs a few more details before you can apply.</p>
    <div class="cp-acts"><button type="button" class="bt-btn bt-btn--primary" data-signin="signup">Finish signup</button></div></div>`;
}

function checklist(me: Me, verdict = true) {
  const a = me.apply;
  if (!a) { check.hidden = true; return; }
  check.hidden = false;
  const items = a.items.map((i) => `<li><span class="cp-ck${i.ok ? "" : " is-todo"}" aria-hidden="true">${i.ok ? "✓" : "·"}</span><span>${esc(i.label)}<span class="bt-sr-only">: ${i.ok ? "done" : "not yet"}</span>${i.detail ? `<small>${esc(i.detail)}</small>` : ""}</span></li>`).join("");
  const note = !verdict ? "" : a.ok ? `<div class="bt-notice bt-notice--ok">You can apply.</div>`
    : `<div class="bt-notice">${esc(a.reapplyAt ? `You can apply again on ${dateLabel(a.reapplyAt)}.` : reasonText(a.reason) || "Not quite yet. The list above shows what's left.")}</div>`;
  check.innerHTML = `<span class="bt-card-title">Can I apply?</span><ul class="cp-checks">${items}</ul>${note}`;
}

function show(me: Me) {
  const app = me.application;
  if (me.crew) { check.hidden = true; return crewCard(); }
  if (app && app.status === "open") { check.hidden = true; return afterCard(app.band, app.expiresAt); }
  checklist(me);
  if (app && app.status === "notNow" && me.apply && !me.apply.ok) return notNow(app.note, app.reapplyAt ?? me.apply.reapplyAt);
  if (me.apply?.ok) return form();
  main.innerHTML = `<div class="bt-card cp-apply-card"><span class="bt-card-title">Not quite yet</span><p>${esc(me.apply?.reapplyAt ? `You can apply again on ${dateLabel(me.apply.reapplyAt)}.` : reasonText(me.apply?.reason) || "Check the list on the right to see what's left. The form opens as soon as you're ready.")}</p>
    <div class="cp-acts"><a class="bt-btn bt-btn--secondary" href="/crew">Meet the crew</a></div></div>`;
}

function crewCard() {
  main.innerHTML = `<div class="bt-card cp-apply-card"><span class="bt-card-title">You're on the crew</span><p>Thank you for helping. Your grade, Gears and next steps are in HQ.</p>
    <div class="cp-acts"><a class="bt-btn bt-btn--primary" href="/crew/hq">Go to HQ</a></div></div>`;
}
function notNow(note: string | null, reapplyAt: number | null) {
  main.innerHTML = `<div class="bt-card cp-apply-card"><span class="bt-card-title">Not this time</span>
    <p>${esc(note || "Thanks for applying. We'd like a little more time with you in chat first.")}</p>
    <p>${reapplyAt ? `You're welcome to apply again on <b>${esc(dateLabel(reapplyAt))}</b>.` : "You're welcome to apply again later."} Until then, come hang out in chat and keep checking in.</p></div>`;
}
function afterCard(band: string | null, expiresAt: number | null) {
  const top = band === "Top 5";
  main.innerHTML = `<div class="bt-card cp-apply-card" role="status"><span class="bt-card-title">Application sent</span>
    <div class="cp-after"><span class="cp-pos" aria-hidden="true">${top ? "Top<br>5" : "In<br>queue"}</span>
    <div><p><b>${top ? "You're in the top 5." : "You're in the queue."}</b> The crew vouches for applicants and Boomer makes the final call.</p>
    <p class="cp-muted">${expiresAt ? `Your application stays open until ${esc(dateLabel(expiresAt))}.` : "Applications stay open for 90 days."} We'll message you when there's news.</p></div></div></div>`;
}

function form() {
  const rows = CHATS.map((c) => ({ chat: c, name: CHAT_NAME[c], iconHtml: platformIconHtml(c), value: "no", needed: NEEDED.includes(c) }));
  main.innerHTML = `<form class="bt-card cp-form" novalidate>
    <div class="bt-card-head"><span class="bt-card-title">Your application</span><span class="bt-card-meta">About 5 minutes</span></div>
    <div class="bt-field"><span class="bt-label" id="cp-l-chats">Which chats would you help in?</span>
      ${prefHtml({ rows })}
      <span class="bt-hint">You'll only be scheduled in chats you mark Favourite or Happy to help. "Only if needed" means we may ask when a chat is empty. YouTube is the most needed: marking either YouTube chat Favourite or Happy to help puts you higher in the queue.</span></div>
    <div class="bt-field"><span class="bt-label" id="cp-l-days">When are you usually around? (Central time)</span>
      <div class="cp-chips" role="group" aria-labelledby="cp-l-days">${DAYS.map(([k, l]) => `<button type="button" class="bt-chip bt-chip--small" data-day="${k}" aria-pressed="false">${l}</button>`).join("")}</div>
      <input class="bt-input" id="cp-note" maxlength="300" placeholder="Usual times, e.g. evenings 6 to 10 pm" aria-label="Usual times"></div>
    <div class="bt-field"><span class="bt-label" id="cp-l-dev">How do you watch?</span>
      <span class="bt-pref-seg cp-device" role="radiogroup" aria-labelledby="cp-l-dev" data-device>${DEVICES.map(([k, l], i) => `<button type="button" role="radio" aria-checked="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-value="${k}">${l}</button>`).join("")}</span>
      <span class="bt-hint">Phone is perfect for the YouTube vertical chat.</span></div>
    <div class="bt-field"><label class="bt-label" for="cp-why">Why do you want to help?</label>
      <textarea class="bt-textarea" id="cp-why" rows="4" maxlength="1000" aria-describedby="cp-why-h"></textarea><span class="bt-hint" id="cp-why-h">At least 20 characters.</span></div>
    <div class="bt-field"><label class="bt-label" for="cp-exp">Any mod experience? (optional)</label>
      <input class="bt-input" id="cp-exp" maxlength="1000" placeholder="Other channels, Discord servers, anything"></div>
    <label class="bt-check"><input type="checkbox" id="cp-code"> <span>I've read the <a href="#cp-code-h">Crew Code</a> and I agree to it.</span></label>
    <div class="bt-notice bt-notice--error" data-err hidden role="alert"></div>
    <div class="bt-form-actions"><button class="bt-btn bt-btn--primary" type="submit">Send application</button></div></form>`;
  const f = main.querySelector<HTMLFormElement>("form")!;
  const prefs = Object.fromEntries(CHATS.map((c) => [c, "no"])) as Prefs;
  initPrefs(f, { onChange: (chat, v) => { prefs[chat as Chat] = v as Pref; } });
  const dev = initRadioGroup(f.querySelector("[data-device]")!, {});
  f.querySelectorAll<HTMLButtonElement>("[data-day]").forEach((b) => b.addEventListener("click", () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"))));
  const err = f.querySelector<HTMLElement>("[data-err]")!;
  const fail = (msg: string) => { err.textContent = msg; err.hidden = false; err.scrollIntoView({ block: "nearest" }); };
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const why = (f.querySelector<HTMLTextAreaElement>("#cp-why")!).value.trim();
    if (!CHATS.some((c) => prefs[c] !== "no")) return fail("Pick at least one chat you'd help in.");
    if (why.length < 20) return fail("Tell us a little more about why you want to help (at least 20 characters).");
    if (!f.querySelector<HTMLInputElement>("#cp-code")!.checked) return fail(reasonText("code"));
    const btn = f.querySelector<HTMLButtonElement>("button[type=submit]")!;
    btn.disabled = true; btn.setAttribute("aria-busy", "true");
    const data = {
      preferences: prefs,
      availability: { days: [...f.querySelectorAll<HTMLElement>("[data-day][aria-pressed=true]")].map((b) => b.dataset.day), note: f.querySelector<HTMLInputElement>("#cp-note")!.value.trim() },
      device: dev.get() || "desktop",
      answers: { why, experience: f.querySelector<HTMLInputElement>("#cp-exp")!.value.trim() },
      codeAgreed: true,
    };
    try {
      const res = isPreview(me) ? { band: q("band") === "queue" ? "In the queue" : "Top 5", expiresAt: Date.now() + 90 * 864e5 } : await crewCall<{ band: string; expiresAt: number }>("crewApply", data);
      check.hidden = true;
      afterCard(res.band, res.expiresAt);
      main.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    } catch (e2) {
      btn.disabled = false; btn.removeAttribute("aria-busy");
      fail(errText(e2, "We couldn't send your application. Try again in a moment."));
    }
  });
}
