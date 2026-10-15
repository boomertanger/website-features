// Talk Back, the dialog (docs/specs/talk-back.md §2, §4, §5; mockup docs/design/mockups/talk-back-dialog-inbox.html, picked B2). Loaded on first use by
// talkback-loader.ts, which owns window.btTalkBack. openTalkBack({ serviceId, section?, mode }) opens openModal({ variant: "sheet" }) (a bottom sheet
// at 640px), and resolves { result: "sent" | "answered" | "closed" } when it closes.
//   Header: the W5 icon, "Ask about {Service}" / "Feedback on {Service}", and the context tag "{Area} › {Service} › {Section}" from the manifests
//   (read at build time, as services.json.ts does); the section can be removed, the service can't. A service with no manifest: "Ask about this page".
//   Mode switch (.bt-pills[data-n="3"]): Question · Feedback · Something's broken; the typed text stays.
//   Question / Feedback: the text (5,000 max, counter), BOOMBOT (Question only: from 6 typed characters, up to 2 help entries whose keys appear,
//   as the kit chat with a moment of typing; That answers it = toast, close, contactDeflect once), the sender (visitor name + email, or "Sending as
//   @handle"), Only Boomertanger should read this, Send. contactSend on line 2 ("feedback") with kind, context { serviceId, section, path, title }
//   and boombotShown; Turnstile, the honeypot and clientRef as on /contact (send.ts).
//   Something's broken: Report in Bug Zapper (/bug-zapper?new=1&page=<path>), or Join free for visitors; Send it as feedback instead.
//   Sent: the Hotline stamp, "Got it, thanks!", where the reply lands, Filed under {Service} › {Section}; visitors get the Join free nudge.
//   Other states: sending, too many (retryAt), the check or the send failed (text kept), line 2 switched off. Closing with text typed asks first.
// After a send, document fires bt:talkback-sent { serviceId, kind }.
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { openModal } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { boombotIcon } from "../../../../shared/ui/arcade.js";
import { toast } from "../../../../shared/ui/toast.js";
import { whenReady, onAuth, initialsOf, type AuthState } from "../../lib/auth";
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { call } from "../../lib/call";
import site from "../../data/site.json";
import { hbIcon, icon } from "./art";
import { newRef, turnstileWidget, sendFailure, limitWhen } from "./send";
import "../../styles/hotline-icon.css";
import "../../styles/talkback.css";

export type Mode = "question" | "feedback";
export interface OpenOpts { serviceId?: string; section?: string | null; mode?: string }
export type Result = { result: "sent" | "answered" | "closed" | "off" };
interface Manifest { id: string; name: string; area: string; sections?: Record<string, string>; help?: string | null }
interface Help { id: string; q: string; a: string; keys: string[] }

const MANIFESTS = Object.values(import.meta.glob("../../../../services/*.json", { eager: true, import: "default" })) as Manifest[];
const HELP_FILES = import.meta.glob("../../data/help/*.json", { import: "default" }) as Record<string, () => Promise<Help[]>>;
const SERVICE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/, SECTION_KEY = /^[a-z0-9-]{1,40}$/;
const MAX = 5000;
const VIA_KEY = "bt.hotline.via";   // the landing source /contact keeps for the visit
const FEATURE = "talkback";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const session = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const member = (a: AuthState | null) => !!a && (a.status === "verified" || a.status === "unverified") && !!a.profile;
const SVG = {
  pin: icon("pin"),
  x: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
};
const MODES: [string, string, string][] = [["question", "help2", "Question"], ["feedback", "feedback", "Feedback"], ["broken", "bug", "Something's broken"]];

/** The page this was opened from: the path without the query, hash or trailing slash ("/" stays "/"), as contactSend stores it. */
const pagePath = () => { const p = location.pathname || "/"; return p.length > 1 ? p.replace(/\/+$/, "") || "/" : p; };

