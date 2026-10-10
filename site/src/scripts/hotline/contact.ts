// /contact, Hotline Boom (docs/specs/hotline-boom.md §3, §4, §9, §11; mockup docs/design/mockups/hotline-boom-contact.html Layout 3). Draws the keypad menu (LCD + six line rows) and
// the form for the picked line, sends it through contactSend, and shows Sent or Too many. Also: the hero phone (answers on tap), the status pill from hotline/main.replyTime, ?line=N,
// keys 1 to 6, the Turnstile widget, the "How did you find" question (asked once), the landing source (?via= or the referrer, kept for the visit) and the email reveal rows.
//
// Who sees what: visitors type a name and an email; members send as @handle. Members under 18 (and members with no age band) don't get Business, and the keys renumber. Lines switched
// off in Settings are hidden. ?line=N uses the line's fixed number (1 to 6, Shop links ?line=4) and is ignored when that line isn't open to the viewer.
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { sectionHeadHtml } from "../../../../shared/ui/section-head.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { initReveals } from "../../../../shared/ui/reveal.js";
import { onAuth, initialsOf, type AuthState } from "../../lib/auth";
import { db, doc, getDoc, getDocs, collection, query, where, SITE_ID } from "../../lib/db";
import { call } from "../../lib/call";
import { reasonOf, messageFor } from "../../lib/errors";
import { addDays, weekIdOf, ymd } from "../planner/pub";
import { icon } from "./art";

type Lane = "team" | "owner";
interface Line { key: number; id: string; title: string; line: string; lane: Lane; ph: string; from: string }
// The six lines (functions/lib/hotline/logic.js LINES): key, id, lane and reply address match the server; the copy is the mockup's.
const LINES: Line[] = [
  { key: 1, id: "hi", title: "Say hi", line: "Fan mail, a favourite moment, or just hello.", lane: "team", from: "fanmail", ph: "Say hello, share a favourite moment, or tell Boomertanger what got you watching." },
  { key: 2, id: "feedback", title: "Feedback", line: "Streams, the website, games, anything.", lane: "team", from: "fanmail", ph: "What worked, what didn't, and what you'd change." },
  { key: 3, id: "help", title: "Account help", line: "Signing in, your handle, your data.", lane: "team", from: "support", ph: "What happened, and what you expected to happen." },
  { key: 4, id: "business", title: "Business & collabs", line: "Sponsorships, collabs, press.", lane: "owner", from: "business", ph: "Tell Boomertanger about your brand and what you have in mind." },
  { key: 5, id: "private", title: "Private matter", line: "Something only Boomertanger should see.", lane: "owner", from: "fanmail", ph: "Take your time. This stays between you and Boomertanger." },
  { key: 6, id: "report", title: "Report a person", line: "A member, a mod or an admin.", lane: "owner", from: "support", ph: "What happened, when, and where (stream, chat, Discord or the site)." },
];
const ABOUT: [string, string][] = [["stream", "A stream"], ["website", "The website"], ["game", "A game"], ["crew", "The crew"], ["other", "Something else"]];
const MOODS: [string, string][] = [["loved", "Loved it"], ["okay", "It was okay"], ["notgreat", "Not great"]];
const KINDS: [string, string][] = [["sponsorship", "Sponsorship"], ["collab", "Collab with another creator"], ["gamekey", "Game key or early access"], ["press", "Press or interview"], ["other", "Something else"]];
const TIMELINES: [string, string][] = [["norush", "No rush"], ["month", "This month"], ["twoweeks", "Within two weeks"], ["urgent", "It's urgent"]];
const SOURCES: [string, string][] = [["twitch", "Twitch"], ["youtube", "YouTube"], ["tiktok", "TikTok"], ["instagram", "Instagram"], ["search", "Google or another search"], ["friend", "A friend told me"], ["streamer", "Another streamer"], ["community", "Reddit or Discord"], ["other", "Something else"]];
const MAX = 5000;
const ASKED_KEY = "bt.hotline.asked";
const VIA_KEY = "bt.hotline.via";

