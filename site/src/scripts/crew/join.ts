// /crew/join: Join the crew, a story page (docs/specs/mod-machina.md §10). Fills the live parts of the page from
// crewMe(): the four-step "Can I apply?" journey (apply.items) and its verdict, the chat tiles, day tiles and
// device chips, the About you answers, the Crew Code agreement and Send (-> crewApply). Visitors see the same story
// with "Join free to apply" in place of the form; members who can't apply yet see what's left and no working form;
// applicants see their stamp, band and expiry; not-now applicants the kind note and the reapply date; crew a short
// "You're already on the crew". The server checks everything again; this only decides what to show. Sample data
// under ?as= (non-production). onAccess re-runs on every member change, so every render replaces its host's
// contents; listeners on the persistent form are added once.
import { onAccess } from "./layout";
import { esc, loadMe, errText, dateLabel, isPreview, reasonText, q } from "./public";
import { CHATS, CHAT_NAME, crewCall, type Chat, type Me, type Pref, type Prefs, type ApplyItem } from "./api";
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import { initHowItWorks, initJourney } from "../../../../shared/ui/how-it-works.js";
import { chatTileHtml, chatPreviewHtml, initChatTiles } from "../../../../shared/ui/chat-tile.js";
import { dayPickerHtml, initDayPicker, dayPickerValue } from "../../../../shared/ui/day-picker.js";
import { initRadioGroup } from "../../../../shared/ui/pref.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { toast } from "../../../../shared/ui/toast.js";
import type { AuthState } from "../../lib/auth";

type Mode = "visitor" | "signup" | "blocked" | "form" | "sent" | "applied" | "notNow" | "crew";
const LITE: Mode[] = ["applied", "notNow", "crew"];

const root = document.querySelector<HTMLElement>("[data-cj-join]")!;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
const form = $<HTMLFormElement>("[data-cj-form]");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]].map(([key, label]) => ({ key, label }));
const TIMES = ["Evenings, 6 to 10 pm", "Late nights, 10 pm to 2 am", "Afternoons", "It varies"];
const DEVICES: [string, string][] = [["desktop", "Computer"], ["phone", "Phone"], ["both", "Both"]];
const NEEDED: Chat[] = ["ytLandscape", "ytVertical"];
const NOTE: Record<Chat, string> = { twitch: "The main stream chat", ytLandscape: "Needs a lead most nights", ytVertical: "Phone chat, often empty", tiktok: "Fast and friendly" };
const MINI: Record<Chat, { user?: string; text: string; tone?: string; quiet?: boolean }[]> = {
  twitch: [{ user: "ghostbyte", text: "LMAO the door", tone: "blue" }, { user: "kait", text: "he's going to get caught", tone: "gold" }, { user: "vex", text: "welcome in nightjar 🎃", tone: "lime" }],
  ytLandscape: [{ user: "Rachel M", text: "just got here", tone: "gold" }, { user: "Tom", text: "sound design is unreal", tone: "blue" }, { text: "…quiet for 4 minutes", quiet: true }],
  ytVertical: [{ user: "lil_wraith", text: "vertical gang where u at", tone: "lime" }, { text: "…nobody's welcomed them yet", quiet: true }],
  tiktok: [{ user: "dani", text: "🔥🔥🔥" }, { user: "spookymama", text: "hi from my lunch break", tone: "teal" }, { user: "noah.k", text: "first time here", tone: "blue" }],
};
// What a visitor's look at the form shows (never sent anywhere).
const SAMPLE: Prefs = { twitch: "favourite", ytLandscape: "happy", ytVertical: "favourite", tiktok: "no" };

const ITEMS = [
  { id: "age", ic: "🎂", t: "18 or older", d: "Checked from your birthday", yes: "Yes" },
  { id: "account", ic: "📅", t: "Member 14 days", d: "How long you've had an account", yes: "Yes" },
  { id: "platform", ic: "🔗", t: "A linked account", d: "Twitch, YouTube or TikTok", yes: "Linked" },
  { id: "checkins", ic: "📺", t: "3 stream check-ins", d: "In the last 30 days", yes: "Done" },
];
const DEV_HINT: Record<string, string> = { desktop: "Great for keeping an eye on several chats at once.", both: "The best of both: phone for the YouTube vertical chat, computer for the rest.", phone: "Perfect: the YouTube vertical chat is a phone chat." };
const WAIVED = "Waived by Boomer";