/** The help entries whose keys appear in the text (from 6 typed characters), up to 2. */
export function matchHelp(help: Help[] | null, text: string): Help[] {
  const t = text.toLowerCase();
  if (!help || t.trim().length < 6) return [];
  return help.filter((h) => h.keys.some((k) => t.includes(k.toLowerCase()))).slice(0, 2);
}

let busy = false;   // one dialog at a time

export async function openTalkBack(opts: OpenOpts): Promise<Result> {
  if (busy) return { result: "closed" };
  busy = true;
  try { return await run(opts); } finally { busy = false; }
}

async function run(opts: OpenOpts): Promise<Result> {
  const svc = opts.serviceId && SERVICE_ID.test(opts.serviceId) ? MANIFESTS.find((m) => m.id === opts.serviceId) || null : null;
  const serviceId = svc?.id || (opts.serviceId && SERVICE_ID.test(opts.serviceId) ? opts.serviceId : null);
  const S = {
    mode: (opts.mode === "feedback" ? "feedback" : opts.mode === "broken" ? "broken" : "question") as Mode | "broken",
    last: (opts.mode === "feedback" ? "feedback" : "question") as Mode,
    section: opts.section && SECTION_KEY.test(opts.section) && svc?.sections?.[opts.section] ? opts.section : null,
    text: "",
    name: "", email: "", only: false,
    state: "form" as "form" | "sending" | "sent" | "off",
    notice: null as null | { tone: "warn" | "error"; html: string },
    limited: false,
    sent: null as null | { ref: number; email: string | null },
    shown: [] as string[],   // help ids BOOMBOT showed (boombotShown, up to 4)
    deflected: false,
    result: "closed" as Result["result"],
  };
  const settings = { replyTime: "3 days" };
  let auth: AuthState | null = null;
  let help: Help[] | null = null;
  let clientRef = newRef();
  const ts = turnstileWidget((site as { hotline?: { turnstileSiteKey?: string } }).hotline?.turnstileSiteKey, "talkback");

  // the viewer, line 2's switch and the reply time, and this service's help file, before the first draw
  const helpLoad = (() => {
    const file = svc?.help ? svc.help.split("/").pop() : null;
    const key = file ? Object.keys(HELP_FILES).find((k) => k.endsWith(`/${file}`)) : null;
    return key ? HELP_FILES[key]().then((h) => { help = Array.isArray(h) ? h : null; }, () => { help = null; }) : Promise.resolve();
  })();
  const [a] = await Promise.all([
    whenReady(),
    getDoc(doc(db, "sites", SITE_ID, "hotline", "main")).then((s) => {
      const d = (s.exists() ? s.data() : {}) as { replyTime?: unknown; lines?: Record<string, boolean> };
      if (typeof d.replyTime === "string" && d.replyTime.trim()) settings.replyTime = d.replyTime.trim();
      if (d.lines && d.lines.feedback === false) S.state = "off";
    }, () => { /* defaults */ }),
    helpLoad,
  ]);
  auth = a;

  const name = svc?.name || null;
  const where = () => [svc?.area, svc?.name, S.section ? svc?.sections?.[S.section] : null].filter(Boolean).join(" › ");
  const filed = () => [svc?.name, S.section ? svc?.sections?.[S.section] : null].filter(Boolean).join(" › ");
  const titleFor = (m: Mode | "broken") => m === "feedback" ? `Feedback on ${name || "this page"}` : m === "broken" ? `Something broken on ${name || "this page"}?` : `Ask about ${name || "this page"}`;

  /* ---------- markup ---------- */
  const ctxHtml = () => svc ? `<div class="hb-tb-ctx"><span class="bt-tag">${SVG.pin}${esc(where())}${S.section ? `<button type="button" class="hb-tb-unsec" data-unsec aria-label="Remove the section">${SVG.x}</button>` : ""}</span></div>` : "";
  const headHtml = (title: string) => `<div class="hb-tb-head">${hbIcon()}<div><h2 class="bt-modal-title">${esc(title)}</h2>${ctxHtml()}</div><button type="button" class="bt-icon-btn" data-bt-close aria-label="Close">${SVG.x.replace('width="12" height="12"', 'width="16" height="16"')}</button></div>`;
  const modesHtml = () => `<div class="bt-pills bt-pills--mode" data-n="3" role="group" aria-label="What kind of message">${MODES.map(([k, ic, l]) => `<button type="button" class="${S.mode === k ? "is-on" : ""}" aria-pressed="${S.mode === k}" data-mode="${k}">${icon(ic)}${esc(l)}</button>`).join("")}</div>`;
  const bubble = (h: Help, i: number, typing: boolean) => `<div class="bt-chat-a${typing ? " is-thinking" : ""}" data-i="${i}"><span class="bt-chat-av">${boombotIcon(`hb-tb-bb${i}`)}</span><div class="bt-chat-bub"><small>BOOMBOT${i === 0 ? ": this might answer it" : ""}</small><span class="bt-chat-typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="bt-chat-text"><b>${esc(h.q)}</b>${esc(h.a)}</span></div></div>`;
  const helpHtml = (typing: boolean) => {
    if (S.mode !== "question") return "";
    const hits = matchHelp(help, S.text);
    if (!hits.length) return "";
    return `<div class="hb-tb-b2">${hits.map((h, i) => bubble(h, i, typing)).join("")}<div class="hb-tb-acts"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-solved>That answers it</button><span>Not quite? Just send it.</span></div></div>`;
  };
  const senderHtml = () => {
    const lock = S.state === "sending" ? " readonly" : "";
    if (!member(auth)) return `<div class="hb-tb-pair">
      <div class="bt-field" data-f="name"><label class="bt-label" for="hb-tb-name">Your name</label><input class="bt-input" id="hb-tb-name" autocomplete="name" maxlength="80" value="${esc(S.name)}"${lock}><span class="bt-error" data-err>Add your name so we know who's writing.</span></div>
      <div class="bt-field" data-f="email"><label class="bt-label" for="hb-tb-email">Your email, for the reply</label><input class="bt-input" id="hb-tb-email" type="email" autocomplete="email" maxlength="200" value="${esc(S.email)}"${lock}><span class="bt-error" data-err>Add an email so Boomertanger can reply.</span></div></div>`;
    const p = auth!.profile!;
    return `<div class="hb-tb-as"><span class="hb-tb-av" aria-hidden="true">${esc(initialsOf(p))}</span><span>Sending as <b>@${esc(p.handle)}</b>. The reply arrives in your alerts.</span></div>`;
  };
  const formHtml = () => {
    const sending = S.state === "sending";
    const ph = S.mode === "question" ? "What would you like to know?" : "What worked, what didn't, what would you change?";
    const btn = sending ? `<button type="submit" class="bt-btn bt-btn--primary" aria-busy="true" disabled><span class="hb-tb-spin" aria-hidden="true"></span>Sending</button>`
      : `<button type="submit" class="bt-btn bt-btn--primary"${S.limited ? " disabled" : ""}>${S.notice?.tone === "error" ? "Try again" : "Send"}</button>`;
    return `<form class="hb-tb-form" data-form novalidate>
      <div class="bt-field" data-f="body"><textarea class="bt-textarea" id="hb-tb-text" maxlength="${MAX}" placeholder="${ph}" aria-label="${esc(titleFor(S.mode))}" autofocus${sending ? " readonly" : ""}>${esc(S.text)}</textarea><div class="hb-tb-count" data-count>${S.text.length.toLocaleString("en-US")} / 5,000</div><span class="bt-error" data-err>Write a few words first.</span></div>
      <div aria-live="polite" data-help>${helpHtml(false)}</div>
      ${senderHtml()}
      <div class="hb-tb-fax" aria-hidden="true"><label for="hb-tb-fax">Fax number</label><input id="hb-tb-fax" tabindex="-1" autocomplete="off"></div>
      <label class="bt-check"><input type="checkbox" data-only${S.only ? " checked" : ""}${sending ? " disabled" : ""}>Only Boomertanger should read this</label>
      ${S.notice ? `<div class="bt-notice bt-notice--${S.notice.tone}" role="alert">${S.notice.html}</div>` : ""}
      <div class="hb-tb-ts" data-ts></div>
      <div class="hb-tb-foot"><span>Goes to Hotline Boom with this page attached. Protected from spam by Cloudflare.</span>${btn}</div>
    </form>`;
  };
  const zapHtml = () => {
    const back = `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-mode="feedback">Send it as feedback instead</button>`;
    if (!member(auth)) return `<div class="hb-tb-zap"><p><b>Bug Zapper is faster for this, and it needs a free account.</b> It tracks the bug until it's fixed, lets you add a screenshot, and you can watch it get squashed. The page is filled in for you.</p><div class="hb-tb-acts"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-join data-signin="join" data-signin-title="Bug Zapper needs a free account">Join free</button>${back}</div></div>`;
    return `<div class="hb-tb-zap"><p><b>Bug Zapper is faster for this.</b> It tracks the bug until it's fixed, lets you add a screenshot, and you can watch it get squashed. The page is filled in for you.</p><div class="hb-tb-acts"><a class="bt-btn bt-btn--primary bt-btn--sm" href="/bug-zapper?new=1&amp;page=${esc(encodeURIComponent(pagePath()))}" data-zap>${icon("bug")}Report in Bug Zapper</a>${back}</div></div>`;
  };
  const sentHtml = () => {
    const s = S.sent!, vis = !!s.email, f = filed();
    const reply = vis ? `Boomertanger usually replies within <b>${esc(settings.replyTime)}</b>, by email to <b>${esc(s.email!)}</b>.` : `The reply will land in <b>your alerts</b>, usually within ${esc(settings.replyTime)}.`;
    return `<div class="hb-tb"><div class="hb-tb-done" role="status">
      ${stampHtml({ kicker: "Hotline", label: "Sent", sub: `BT-${s.ref}`, tone: "primary" })}
      <h2 class="bt-modal-title" tabindex="-1" data-done>Got it, thanks!</h2>
      <p>${reply}${f ? ` Filed under <b>${esc(f)}</b>.` : ""}</p>
      ${vis ? `<div class="hb-tb-join">${mascot()}<b>Join free and next time the reply lands in your alerts.</b><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-join data-signin="join">Join free</button></div>` : ""}
      <div class="hb-tb-acts"><button type="button" class="bt-btn ${vis ? "bt-btn--secondary" : "bt-btn--primary"}" data-back>Back to the page</button></div>
    </div></div>`;
  };
  const offHtml = () => `<div class="hb-tb">${headHtml(titleFor(S.last))}<div class="bt-empty" role="status">${mascot()}<span class="bt-empty-title">This line is closed right now</span><span>Feedback &amp; questions is switched off for the moment. Email still works: the addresses are on the contact page.</span><div class="hb-tb-acts"><a class="bt-btn bt-btn--secondary bt-btn--sm" href="/contact">Open the contact page</a><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-back>Back to the page</button></div></div></div>`;
  const bodyHtml = () => S.state === "sent" ? sentHtml() : S.state === "off" ? offHtml()
    : `<div class="hb-tb">${headHtml(titleFor(S.mode))}${modesHtml()}${S.mode === "broken" ? zapHtml() : formHtml()}</div>`;

  /* ---------- the dialog ---------- */
  document.dispatchEvent(new CustomEvent("bt:overlay-open", { detail: { source: FEATURE } }));
  let resolveDone: (r: Result) => void = () => {};
  const done = new Promise<Result>((res) => { resolveDone = res; });
  const m = openModal({ variant: "sheet", feature: FEATURE, title: titleFor(S.mode), content: bodyHtml(), onClose: () => { ts.remove(); stopAuth(); resolveDone({ result: S.result }); } } as any);   // modal.js types omit onClose
  const box = m.modal as HTMLElement;
  const draw = (focus?: string) => {
    ts.remove();   // the old widget goes with the old markup (a send in flight keeps its token: ts.keep)
    box.innerHTML = bodyHtml();
    const h = box.querySelector(".bt-modal-title");
    if (h) { h.id = h.id || "hb-tb-title"; box.setAttribute("aria-labelledby", h.id); }
    if (S.state === "form" && S.mode !== "broken") ts.mount(box.querySelector<HTMLElement>("[data-ts]"));
    if (focus) box.querySelector<HTMLElement>(focus)?.focus();
  };
  if (S.state === "form" && S.mode !== "broken") ts.mount(box.querySelector<HTMLElement>("[data-ts]"));
  // signing in or out while it's open (Join free in another tab, say) swaps the sender block, keeping what's typed
  const stopAuth = onAuth((s) => { if (s.status === "loading" || member(s) === member(auth)) return; auth = s; if (S.state === "form") { save(); draw(); } });
  m.setBeforeClose(async () => !S.text.trim() || S.state === "sent" || S.state === "off"
    || confirmAction({ title: "Discard it?", message: "What you wrote won't be kept.", confirmLabel: "Discard", danger: true, feature: FEATURE, onConfirm: async () => {} }));

  /** What's typed, into S (before any redraw). */
  const save = () => {
    const v = (sel: string) => box.querySelector<HTMLInputElement>(sel);
    if (v("#hb-tb-text")) S.text = v("#hb-tb-text")!.value;
    if (v("#hb-tb-name")) S.name = v("#hb-tb-name")!.value;
    if (v("#hb-tb-email")) S.email = v("#hb-tb-email")!.value;
    if (v("[data-only]")) S.only = v("[data-only]")!.checked;
  };

  let helpTimer = 0, sig = "";
  const showHelp = () => {
    const slot = box.querySelector<HTMLElement>("[data-help]");
    if (!slot) return;
    const hits = S.mode === "question" ? matchHelp(help, S.text) : [];
    const next = hits.map((h) => h.id).join(",");
    if (next === sig) return;
    sig = next;
    const typing = !reduced();
    slot.innerHTML = helpHtml(typing);
    hits.forEach((h) => { if (!S.shown.includes(h.id) && S.shown.length < 4) S.shown.push(h.id); });
    if (typing) slot.querySelectorAll<HTMLElement>(".bt-chat-a.is-thinking").forEach((el, i) => setTimeout(() => { el.classList.remove("is-thinking"); el.querySelector(".bt-chat-text")?.classList.add("bt-chat-in"); }, 700 + i * 450));
  };

  box.addEventListener("input", (e) => {
    const t = e.target as HTMLElement;
    t.closest(".bt-field")?.classList.remove("is-bad");
    if (t.id !== "hb-tb-text") return;
    S.text = (t as HTMLTextAreaElement).value;
    const c = box.querySelector<HTMLElement>("[data-count]");
    if (c) c.textContent = `${S.text.length.toLocaleString("en-US")} / 5,000`;
    clearTimeout(helpTimer);
    helpTimer = window.setTimeout(showHelp, 350);
  });
  box.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("button, a");
    if (!t) return;
    if (t.dataset.mode) {
      save();
      const k = t.dataset.mode as Mode | "broken";
      if (k !== "broken") S.last = k;
      if (k !== S.mode) { S.mode = k; sig = ""; draw(k === "broken" ? "[data-mode='broken']" : "#hb-tb-text"); showHelp(); }
      return;
    }
    if (t.hasAttribute("data-unsec")) { save(); S.section = null; draw(".hb-tb-ctx .bt-tag"); sig = ""; showHelp(); return; }
    if (t.hasAttribute("data-solved")) {
      S.result = "answered";
      if (!S.deflected && serviceId && S.shown[0]) { S.deflected = true; void call("contactDeflect", { serviceId, answerId: S.shown[0] }).catch(() => { /* a count, never worth an error */ }); }
      toast("Glad BOOMBOT could help. Nothing was sent.");
      m.close();
      return;
    }
    if (t.hasAttribute("data-join")) { m.close(); return; }   // the account script opens the sign-in dialog from data-signin
    if (t.hasAttribute("data-zap")) { m.close(); return; }
    if (t.hasAttribute("data-back")) { m.close(); return; }
  });
  box.addEventListener("submit", (e) => { e.preventDefault(); void send(); });

  async function send() {
    if (S.state === "sending" || S.limited) return;
    save();
    const f = box.querySelector<HTMLFormElement>("[data-form]");
    if (!f) return;
    f.querySelectorAll(".is-bad").forEach((x) => x.classList.remove("is-bad"));
    const bad: string[] = [];
    const isMember = member(auth);
    if (!isMember) {
      if (!S.name.trim()) bad.push("name");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(S.email.trim())) {
        bad.push("email");
        const err = f.querySelector<HTMLElement>(`[data-f="email"] [data-err]`);
        if (err) err.textContent = S.email.trim() ? "That email doesn't look right." : "Add an email so Boomertanger can reply.";
      }
    }
    if (!S.text.trim()) bad.unshift("body");
    if (bad.length) {
      bad.forEach((k) => f.querySelector(`[data-f="${k}"]`)?.classList.add("is-bad"));
      f.querySelector<HTMLElement>(`[data-f="${bad[0]}"] :is(input, textarea)`)?.focus();
      return;
    }
    const hp = box.querySelector<HTMLInputElement>("#hb-tb-fax")?.value || "";
    S.state = "sending"; S.notice = null;
    const token = ts.current;
    draw(); ts.keep(token);
    try {
      const turnstile = await ts.token();
      const kind: Mode = S.mode === "feedback" ? "feedback" : "question";
      const res = await call<{ ref: number }>("contactSend", {
        line: "feedback", body: S.text.trim(), fields: {},
        name: isMember ? undefined : S.name.trim(), email: isMember ? undefined : S.email.trim(),
        source: null, onlyOwner: S.only, turnstile, clientRef, via: session(VIA_KEY) || null, hp, askedSource: false,
        kind,
        context: serviceId ? { serviceId, section: S.section, path: pagePath(), title: document.title.slice(0, 120) } : null,
        boombotShown: kind === "question" && S.shown.length ? S.shown.slice(0, 4) : null,
      });
      S.sent = { ref: res.ref, email: isMember ? null : S.email.trim() };
      S.state = "sent"; S.result = "sent"; S.text = ""; clientRef = newRef();
      ts.remove();
      draw("[data-done]");
      document.dispatchEvent(new CustomEvent("bt:talkback-sent", { detail: { serviceId, kind } }));
    } catch (err) {
      const why = sendFailure(err, "Couldn't send. Your message is still here; check your connection and try again.");
      S.state = "form";
      if (why.kind === "line-off") { S.state = "off"; draw(); return; }
      if (why.kind === "limit") {
        const when = limitWhen(why.retryAt);
        S.limited = true;
        S.notice = { tone: "warn", html: `${isMember ? "You've sent a lot of messages today." : "You've sent a lot of messages in the last hour."}${when ? ` You can send another after <b>${esc(when)}</b>.` : " Try again later."} Your message is still here.` };
        draw();
        return;
      }
      if (why.kind === "field" && ["name", "email", "body"].includes(why.field)) {
        draw();
        const fb = box.querySelector<HTMLElement>(`[data-f="${why.field}"]`);
        if (fb) { fb.classList.add("is-bad"); const er = fb.querySelector<HTMLElement>("[data-err]"); if (er) er.textContent = why.message; fb.querySelector<HTMLElement>("input, textarea")?.focus(); }
        ts.reset();
        return;
      }
      S.notice = { tone: "error", html: esc(why.message) };
      draw("[type=submit]");
      ts.reset();
    }
  }

  return done;
}