const page = document.querySelector<HTMLElement>("[data-hb]");
const main = page?.querySelector<HTMLElement>("[data-hb-main]") ?? null;
const elseBox = page?.querySelector<HTMLElement>("[data-hb-else]") ?? null;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => (page?.offsetWidth ?? 1000) <= 640;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const store = (s: Storage | undefined, k: string, v?: string) => { try { if (v === undefined) return s?.getItem(k) ?? null; s?.setItem(k, v); } catch { /* private mode: fine */ } return null; };

interface Settings { replyTime: string; lines: Record<string, boolean> }
const M = {
  auth: null as AuthState | null,
  settings: { replyTime: "3 days", lines: {} } as Settings,
  ready: false,
  pick: null as string | null,
  state: "form" as "form" | "sent" | "limit",
  about: null as string | null,
  mood: null as string | null,
  sending: false,
  clientRef: newRef(),
  sent: null as null | { ref: number; lane: Lane; replyTime: string; email: string | null },
  retryAt: 0,
  streams: null as null | { id: string; label: string }[],
  error: "" as string,
};

function newRef() { return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^A-Za-z0-9_-]/g, ""); }
const member = () => !!M.auth && (M.auth.status === "verified" || M.auth.status === "unverified") && !!M.auth.profile;
const adult = () => !member() || M.auth?.account?.ageBand === "18+";
/** The lines open to this viewer, in order (their display keys renumber when one is missing). */
const open = () => LINES.filter((l) => M.settings.lines[l.id] !== false && !(l.id === "business" && !adult()));
const asked = () => (member() ? (M.auth?.account as { hotlineAskedSource?: boolean } | null)?.hotlineAskedSource === true : store(globalThis.localStorage, ASKED_KEY) === "1");

/* ---------- the landing source (spec §5 "via"): ?via= or the referrer's host, kept for the visit ---------- */
(() => {
  const q = new URLSearchParams(location.search).get("via");
  let via = q ? q.slice(0, 60) : "";
  if (!via && document.referrer) { try { const h = new URL(document.referrer).hostname; if (h && h !== location.hostname) via = h; } catch { /* no referrer */ } }
  if (via && !store(globalThis.sessionStorage, VIA_KEY)) store(globalThis.sessionStorage, VIA_KEY, via);
})();

/* ---------- pieces ---------- */
const sh = (k: string, title: string, sub: string, count: number | null = null) =>
  sectionHeadHtml({ icon: icon(k).replace("<svg ", '<svg width="18" height="18" style="color: var(--bt-title)" '), title, sub, count, small: true });
const laneTag = (lane: Lane) => lane === "owner"
  ? `<span class="bt-tag hb-lane hb-lane--owner">${icon("private")}Only Boomertanger reads</span>`
  : `<span class="bt-tag hb-lane">${icon("team")}Boomertanger + inbox team</span>`;
const field = (f: string, inner: string, err = "") => `<div class="bt-field" data-f="${f}">${inner}<span class="bt-error" data-err>${esc(err)}</span></div>`;
const opts = (list: [string, string][], blank = "") => `${blank ? `<option value="">${esc(blank)}</option>` : ""}${list.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}`;
const chips = (name: string, list: [string, string][], on: string | null) => list.map(([v, l]) => `<button type="button" class="bt-chip bt-chip--small" aria-pressed="${on === v}" data-${name}="${v}">${esc(l)}</button>`).join("");

function senderHtml() {
  if (!member()) return `<div class="hb-grid2">
    ${field("name", `<label class="bt-label" for="hb-name">Your name</label><input class="bt-input" id="hb-name" autocomplete="name" maxlength="80" placeholder="What should we call you?">`, "Add your name so we know who's writing.")}
    ${field("email", `<label class="bt-label" for="hb-email">Your email</label><input class="bt-input" id="hb-email" type="email" autocomplete="email" maxlength="200" placeholder="you@example.com"><span class="bt-hint">The reply goes here. Never shared.</span>`, "Add an email so Boomertanger can reply.")}</div>`;
  const p = M.auth!.profile!;
  return `<div class="hb-as"><span class="hb-av" aria-hidden="true">${esc(initialsOf(p))}</span><span>Sending as <b>@${esc(p.handle)}</b>. The reply arrives in your alerts and by email.</span></div>`;
}