let me: AuthState;
let seq = 0;
let prefs = {} as Record<Chat, Pref | "">;
let dev: { get(): string | null } = { get: () => "desktop" };
let sending = false;

// ---- Small pieces ----
const journeyHtml = (items: ApplyItem[] | null) => `<ol class="ai-jr ai-jr--4 cj-req" data-journey>${ITEMS.map((s, i) => {
  const it = items?.find((x) => x.id === s.id);
  const waived = !!it && it.detail === WAIVED;
  const cls = !it ? "" : waived ? "is-waived" : it.ok ? "is-met" : "is-wait";
  const v = !it ? "" : waived ? WAIVED : it.ok ? (it.detail || s.yes) : (it.detail || "Not yet");
  return `<li tabindex="0"${cls ? ` class="${cls}"` : ""}><span class="ai-jr-num">${cls === "is-met" || cls === "is-waived" ? "✓" : i + 1}</span><span class="ai-jr-ic" aria-hidden="true">${s.ic}</span><b>${s.t}</b><span class="ai-jr-t">${s.d}</span>${v ? `<span class="ai-jr-v">${esc(v)}</span>` : ""}${cls ? `<span class="bt-sr-only">: ${cls === "is-wait" ? "not yet" : "done"}</span>` : ""}</li>`;
}).join("")}</ol>`;

const signInActs = `<a class="bt-btn bt-btn--primary" href="/account" data-signin="join" data-signin-title="Join to apply for the crew">Join free to apply</a><a class="bt-btn bt-btn--secondary" href="/account" data-signin="signin">Log in</a>`;
const signUpAct = `<button type="button" class="bt-btn bt-btn--primary" data-signin="signup">Finish signup</button>`;
const how = `<a class="bt-btn bt-btn--secondary" href="/crew/how-it-works">How the crew works</a>`;

function verdict(mode: Mode, m: Me | null) {
  const a = m?.apply;
  if (mode === "visitor") return `<div class="cj-verdict is-wait"><span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>Free account needed</span><span>Join free and we'll check these four for you in a moment.</span><span class="ai-acts">${signInActs}</span></div>`;
  if (mode === "signup") return `<div class="cj-verdict is-wait"><span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>Almost there</span><span>Your account needs a few more details before we can check these.</span><span class="ai-acts">${signUpAct}</span></div>`;
  if (mode === "blocked") {
    const t = a?.reapplyAt ? `You can apply again on ${dateLabel(a.reapplyAt)}.` : reasonText(a?.reason) || "The steps above show what's left. The form opens as soon as you're ready.";
    return `<div class="cj-verdict is-wait"><span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>Not quite yet</span><span>${esc(t)}</span><span class="ai-acts"><a class="bt-btn bt-btn--secondary" href="/crew">Meet the crew</a></span></div>`;
  }
  if (mode === "form") return `<div class="cj-verdict"><span class="bt-badge bt-badge--lime"><span class="bt-badge-dot"></span>You can apply</span><span>All four are green. Pick your chats below.</span></div>`;
  return "";
}

