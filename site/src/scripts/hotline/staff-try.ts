// Chapter 09 of /admin/inbox/how-it-works: "Try it: work a pretend desk" (docs/specs/talk-back.md §10). Four SAMPLE messages, each with its line key and an age
// chip (gold on the oldest still waiting): a quick question, a two-day-old one, obvious spam and a personal matter. Each offers Reply / Done, no reply /
// Mark spam / Owner only. A wrong choice shakes the card (not under reduced motion) and shows a hint; a right one stamps the card (Replied, Done, Spam,
// Owner), moves the .bt-meter progress bar and adds to the tally: it counts up with a floating "+N" and a receipt line per action, worked out with the
// current values (crew/main.inbox through staff-how.ts; spam shows "pending", escalation "±0"). All four handled: Desk clear with the mascot. Start over.
// Nothing is saved or sent: no Firestore reads or writes here.
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { V as DEFAULTS } from "./staff-how-page";
import type { Values } from "./staff-how";
import { factIcon } from "./staff-art";

type Act = "reply" | "close" | "spam" | "escalate";
interface Msg { id: string; line: number; who: string; ageH: number; ageL: string; text: string; ok: Act[]; hints: Partial<Record<Act, string>> }
const MSGS: Msg[] = [
  { id: "a", line: 2, who: "@sample_gamer", ageH: 1, ageL: "1 hour ago", text: "Do Chat Games points count toward my level?", ok: ["reply", "escalate"],
    hints: { close: "It's a question, so it needs a reply. Done, no reply is for thank-yous and duplicates.", spam: "It's a real question. Spam is ads, scams and bots." } },
  { id: "b", line: 3, who: "Sam (sample visitor)", ageH: 50, ageL: "2 days ago", text: "I can't find the Tech Stack page on my phone. Where is it?", ok: ["reply", "escalate"],
    hints: { close: "Sam is still waiting for an answer. Reply, and since it's the oldest, it pays the oldest-first Gear.", spam: "Short and confused isn't spam. Answer it." } },
  { id: "c", line: 1, who: "promo_bot_88", ageH: 5, ageL: "5 hours ago", text: "BIG DISCOUNT on followers!!! click the link below now", ok: ["spam"],
    hints: { reply: "That's spam: a reply never pays and only invites more. Mark it as spam.", close: "Mark it as spam instead: that clears it, and the mark pays if it holds.", escalate: "No need to send Boomertanger spam. Mark it as spam." } },
  { id: "d", line: 1, who: "@sample_quietfan", ageH: 3, ageL: "3 hours ago", text: "Things are really hard at home right now and I don't know who else to tell.", ok: ["escalate"],
    hints: { reply: "This one belongs to Boomertanger: a personal matter. Move it with Owner only.", close: "Never close a personal message without an answer. Move it with Owner only.", spam: "It's real, and personal. Move it with Owner only." } },
];
const ACT: Record<Act, string> = { reply: "Reply", close: "Done, no reply", spam: "Mark spam", escalate: "Owner only" };
const STAMP: Record<Act, [string, string, string]> = { reply: ["Hotline", "Replied", "primary"], close: ["Closed", "Done", "lime"], spam: ["Marked", "Spam", "gray"], escalate: ["Moved", "Owner", ""] };
interface Done { a: Act; g: number; out: string; receipt: string }
let V: Values = { ...DEFAULTS };
let S = { done: {} as Record<string, Done>, hint: {} as Record<string, string>, total: 0, prev: 0, pending: 0, last: null as string | null, lines: [] as [string, string, string][] };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const gearSvg = factIcon("gear", "gold");
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";

/** The oldest message still waiting (not handled yet). */
const oldestOpen = () => MSGS.filter((m) => !S.done[m.id]).sort((x, y) => y.ageH - x.ageH)[0]?.id;
function act(m: Msg, a: Act) {
  if (!m.ok.includes(a)) { S.hint[m.id] = m.hints[a] || "Not quite. Try another choice."; S.last = null; return false; }
  const oldest = oldestOpen() === m.id;
  let g = 0, out = "", receipt = "";
  if (a === "reply") {
    const parts = [`${V.reply} reply`]; g = V.reply;
    if (m.ageH <= V.fastHours) { g += V.fast; parts.push(`${V.fast} fast`); }
    if (oldest) { g += V.oldest; parts.push(`${V.oldest} oldest first`); }
    out = `${parts.join(" + ")}.${m.ageH > V.fastHours ? ` Over ${V.fastHours} hours old, so no fast bonus.` : ""}`; receipt = `+${g}`;
  }
  if (a === "close") { g = oldest ? V.oldest : 0; out = oldest ? "Oldest first." : "Closing pays only when it's the oldest waiting."; receipt = `+${g}`; }
  if (a === "spam") { S.pending += V.spam; out = `${V.spam} Gear pending: it pays in ${V.spamHoldDays} days if it stays spam.`; receipt = "pending"; }
  if (a === "escalate") { out = m.id === "d" ? "Neutral: no Gears gained or lost. It's with Boomertanger now." : "Neutral: no Gears either way. It was yours to answer, but escalating never costs you."; receipt = "±0"; }
  S.prev = S.total; S.total += g; S.done[m.id] = { a, g, out, receipt }; delete S.hint[m.id]; S.last = m.id;
  S.lines.push([m.who, ACT[a], receipt]);
  return true;
}