function streamField() {
  if (M.about !== "stream") return "";
  const list = M.streams;
  const inner = list === null ? `<select class="bt-select" id="hb-stream" disabled><option>Loading the last streams…</option></select>`
    : `<select class="bt-select" id="hb-stream"><option value="">Not sure, or not listed</option>${list.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join("")}</select>`;
  return `<div class="hb-pane-anim">${field("stream", `<label class="bt-label" for="hb-stream">Which stream?</label>${inner}`)}</div>`;
}

function extrasHtml(l: Line) {
  if (l.id === "feedback") return `${field("about", `<span class="bt-label" id="hb-about-l">What's it about?</span><div class="hb-chips" role="group" aria-labelledby="hb-about-l">${chips("about", ABOUT, M.about)}</div>`)}
    <div data-hb-stream>${streamField()}</div>
    ${field("mood", `<span class="bt-label" id="hb-mood-l">How did it land? <span class="hb-opt">(optional)</span></span><div class="hb-chips" role="group" aria-labelledby="hb-mood-l">${chips("mood", MOODS, M.mood)}</div>`)}`;
  if (l.id === "help") return `<div class="bt-field"><span class="bt-label">Quick answers first</span><div class="hb-faq">
    <details><summary>I can't sign in</summary><p>Use the same button you joined with (Google, Twitch or email). Forgot your password? "Forgot password?" in the sign-in box sends a reset link, or "Email me a link instead" signs you in without one.</p></details>
    <details><summary>How do I change my handle or name?</summary><p>Your <a href="/account">account page</a>, Profile tab. Handles are first come, first served.</p></details>
    <details><summary>How do I get or delete my data?</summary><p>Your <a href="/account">account page</a>, Your data tab. For anything else about privacy, write to privacy@ (below).</p></details></div><span class="bt-hint">Still stuck? Tell us below.</span></div>`;
  if (l.id === "business") return `<div class="hb-grid2">
    ${field("company", `<label class="bt-label" for="hb-co">Company or brand</label><input class="bt-input" id="hb-co" autocomplete="organization" maxlength="120" placeholder="e.g. Nightjar Games">`, "Add the company or brand.")}
    ${field("website", `<label class="bt-label" for="hb-site">Website <span class="hb-opt">(optional)</span></label><input class="bt-input" id="hb-site" maxlength="200" inputmode="url" placeholder="e.g. www.nightjargames.com">`)}
    ${field("kind", `<label class="bt-label" for="hb-kind">What kind?</label><select class="bt-select" id="hb-kind">${opts(KINDS)}</select>`)}
    ${field("timeline", `<label class="bt-label" for="hb-when">Timeline <span class="hb-opt">(optional)</span></label><select class="bt-select" id="hb-when">${opts(TIMELINES, "Choose one")}</select>`)}</div>`;
  if (l.id === "private" || l.id === "report") return `${l.id === "report" ? field("who", `<label class="bt-label" for="hb-whom">Who is it about?</label><input class="bt-input" id="hb-whom" maxlength="120" placeholder="@handle, or their name on Twitch, YouTube or Discord">`, "Say who it's about.") : ""}
    <div class="hb-lock">${icon("private")}<div><b>Only Boomertanger reads this.</b>Not the crew, and not the admins who help with the inbox.${l.id === "report" ? " Reports about a mod or an admin never reach them." : ""}</div></div>`;
  return "";
}

function formHtml(l: Line, n: number) {
  return `<form class="hb-form hb-pane-anim" novalidate data-form>
    <div class="hb-form-head"><span class="hb-ico">${icon(l.id)}</span><div><p class="hb-pressed">Line ${n}</p><h3 class="bt-heading">${esc(l.title)}</h3>${laneTag(l.lane)}</div></div>
    ${senderHtml()}
    ${extrasHtml(l)}
    ${field("body", `<div class="hb-label-row"><label class="bt-label" for="hb-msg">Message</label><span class="hb-count" data-count>0 / 5,000</span></div><textarea class="bt-textarea" id="hb-msg" maxlength="${MAX}" rows="6" placeholder="${esc(l.ph)}"></textarea>`, "Write a message first.")}
    ${asked() ? "" : field("source", `<label class="bt-label" for="hb-src">How did you find Boomertanger? <span class="hb-opt">(optional, asked once)</span></label><select class="bt-select" id="hb-src">${opts(SOURCES, "Choose one")}</select>`)}
    ${l.lane === "team" ? `<label class="hb-check"><input type="checkbox" id="hb-only"><span>Only Boomertanger should read this<small>Keeps it away from the admins who help with the inbox.</small></span></label>` : ""}
    ${l.id === "private" ? `<p class="hb-crisis">If you're in danger or thinking about hurting yourself, call or text 988 (in the US) or your local emergency number now. This inbox isn't watched around the clock.</p>` : ""}
    <div class="hb-hp" aria-hidden="true"><label for="hb-fax">Leave this empty</label><input id="hb-fax" name="fax" tabindex="-1" autocomplete="off"></div>
    <div class="hb-ts" data-ts></div>
    <p class="bt-notice bt-notice--error hb-form-err" data-form-err role="alert"${M.error ? "" : " hidden"}>${esc(M.error)}</p>
    <div class="hb-foot"><span class="bt-hint">${icon("shield")}Protected from spam by Cloudflare. Boomertanger usually replies within ${esc(M.settings.replyTime)}.</span><button class="bt-btn bt-btn--primary hb-sendbtn" type="submit"${M.sending ? " disabled" : ""}>${M.sending ? "Sending…" : "Send message"}</button></div>
  </form>`;
}

function lcdHtml(list: Line[], i: number) {
  const l = list[i];
  return `<div class="hb-lcd" aria-live="polite"><span class="hb-lcd-top">${l ? `Line ${i + 1} connected` : "Hotline Boom"}<i class="hb-lcd-dot${l ? " is-on" : ""}"></i></span><span class="hb-lcd-main">${l ? esc(l.title) : `Press 1 to ${list.length}`}<i class="hb-lcd-cur"></i></span></div>`;
}
function rowHtml(l: Line, n: number) {
  const who = l.lane === "owner" ? "Only Boomertanger reads it." : "Read by Boomertanger and the inbox team.";
  return `<button type="button" class="hb-row" aria-pressed="${M.pick === l.id}" data-line="${l.id}" aria-label="${n + 1}: ${esc(l.title)}. ${esc(l.line)} ${who}"><span class="hb-key" aria-hidden="true">${n + 1}</span><b>${esc(l.title)}</b><span class="hb-line">${esc(l.line)}</span><span class="hb-lane-ic${l.lane === "owner" ? " hb-lane-ic--owner" : ""}" aria-hidden="true">${icon(l.lane === "owner" ? "private" : "team")}</span></button>`;
}

function menuHtml() {
  const list = open(), i = list.findIndex((l) => l.id === M.pick), l = list[i];
  const back = l ? `<div class="hb-backrow"><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-back>${icon("back", 2.4)}Back to the menu</button></div>` : "";
  const pane = l ? formHtml(l, i + 1) : `<div class="hb-idle">${mascot()}<b>Pick a number to start</b><span>Each one opens a short form made for it.</span></div>`;
  const menu = list.length
    ? `${lcdHtml(list, i)}${list.map(rowHtml).join("")}<div class="hb-legend"><span class="is-owner">${icon("private")}Only Boomertanger reads it</span><span>${icon("team")}Boomertanger + inbox team</span><span class="hb-kbd" aria-hidden="true">Keyboard: press <kbd>1</kbd> to <kbd>${list.length}</kbd></span></div>`
    : `<div class="bt-empty">${mascot()}<span class="bt-empty-title">The lines are closed right now</span><span>The email addresses below still work.</span></div>`;
  return `<div class="hb-menu-grid">
    <section class="hb-col hb-menu-col">${sh("line", "Pick a line", "Press a number.", list.length)}<div class="hb-menu" role="group" aria-label="Choose a line">${menu}</div></section>
    <section class="hb-col hb-pane">${back}${sh("pen", "Write your message", "Short is fine. Most take about a minute.")}${pane}</section>
  </div>`;
}

function sentHtml() {
  const s = M.sent!;
  const owner = s.lane === "owner";
  const reply = s.email ? `The reply will go to <b>${esc(s.email)}</b>. Wrong address? Send it again with the right one.` : "The reply will show up in your alerts and by email.";
  return `<div class="hb-done" role="status" tabindex="-1" data-done>${stampHtml({ kicker: "Hotline", label: "Sent", sub: `BT-${s.ref}`, tone: "primary" })}
    <h2 class="bt-heading">Message sent</h2>
    ${laneTag(s.lane)}
    <p>${owner ? "Only Boomertanger will read it." : "Boomertanger and the inbox team will read it."} ${reply}</p>
    <p>Boomertanger usually replies within <b>${esc(s.replyTime)}</b>. Keep <b>BT-${s.ref}</b> if you need to follow up.</p>
    <div class="hb-done-acts"><button type="button" class="bt-btn bt-btn--primary" data-again>Send another message</button><a class="bt-btn bt-btn--secondary" href="/">Back to home</a></div></div>`;
}

function limitHtml() {
  const t = M.retryAt ? new Date(M.retryAt) : null;
  const when = t ? (t.getTime() - Date.now() > 20 * 3600e3 ? t.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" }) : t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })) : "";
  return `<div class="bt-empty hb-limit" role="status" tabindex="-1" data-done>${mascot()}<span class="bt-empty-title">That's the limit for now</span><span>${member() ? "You've sent a lot of messages today." : "You've sent a lot of messages in the last hour."}${when ? ` You can send another after ${esc(when)}.` : " Try again later."}</span><span>In a hurry? The email addresses below still work.</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-again>Back to the menu</button></div>`;
}