// ---- The form's parts (02 to 05) ----
function buildParts(locked: boolean) {
  prefs = Object.fromEntries(CHATS.map((c) => [c, locked ? SAMPLE[c] : ""])) as Record<Chat, Pref | "">;
  $("[data-cj-chats]").innerHTML = `<div class="cj-chats">${CHATS.map((c) => chatTileHtml({
    chat: c, name: CHAT_NAME[c], iconHtml: platformIconHtml(c), value: prefs[c], needed: NEEDED.includes(c), boost: NEEDED.includes(c) ? 1.5 : 0,
    note: NOTE[c], previewHtml: chatPreviewHtml(MINI[c]),
  })).join("")}</div>`;
  initChatTiles($("[data-cj-chats]") as unknown as Document, { onChange: (chat: any, v: any) => { prefs[chat as Chat] = v as Pref; } });

  $("[data-cj-when]").innerHTML = `${dayPickerHtml({ days: DAYS, selected: locked ? ["thu", "fri", "sat"] : [], label: "Days you're usually around" } as any)}
    <div class="cj-when">
      <div class="bt-field"><span class="bt-label" id="cj-l-time">Usual time (Central)</span><div class="cj-opt" role="group" aria-labelledby="cj-l-time">${TIMES.map((t, i) => `<button type="button" class="bt-chip bt-chip--small" data-time="${esc(t)}" aria-pressed="${locked && i === 0}">${t}</button>`).join("")}</div>
        <input class="bt-input" id="cj-note" maxlength="200" placeholder="Anything else about your times? (optional)" aria-label="Anything else about your times"></div>
      <div class="bt-field"><span class="bt-label" id="cj-l-dev">How you watch</span>
        <span class="bt-pref-seg cj-device" role="radiogroup" aria-labelledby="cj-l-dev" data-device>${DEVICES.map(([k, l], i) => `<button type="button" role="radio" aria-checked="${i === (locked ? 1 : 0)}" tabindex="${i === (locked ? 1 : 0) ? 0 : -1}" data-value="${k}">${l}</button>`).join("")}</span>
        <span class="bt-hint" data-cj-devhint>${locked ? DEV_HINT.phone : DEV_HINT.desktop}</span></div>
    </div>`;
  initDayPicker($("[data-cj-when]") as unknown as Document);
  const hint = $("[data-cj-devhint]");
  dev = initRadioGroup($("[data-device]"), { onChange: (v: string) => { hint.textContent = DEV_HINT[v] || DEV_HINT.desktop; } });
  $("[data-cj-when]").querySelectorAll<HTMLButtonElement>("[data-time]").forEach((b) => b.addEventListener("click", () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    $("[data-cj-when]").querySelectorAll("[data-time]").forEach((x) => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", String(on));
  }));

  $("[data-cj-you]").innerHTML = `<div class="cj-about">
    <div class="bt-field"><label class="bt-label" for="cj-why">Why do you want to help?</label><textarea class="bt-textarea" id="cj-why" rows="5" maxlength="1000" aria-describedby="cj-why-h"></textarea><span class="bt-hint" id="cj-why-h">At least 20 characters.</span></div>
    <div class="bt-field"><label class="bt-label" for="cj-exp">Any mod experience? (optional)</label><textarea class="bt-textarea" id="cj-exp" rows="5" maxlength="1000" placeholder="Other channels, Discord servers, anything"></textarea></div></div>`;

  $("[data-cj-agree]").innerHTML = `<label class="bt-check"><input type="checkbox" id="cj-code" data-cj-code> <span>I agree to the Crew Code, and I'm 18 or older.</span></label><span class="bt-badge bt-badge--lime" data-cj-signed hidden><span class="bt-badge-dot"></span>Signed</span>`;

  root.querySelectorAll<HTMLElement>(".cj-part").forEach((p) => { p.toggleAttribute("inert", locked); p.classList.toggle("is-locked", locked); });
}

function syncSend() {
  const box = root.querySelector<HTMLInputElement>("[data-cj-code]");
  const ok = !!box?.checked;
  root.querySelector<HTMLElement>("[data-cj-signed]")?.toggleAttribute("hidden", !ok);
  const btn = root.querySelector<HTMLButtonElement>("[data-cj-send-acts] button[type=submit]");
  if (btn && root.dataset.cjState === "form") btn.disabled = !ok || sending;
  const p = $("[data-cj-send-p]");
  if (root.dataset.cjState === "form") p.textContent = ok ? "Everything's filled in. Send it and you're in the queue." : "Tick the Crew Code above to send your application.";
}
form.addEventListener("change", syncSend);