function cardHtml(m: Msg, oldId: string | undefined) {
  const d = S.done[m.id], hint = S.hint[m.id], st = d && STAMP[d.a];
  const old = !d && m.id === oldId;
  return `<article class="hb-sh-tm${d ? " is-done" : ""}${hint ? " is-hint" : ""}" data-tm="${m.id}" aria-label="Sample message from ${esc(m.who)}">
    <span class="hb-ib-k hb-sh-tm-key" aria-label="Line ${m.line}">${m.line}</span>
    <div class="hb-sh-tm-main">
      <div class="hb-sh-tm-top"><b>${esc(m.who)}</b><span class="bt-tag hb-sh-age${old ? " is-old" : ""}">${esc(m.ageL)}${old ? " · oldest waiting" : ""}</span></div>
      <p>${esc(m.text)}</p>
      ${d ? `<div class="hb-sh-tm-out"><span class="hb-sh-tm-g${d.receipt === "pending" ? " is-pend" : d.receipt === "±0" || d.g === 0 ? " is-zero" : ""}">${d.receipt === "pending" ? "pending" : d.receipt}</span><span>${esc(d.out)}</span></div>`
        : `<div class="hb-sh-tm-acts" role="group" aria-label="Handle this sample message">${(Object.keys(ACT) as Act[]).map((a) => `<button type="button" class="bt-btn bt-btn--sm ${a === "reply" ? "bt-btn--primary" : "bt-btn--secondary"}" data-try="${m.id}:${a}">${ACT[a]}</button>`).join("")}</div>`}
      ${hint ? `<p class="bt-notice bt-notice--warn hb-sh-tm-hint" role="status">${esc(hint)}</p>` : ""}
    </div>
    ${d ? `<span class="hb-sh-tm-stamp">${stampHtml({ kicker: st[0], label: st[1], tone: st[2], size: "sm" })}</span>` : ""}
  </article>`;
}
function tallyHtml() {
  const n = Object.keys(S.done).length, all = n === MSGS.length;
  const lastG = S.last && S.done[S.last] ? S.done[S.last].g : 0;
  return `<div class="hb-sh-tally-head">${gearSvg}<span class="bt-label">Your pretend Gears</span></div>
    <div class="hb-sh-tally-big"><span class="hb-sh-count" data-from="${S.prev}" data-to="${S.total}" aria-live="polite">${S.total}</span>${S.pending ? `<small>+${S.pending} pending</small>` : ""}${lastG ? `<span class="hb-sh-float" aria-hidden="true">+${lastG}</span>` : ""}</div>
    ${S.lines.length ? `<ul class="hb-sh-receipt">${S.lines.map(([w, a, g]) => `<li><span><b>${esc(w)}</b>${esc(a)}</span><b class="${g.startsWith("+") && g !== "+0" ? "pos" : ""}">${esc(g)}</b></li>`).join("")}</ul>` : `<p class="hb-sh-note">Handle a message to see what it would pay.</p>`}
    ${all ? `<div class="hb-sh-clear2">${mascot()}${stampHtml({ kicker: "Desk", label: "Clear", tone: "lime", size: "sm" })}<span>Desk clear. In the real inbox, that's a clear day toward the team bonus.</span></div>` : ""}
    <p class="hb-sh-note">Worked out with the inbox's current values. Pretend only: nothing is saved or sent.</p>
    <button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-try-reset>Start over</button>`;
}
function render(root: HTMLElement) {
  const list = root.querySelector<HTMLElement>("[data-try-list]"), tally = root.querySelector<HTMLElement>("[data-try-tally]");
  if (!list || !tally) return;
  const n = Object.keys(S.done).length, oldId = oldestOpen();
  list.innerHTML = `<div class="bt-meter hb-sh-prog"><span class="bt-label">${n === MSGS.length ? "All four handled" : `${n} of 4 handled`}</span><div class="bt-meter-track" role="progressbar" aria-label="Sample messages handled" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${n}"><span class="bt-meter-fill" style="width:${(n / MSGS.length) * 100}%"></span></div></div>`
    + MSGS.map((m) => cardHtml(m, oldId)).join("");
  tally.innerHTML = tallyHtml();
  const c = tally.querySelector<HTMLElement>(".hb-sh-count");
  if (c && !reduced()) {
    const from = Number(c.dataset.from), to = Number(c.dataset.to);
    if (to !== from) { const t0 = performance.now(); const step = (t: number) => { const k = Math.min(1, (t - t0) / 600); c.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  }
  S.prev = S.total;
}

export function initTryDesk(root: HTMLElement) {
  const box = root.querySelector<HTMLElement>("[data-try]");
  if (!box) return;
  const v0 = (window as any).btInboxValues as Values | undefined; if (v0) V = v0;
  document.addEventListener("hb:values", (e) => { V = (e as CustomEvent<Values>).detail; if (!Object.keys(S.done).length) render(box); });
  box.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-try], [data-try-reset]");
    if (!t) return;
    if (t.hasAttribute("data-try-reset")) { S = { done: {}, hint: {}, total: 0, prev: 0, pending: 0, last: null, lines: [] }; render(box); box.querySelector<HTMLElement>("[data-try] button, [data-try-list] button")?.focus(); return; }
    const [id, a] = (t.dataset.try || "").split(":");
    const m = MSGS.find((x) => x.id === id); if (!m) return;
    const ok = act(m, a as Act);
    render(box);
    const card = box.querySelector<HTMLElement>(`[data-tm="${id}"]`);
    if (!ok && card && !reduced()) { card.classList.remove("is-shake"); void card.offsetWidth; card.classList.add("is-shake"); }
    // keep the keyboard on the desk: the next waiting card's first action, or Start over
    (card?.querySelector<HTMLElement>(".hb-sh-tm-acts button") || box.querySelector<HTMLElement>(".hb-sh-tm-acts button") || box.querySelector<HTMLElement>("[data-try-reset]"))?.focus({ preventScroll: true });
  });
  render(box);
}