/* ---------- render ---------- */
function render() {
  if (!main || !page) return;
  if (M.pick && !open().some((l) => l.id === M.pick)) M.pick = null;
  if (M.pick && M.state === "form") page.dataset.picked = M.pick; else delete page.dataset.picked;
  main.innerHTML = M.state === "sent" ? sentHtml() : M.state === "limit" ? limitHtml() : menuHtml();
  if (elseBox) elseBox.hidden = M.state !== "form";
  count();
  if (M.state === "form" && M.pick) mountTurnstile();
}
/** Re-render while keeping what's typed (the chips redraw the form). */
function keep(fn: () => void) {
  const vals: Record<string, string | boolean> = {};
  main?.querySelectorAll<HTMLInputElement>("input, textarea, select").forEach((el) => { if (el.id) vals[el.id] = el.type === "checkbox" ? el.checked : el.value; });
  const token = ts.token;
  fn();
  Object.entries(vals).forEach(([id, v]) => { const el = document.getElementById(id) as HTMLInputElement | null; if (!el) return; if (el.type === "checkbox") el.checked = v as boolean;
    else if (el instanceof HTMLSelectElement) { if ([...el.options].some((o) => o.value === v)) el.value = v as string; }
    else el.value = v as string; });
  ts.token = token;
  count();
}
function count() {
  const t = main?.querySelector<HTMLTextAreaElement>("#hb-msg"), c = main?.querySelector<HTMLElement>("[data-count]");
  if (t && c) c.textContent = `${t.value.length.toLocaleString("en-US")} / 5,000`;
}