// ---- Hero ----
const defaults = { kicker: $("[data-cj-kicker]").textContent!, h: $("[data-cj-h]").textContent!, p: $("[data-cj-p]").textContent! };
function hero(mode: Mode, m: Me | null) {
  const set = (kicker: string, h: string, p: string, acts: string) => {
    $("[data-cj-kicker]").textContent = kicker; $("[data-cj-h]").textContent = h; $("[data-cj-p]").textContent = p; $("[data-cj-acts]").innerHTML = acts;
  };
  const d = defaults;
  if (mode === "crew") set("Mod Machina · the crew", "You're already on the crew", "Thank you for helping keep the chats fun and safe. Your grade, Gears and next steps are in HQ, and the Academy is there whenever you want to learn more.", `<a class="bt-btn bt-btn--primary" href="/crew/hq">Go to HQ</a><a class="bt-btn bt-btn--secondary" href="/crew/academy">Crew Academy</a>`);
  else if (mode === "applied" || mode === "sent") set(d.kicker, "Your application is in", "The crew can vouch for you now, and Boomer makes the final call. Here's where you stand.", `<a class="bt-btn bt-btn--primary" href="#j-next">See what happens next</a>${how}`);
  else if (mode === "notNow") set(d.kicker, "Thanks for applying", "We'd like a little more time with you in chat first. Here's when you can try again.", `<a class="bt-btn bt-btn--primary" href="/crew">Meet the crew</a>${how}`);
  else if (mode === "visitor") set(d.kicker, d.h, d.p, `<a class="bt-btn bt-btn--primary" href="/account" data-signin="join" data-signin-title="Join to apply for the crew">Join free to apply</a>${how}`);
  else if (mode === "signup") set(d.kicker, d.h, d.p, `${signUpAct}${how}`);
  else if (mode === "blocked") set(d.kicker, d.h, d.p, `<a class="bt-btn bt-btn--primary" href="#j-check">See what's left</a>${how}`);
  else set(d.kicker, d.h, d.p, `<a class="bt-btn bt-btn--primary" href="#j-chats">Start my application</a>${how}`);
  $("[data-cj-stage]").hidden = mode === "crew";
  $("[data-cj-crewart]").hidden = mode !== "crew";
  void m;
}

// ---- After sending / already applied ----
function afterHtml(band: string | null, expiresAt: number | null, createdAt: number) {
  const top = band === "Top 5";
  const day = new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const steps = [["✅", "Applied", "Done."], ["🤝", "Get vouched", "Crew back you."], ["🎃", "Boomer says yes", "His call, every time."], ["🎓", "Train", "Academy + 2 ride-alongs."]];
  return `<div class="cj-sent" role="status"><span class="cj-sent-stamp">${stampHtml({ kicker: "Application", label: "In", sub: day })}</span>
    <div><h3>${top ? "You're in the queue. Top 5." : "You're in the queue."}</h3>
      <p>Crew who know you from chat can vouch for you now, and Boomer makes the final call. We'll message you here either way. ${expiresAt ? `Your application stays open until ${esc(dateLabel(expiresAt))}.` : "Applications stay open for 90 days."}</p></div>
    <ol class="ai-jr ai-jr--4 cj-j4" data-journey>${steps.map(([ic, t, d], i) => `<li tabindex="0"${i === 0 ? ` class="is-met"` : ""}><span class="ai-jr-num">${i ? i + 1 : "✓"}</span><span class="ai-jr-ic" aria-hidden="true">${ic}</span><b>${t}</b><span class="ai-jr-t">${d}</span></li>`).join("")}</ol></div>`;
}
function notNowHtml(note: string | null, reapplyAt: number | null) {
  return `<div class="cj-sent cj-sent--note"><span class="cj-sent-ic" aria-hidden="true">💌</span><div><h3>Not this time</h3>
    <p>${esc(note || "Thanks for applying. We'd like a little more time with you in chat first.")}</p>
    <p>${reapplyAt ? `You're welcome to apply again on <b>${esc(dateLabel(reapplyAt))}</b>.` : "You're welcome to apply again later."} Until then, come hang out in chat and keep checking in.</p></div></div>`;
}

// ---- Crew: one small invite card under the hero (the member's own recruit link, as on HQ, or a pointer to How it works) ----
const SITE_URL = "https://boomertanger.com";
function bring(show: boolean) {
  const box = $("[data-cj-bring]");
  box.hidden = !show;
  if (!show) return;
  const handle = me?.profile?.handle || "";
  const p = $("[data-cj-bring-p]"), row = $("[data-cj-bring-row]");
  if (handle) {
    const link = `${SITE_URL}/join/@${handle}`;
    p.textContent = "Know someone who'd be good at this? Share your link. It counts once they've been around for a week.";
    row.innerHTML = `<span class="bt-code">${esc(link.replace("https://", ""))}</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-cj-copy>Copy</button>`;
    row.querySelector<HTMLButtonElement>("[data-cj-copy]")!.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(link); toast("Link copied. One link post per room an hour, please."); }
      catch { toast("Couldn't copy. Select the link and copy it by hand.", { kind: "error" }); }
    });
  } else {
    p.textContent = "Know someone who'd be good at this? Here's how the crew works, so you can tell them what to expect.";
    row.innerHTML = `<a class="bt-btn bt-btn--secondary bt-btn--sm" href="/crew/how-it-works">How the crew works</a>`;
  }
}

// ---- Mode switch: what shows ----
function setMode(mode: Mode, m: Me | null, extra: { band?: string | null; expiresAt?: number | null; createdAt?: number; note?: string | null; reapplyAt?: number | null } = {}) {
  root.dataset.cjState = mode;
  const lite = LITE.includes(mode);
  const tl = root.closest<HTMLElement>(".tl-wrap");
  tl?.toggleAttribute("data-cj-lite", lite);
  tl?.querySelector<HTMLElement>(".tl-nav")?.toggleAttribute("hidden", lite);
  root.querySelectorAll<HTMLElement>("[data-cj-full]").forEach((s) => { s.hidden = lite; });
  const sent = mode === "sent" || mode === "applied" || mode === "notNow";
  $("[data-cj-nextsec]").hidden = mode === "crew";
  $("[data-cj-faq]").hidden = mode === "crew";      // the questions are for applicants; crew just get the hero and the invite card
  bring(mode === "crew");
  $("[data-cj-nextchap]").hidden = sent;
  $("[data-cj-nextj]").hidden = sent;
  $("[data-cj-send]").hidden = sent;
  $("[data-cj-after]").innerHTML = mode === "sent" || mode === "applied" ? afterHtml(extra.band ?? null, extra.expiresAt ?? null, extra.createdAt ?? Date.now()) : mode === "notNow" ? notNowHtml(extra.note ?? null, extra.reapplyAt ?? null) : "";
  const label = $("[data-cj-after]");
  label.querySelectorAll("[data-journey]").forEach(initJourney);
  hero(mode, m);
}

function renderLive(mode: Mode, m: Me | null) {
  const locked = mode !== "form";
  const items = m?.apply?.items ?? null;
  $("[data-cj-check]").innerHTML = journeyHtml(items) + verdict(mode, m);
  $("[data-cj-check]").querySelectorAll("[data-journey]").forEach(initJourney);
  const lock = $("[data-cj-lock]");
  lock.hidden = !locked;
  lock.innerHTML = locked ? `<div class="bt-notice cj-lock">${mode === "visitor" ? "Here's a look at the form. Join free to fill it in." : mode === "signup" ? "Here's a look at the form. Finish signing up to fill it in." : "Here's a look at the form. It opens as soon as you can apply."}</div>` : "";
  buildParts(locked);
  const p = $("[data-cj-send-p]"), acts = $("[data-cj-send-acts]");
  $("[data-cj-err]").hidden = true;
  if (mode === "visitor") { p.textContent = "Applying needs a free account, so we can check the basics."; acts.innerHTML = signInActs; }
  else if (mode === "signup") { p.textContent = "Your account needs a few more details before you can apply."; acts.innerHTML = signUpAct; }
  else if (mode === "blocked") { p.textContent = m?.apply?.reapplyAt ? `You can apply again on ${dateLabel(m.apply.reapplyAt)}.` : reasonText(m?.apply?.reason) || "The form opens as soon as you can apply."; acts.innerHTML = `<button class="bt-btn bt-btn--primary" type="submit" disabled>Send application</button>`; }
  else { acts.innerHTML = `<button class="bt-btn bt-btn--primary" type="submit" disabled>Send application</button>`; }
  syncSend();
}