function pick(id: string, scroll: boolean) {
  if (M.pick !== id) { M.about = null; M.mood = null; M.error = ""; }
  M.pick = id; M.state = "form";
  render();
  if (scroll) main?.querySelector(".hb-pane")?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
}
function press(row: Element | null) { row?.classList.add("is-press"); setTimeout(() => row?.classList.remove("is-press"), 140); }

/* ---------- Turnstile (explicit render; the token is single use, so the widget resets after each send) ---------- */
declare global { interface Window { turnstile?: { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id?: string): void; remove(id?: string): void } } }
const ts = { loading: null as Promise<void> | null, id: "" as string, token: "" as string, waiters: [] as ((t: string) => void)[] };
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  ts.loading ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.onload = () => res(); s.onerror = () => { ts.loading = null; rej(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return ts.loading;
}
function mountTurnstile() {
  const key = page?.dataset.tsKey;
  const box = main?.querySelector<HTMLElement>("[data-ts]");
  if (!key || !box) return;
  ts.token = ""; ts.id = "";
  loadTurnstile().then(() => {
    if (!box.isConnected || !window.turnstile) return;
    ts.id = window.turnstile.render(box, {
      sitekey: key, theme: "dark", appearance: "interaction-only", action: "contact",
      callback: (t: string) => { ts.token = t; ts.waiters.splice(0).forEach((fn) => fn(t)); },
      "expired-callback": () => { ts.token = ""; },
      "error-callback": () => { ts.token = ""; return false; },
    });
  }, () => { /* blocked: the send gets "the check didn't pass" and can retry */ });
}
/** The current token, waiting up to 12 s for the widget to finish. */
function token(): Promise<string> {
  if (ts.token) return Promise.resolve(ts.token);
  return new Promise((res) => { const fn = (t: string) => { clearTimeout(timer); res(t); }; const timer = setTimeout(() => { ts.waiters = ts.waiters.filter((x) => x !== fn); res(""); }, 12000); ts.waiters.push(fn); });
}
function resetTurnstile() { ts.token = ""; try { if (ts.id) window.turnstile?.reset(ts.id); } catch { /* gone */ } }

/* ---------- the Feedback "Which stream?" list: the last 8 finished public streams ---------- */
async function loadStreams() {
  if (M.streams) return;
  try {
    const today = ymd(Date.now());
    const weeks = Array.from({ length: 8 }, (_, i) => weekIdOf(addDays(today, -7 * i)));
    const snap = await getDocs(query(collection(db, "sites", SITE_ID, "streams"), where("published", "==", true), where("state", "==", "ended"), where("week", "in", weeks)));
    const ms = (v: any) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : null);
    const day = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });
    M.streams = snap.docs.map((d) => ({ id: d.id, x: d.data() as any })).filter((s) => s.x.hidden !== true && s.x.type !== "backstage")
      .map((s) => ({ id: s.id, at: ms(s.x.actualStart) ?? ms(s.x.plannedStart) ?? 0, title: String(s.x.title || s.x.theme?.label || "Stream") }))
      .sort((a, b) => b.at - a.at).slice(0, 8)
      .map((s) => ({ id: s.id, label: s.at ? `${day.format(s.at)}: ${s.title}` : s.title }));
  } catch { M.streams = []; }
}