onAccess(async (s) => {
  me = s;
  const run = ++seq;
  if (s.status === "signedOut") { setMode("visitor", null); return renderLive("visitor", null); }
  if (s.status === "needsSignup") { setMode("signup", null); return renderLive("signup", null); }
  let m: Me;
  try { m = await loadMe(s); } catch (err) {
    if (run !== seq) return;
    setMode("blocked", null);
    renderLive("blocked", null);
    $("[data-cj-check]").innerHTML = `<div class="bt-notice bt-notice--error">${esc(errText(err, "We couldn't check your account just now. Refresh the page to try again."))}</div>`;
    $("[data-cj-send-p]").textContent = "Refresh the page to try again.";
    return;
  }
  if (run !== seq) return;
  const app = m.application;
  if (m.crew && m.crew.status !== "alumni") return setMode("crew", m);
  if (app && app.status === "open") return setMode("applied", m, { band: app.band, expiresAt: app.expiresAt, createdAt: app.createdAt });
  if (app && app.status === "notNow" && m.apply && !m.apply.ok) return setMode("notNow", m, { note: app.note, reapplyAt: app.reapplyAt ?? m.apply.reapplyAt });
  const mode: Mode = m.apply?.ok ? "form" : "blocked";
  setMode(mode, m);
  renderLive(mode, m);
});

// ---- Send ----
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (root.dataset.cjState !== "form" || sending) return;
  const err = $("[data-cj-err]");
  const fail = (msg: string, focus?: HTMLElement | null) => { err.textContent = msg; err.hidden = false; (focus ?? err).scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }); focus?.focus({ preventScroll: true }); };
  err.hidden = true;
  const why = root.querySelector<HTMLTextAreaElement>("#cj-why")!;
  const whyText = why.value.trim();
  why.removeAttribute("aria-invalid");
  if (!CHATS.some((c) => prefs[c] && prefs[c] !== "no")) return fail("Pick at least one chat you'd help in.", root.querySelector<HTMLElement>(".bt-chat-tile [role=radio][tabindex='0']"));
  if (whyText.length < 20) { why.setAttribute("aria-invalid", "true"); return fail("Tell us a little more about why you want to help (at least 20 characters).", why); }
  if (!root.querySelector<HTMLInputElement>("[data-cj-code]")!.checked) return fail(reasonText("code"));
  const btn = root.querySelector<HTMLButtonElement>("[data-cj-send-acts] button[type=submit]")!;
  sending = true; btn.disabled = true; btn.setAttribute("aria-busy", "true");
  const time = root.querySelector<HTMLElement>("[data-time][aria-pressed=true]")?.dataset.time || "";
  const extraNote = root.querySelector<HTMLInputElement>("#cj-note")!.value.trim();
  const data = {
    preferences: Object.fromEntries(CHATS.map((c) => [c, prefs[c] || "no"])) as Prefs,
    availability: { days: dayPickerValue(root.querySelector(".bt-day-picker")!) as string[], note: [time, extraNote].filter(Boolean).join(" · ") },
    device: dev.get() || "desktop",
    answers: { why: whyText, experience: root.querySelector<HTMLTextAreaElement>("#cj-exp")!.value.trim() },
    codeAgreed: true,
  };
  try {
    let res: { band: string | null; expiresAt: number | null };
    if (isPreview(me)) { console.debug("crewApply (preview, not sent)", JSON.stringify(data)); res = { band: q("band") === "queue" ? "In the queue" : "Top 5", expiresAt: Date.now() + 90 * 864e5 }; }
    else res = await crewCall<{ ok: boolean; appId: string; band: string | null; expiresAt: number | null }>("crewApply", data);
    seq++;   // a late auth re-render must not undo this
    setMode("sent", null, { band: res.band, expiresAt: res.expiresAt, createdAt: Date.now() });
    root.querySelectorAll<HTMLElement>(".cj-part").forEach((p) => { p.setAttribute("inert", ""); p.classList.add("is-locked"); });
    const after = $("[data-cj-after]");
    after.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
  } catch (e2) {
    fail(errText(e2, "We couldn't send your application. Try again in a moment."));
    btn.removeAttribute("aria-busy");
  } finally { sending = false; syncSend(); }
});

// The shared How it works behaviour: spotlight, journeys, Ask BOOMBOT.
initHowItWorks(document);