/* ---------- send ---------- */
const val = (f: HTMLFormElement, sel: string) => (f.querySelector<HTMLInputElement>(sel)?.value ?? "").trim();
function markBad(f: HTMLFormElement, key: string, msg?: string) {
  const box = f.querySelector<HTMLElement>(`[data-f="${key}"]`);
  if (!box) return false;
  box.classList.add("is-bad");
  if (msg) box.querySelector<HTMLElement>("[data-err]")!.textContent = msg;
  return true;
}
function formError(f: HTMLFormElement, msg: string) {
  M.error = msg;
  const p = f.querySelector<HTMLElement>("[data-form-err]");
  if (p) { p.textContent = msg; p.hidden = !msg; }
}

async function send(f: HTMLFormElement) {
  const l = LINES.find((x) => x.id === M.pick);
  if (!l || M.sending) return;
  f.querySelectorAll(".is-bad").forEach((x) => x.classList.remove("is-bad"));
  formError(f, "");
  const bad: string[] = [];
  const name = val(f, "#hb-name"), email = val(f, "#hb-email"), body = val(f, "#hb-msg");
  if (!member()) {
    if (!name) bad.push("name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { bad.push("email"); markBad(f, "email", email ? "That email doesn't look right." : "Add an email so Boomertanger can reply."); }
  }
  const fields: Record<string, string> = {};
  if (l.id === "feedback") { if (M.about) fields.about = M.about; if (M.about === "stream" && val(f, "#hb-stream")) fields.stream = val(f, "#hb-stream"); if (M.mood) fields.mood = M.mood; }
  if (l.id === "business") { fields.company = val(f, "#hb-co"); if (!fields.company) bad.push("company"); if (val(f, "#hb-site")) fields.website = val(f, "#hb-site"); fields.kind = val(f, "#hb-kind"); if (val(f, "#hb-when")) fields.timeline = val(f, "#hb-when"); }
  if (l.id === "report") { fields.who = val(f, "#hb-whom"); if (!fields.who) bad.push("who"); }
  if (!body) bad.push("body");
  if (bad.length) {
    bad.forEach((k) => markBad(f, k));
    f.querySelector<HTMLElement>(`[data-f="${bad[0]}"] :is(input, textarea, select)`)?.focus();
    return;
  }
  const showedSource = !!f.querySelector("#hb-src");
  const btn = f.querySelector<HTMLButtonElement>(".hb-sendbtn")!;
  M.sending = true; btn.disabled = true; btn.textContent = "Sending…";
  try {
    const turnstile = await token();
    const res = await call<{ ref: number; lane: Lane; replyTime: string }>("contactSend", {
      line: l.id, body, fields, name: member() ? undefined : name, email: member() ? undefined : email,
      source: val(f, "#hb-src") || null, onlyOwner: !!f.querySelector<HTMLInputElement>("#hb-only")?.checked,
      turnstile, clientRef: M.clientRef, via: store(globalThis.sessionStorage, VIA_KEY) || null, hp: val(f, "#hb-fax"), askedSource: showedSource,
    });
    if (showedSource) {
      if (member() && M.auth?.account) (M.auth.account as { hotlineAskedSource?: boolean }).hotlineAskedSource = true;
      else store(globalThis.localStorage, ASKED_KEY, "1");
    }
    M.sent = { ref: res.ref, lane: res.lane, replyTime: res.replyTime || M.settings.replyTime, email: member() ? null : email };
    M.state = "sent"; M.clientRef = newRef(); M.error = "";
    finish();
  } catch (err) {
    const reason = reasonOf(err);
    const d = (err as { details?: { field?: string; retryAt?: number } }).details;
    if (reason === "rate-limited") { M.retryAt = Number(d?.retryAt) || 0; M.state = "limit"; finish(); return; }
    if (reason === "line-off") { M.settings.lines[l.id] = false; M.pick = null; M.error = ""; render(); toastLater("That line just closed. Pick another one, or use email below."); return; }
    if (reason === "bad-input" && d?.field && d.field !== "line" && markBad(f, d.field, messageFor(err))) {
      f.querySelector<HTMLElement>(`[data-f="${d.field}"] :is(input, textarea, select)`)?.focus();
    } else formError(f, messageFor(err, "That didn't send. Your message is still here: try again."));
    resetTurnstile();
  } finally {
    M.sending = false;
    if (btn.isConnected) { btn.disabled = false; btn.textContent = "Send message"; }
  }
}
function finish() {
  M.pick = M.state === "limit" ? M.pick : null;
  render();
  const done = main?.querySelector<HTMLElement>("[data-done]");
  main?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  done?.focus({ preventScroll: true });
}
async function toastLater(msg: string) { const { toast } = await import("../../../../shared/ui/toast.js"); toast(msg, { kind: "info" }); }

/* ---------- events ---------- */
if (page && main) {
  page.querySelector(".hb-stage")?.addEventListener("click", (e) => {
    const b = e.currentTarget as HTMLElement;
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
  });
  page.querySelector("[data-hb-jump]")?.addEventListener("click", (e) => {
    e.preventDefault();
    main.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    main.querySelector<HTMLElement>(".hb-row")?.focus({ preventScroll: true });
  });
  main.addEventListener("click", (e) => {
    const t = e.target as Element;
    const row = t.closest<HTMLElement>("[data-line]");
    if (row) { pick(row.dataset.line!, narrow()); return; }
    const ab = t.closest<HTMLElement>("[data-about]");
    if (ab) {
      M.about = M.about === ab.dataset.about ? null : ab.dataset.about!;
      keep(() => { main.querySelectorAll<HTMLElement>("[data-about]").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.about === M.about))); main.querySelector("[data-hb-stream]")!.innerHTML = streamField(); });
      if (M.about === "stream" && !M.streams) loadStreams().then(() => keep(() => { const box = main.querySelector("[data-hb-stream]"); if (box) box.innerHTML = streamField(); }));
      return;
    }
    const md = t.closest<HTMLElement>("[data-mood]");
    if (md) { M.mood = M.mood === md.dataset.mood ? null : md.dataset.mood!; main.querySelectorAll<HTMLElement>("[data-mood]").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.mood === M.mood))); return; }
    if (t.closest("[data-back]")) { M.pick = null; M.error = ""; render(); if (narrow()) main.scrollIntoView({ block: "start" }); return; }
    if (t.closest("[data-again]")) { M.state = "form"; M.pick = null; M.about = null; M.mood = null; M.sent = null; render(); main.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }); }
  });
  main.addEventListener("input", (e) => {
    const t = e.target as HTMLElement;
    if (t.id === "hb-msg") count();
    t.closest(".bt-field")?.classList.remove("is-bad");
  });
  main.addEventListener("submit", (e) => { e.preventDefault(); void send(e.target as HTMLFormElement); });
  document.addEventListener("keydown", (e) => {
    if (!M.ready || M.state !== "form" || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as Element).closest?.("input, textarea, select, [contenteditable], .bt-modal")) return;
    const n = parseInt(e.key, 10), list = open();
    if (!(n >= 1 && n <= list.length)) return;
    e.preventDefault();
    pick(list[n - 1].id, false);
    const row = main.querySelector(`[data-line="${list[n - 1].id}"]`);
    press(row);
    (row as HTMLElement | null)?.focus({ preventScroll: true });
  });
  initReveals(page);

  // the settings (reply time, which lines are on) and the viewer, then ?line=N
  const settings = getDoc(doc(db, "sites", SITE_ID, "hotline", "main")).then((s) => {
    const d = s.exists() ? (s.data() as Partial<Settings>) : {};
    if (typeof d.replyTime === "string" && d.replyTime.trim()) M.settings.replyTime = d.replyTime.trim();
    if (d.lines && typeof d.lines === "object") M.settings.lines = d.lines;
  }, () => { /* defaults */ }).then(() => {
    const st = page.querySelector("[data-hb-status]");
    if (st) st.textContent = open().length ? `Lines open. Replies in about ${M.settings.replyTime}.` : "Lines closed right now. Email still works.";
  });
  // the menu draws as soon as the settings are in (as a visitor until sign-in settles; Firebase can take a moment)
  void settings.then(() => {
    M.ready = true;
    const n = Number(new URLSearchParams(location.search).get("line"));
    const l = LINES.find((x) => x.key === n);
    if (l && open().some((x) => x.id === l.id)) M.pick = l.id;
    render();
    if (M.pick) main.scrollIntoView({ block: "start" });
  });
  onAuth((s) => {
    if (s.status === "loading") return;
    const was = `${member()}|${adult()}|${asked()}`;
    M.auth = s;
    // signing in or out swaps the sender block (and Business for under-18s): redraw, keeping what's typed
    if (M.ready && was !== `${member()}|${adult()}|${asked()}` && M.state === "form" && !M.sending) keep(render);
  });
}
