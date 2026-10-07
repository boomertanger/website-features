// /crew/queue (docs/specs/mod-machina.md §10, mockup mod-machina-screens.html "Crew queue"). Watcher and up, admins
// and the owner. Applicants by rank with the vouch tally (the Feature Lab pattern) and who vouched; each mod holds up
// to 3 active vouches. A concern is private: admins and the owner read it, never the applicant or other mods. The
// owner alone sees Approve and Not now (Not now needs a kind note). The server enforces every rule.
import { onAccess } from "./layout";
import { loadCtx, loadVouchCap, act, previewData, esc, ago, fmtDate, DAY_LABEL, DAYS, DEVICE_LABEL, previewNote, emptyState, type Ctx, type Applicant } from "./data";
import { crewCall, CHAT_NAME, CHATS } from "./api";
import { messageFor } from "../../lib/errors";
import { gradeInfo } from "../../../../shared/ui/grade-chip.js";
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";

const FEATURE = "crew";
const root = document.querySelector<HTMLElement>("[data-hq]")!;
const PREF_TEXT: Record<string, string> = { favourite: "Favourite", happy: "Happy to help", ifNeeded: "Only if needed", no: "No" };
type Filter = "all" | "yt" | "new";
let ctx: Ctx, cap = 3, list: Applicant[] = [], filter: Filter = "all";

const ytFit = (a: Applicant) => ["ytLandscape", "ytVertical"].some((c) => a.prefs[c] === "favourite" || a.prefs[c] === "happy");
const isNew = (a: Applicant) => Date.now() - a.createdAt < 7 * 86400000;
const used = () => list.filter((a) => a.vouchedByMe).length;
const tick = (n: number) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"/></svg><span class="bt-tally-count">${n}</span><span class="bt-tally-label">Vouch</span>`;

function details(a: Applicant) {
  const chats = CHATS.map((c) => `<li>${platformIconHtml(c)}<span>${esc(CHAT_NAME[c])}</span><b>${esc(PREF_TEXT[a.prefs[c]] || "No")}</b></li>`).join("");
  const days = DAYS.map((d) => `<span class="bt-tag${a.availability.days.includes(d) ? "" : " hq-off"}">${DAY_LABEL[d]}</span>`).join("");
  return `<details class="hq-more"><summary>Details</summary><div class="hq-more-body">
    <div><span class="bt-label">Chats</span><ul class="hq-prefs">${chats}</ul></div>
    <div><span class="bt-label">Availability</span><div class="hq-days">${days}</div>${a.availability.note ? `<p class="hq-note">${esc(a.availability.note)}</p>` : ""}<span class="bt-label">Device</span><p class="hq-note">${esc(DEVICE_LABEL[a.device] || a.device)}</p></div>
    <div class="hq-more-wide"><span class="bt-label">Why they want to help</span><p class="hq-note">${esc(a.answers.why)}</p>${a.answers.experience ? `<span class="bt-label">Mod experience</span><p class="hq-note">${esc(a.answers.experience)}</p>` : ""}</div>
  </div></details>`;
}

function concerns(a: Applicant) {
  if (!ctx.admin && !ctx.owner) return "";
  const cs = a.concerns || [];
  if (!cs.length) return "";
  return `<details class="hq-concern"><summary>${cs.length} private concern${cs.length === 1 ? "" : "s"}</summary>${cs.map((c) => `<p><b>@${esc(c.byHandle || "someone")}</b> ${esc(c.note)}</p>`).join("")}</details>`;
}

function row(a: Applicant, i: number) {
  const mine = a.vouchedByMe, self = a.uid === ctx.uid;
  const full = !mine && used() >= cap;
  const vouchers = a.vouches.length ? `Vouched by ${a.vouches.map((v) => `<b>@${esc(v.handle || "someone")}</b> <span class="hq-vg">${esc(gradeInfo("mod", v.grade).name)}</span>`).join(", ")}` : "No vouches yet";
  const tally = `<button type="button" class="bt-tally${mine ? " is-active" : ""}" data-vouch="${esc(a.appId)}" aria-pressed="${mine}" ${self || full ? "disabled" : ""} aria-label="${mine ? "Take back your vouch for" : "Vouch for"} @${esc(a.handle || "applicant")}" ${full ? `title="You already hold ${cap} vouches. Take one back to vouch here."` : ""}>${tick(a.vouches.length)}</button>`;
  const side = ctx.owner
    ? `<div class="hq-owner"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-notnow="${esc(a.appId)}">Not now</button><button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-approve="${esc(a.appId)}">Approve</button></div>`
    : "";
  return `<div class="bt-row hq-q" data-app="${esc(a.appId)}">
    <span class="hq-q-rank${(a.rank ?? i + 1) === 1 ? " is-top" : ""}" aria-label="Rank ${a.rank ?? i + 1}">${a.rank ?? i + 1}</span>
    ${tally}
    <div class="bt-row-body">
      <span class="bt-row-title">@${esc(a.handle || "applicant")} ${a.band ? `<span class="bt-badge bt-badge--gray">${esc(a.band)}</span>` : ""}${ytFit(a) ? `<span class="bt-badge bt-badge--gold">YouTube fit</span>` : ""}</span>
      <span class="bt-row-desc">${esc(a.answers.why)}</span>
      <span class="bt-row-meta">${CHATS.filter((c) => a.prefs[c] === "favourite" || a.prefs[c] === "happy").map((c) => platformIconHtml(c)).join("")}<span>·</span><span>${esc(DEVICE_LABEL[a.device] || "")}</span><span>·</span><span>Applied ${esc(ago(a.createdAt))}</span></span>
      <span class="hq-q-vby">${vouchers}</span>
      ${concerns(a)}
      ${details(a)}
    </div>
    <div class="hq-q-side">${side}${self ? "" : `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-concern="${esc(a.appId)}">Add a concern</button>`}</div>
  </div>`;
}

function render() {
  const shown = list.filter((a) => filter === "all" || (filter === "yt" ? ytFit(a) : isNew(a)));
  const chip = (id: Filter, label: string, n: number) => `<button type="button" class="bt-chip bt-chip--small${filter === id ? " is-active" : ""}" data-filter="${id}" aria-pressed="${filter === id}">${label} · ${n}</button>`;
  const dots = Array.from({ length: cap }, (_, i) => `<i class="${i < used() ? "on" : ""}"></i>`).join("");
  root.innerHTML = `${previewNote(ctx)}
    <div class="hq-head"><div><h1 class="bt-title">Crew queue</h1><p class="bt-subtitle">${ctx.owner ? "You make the final call. Concerns are visible only to you and admins." : "Vouch for people you'd trust in chat. The owner makes the final call."}</p></div>${ctx.owner ? `<span class="bt-admin-tag bt-admin-tag--small">Owner view</span>` : ""}</div>
    <div class="hq-qbar">
      <div class="hq-filters">${chip("all", "All", list.length)}${chip("yt", "YouTube fit", list.filter(ytFit).length)}${chip("new", "New this week", list.filter(isNew).length)}</div>
      <span class="hq-vouches" role="status">Your vouches <span class="hq-dots" aria-hidden="true">${dots}</span> ${used()} of ${cap}</span>
    </div>
    ${list.length ? `<div class="bt-list hq-qlist">${shown.map(row).join("") || `<p class="hq-note hq-none">Nobody matches that filter.</p>`}</div>` : `<div class="bt-empty"><p>The queue is empty right now. New applications show up here.</p></div>`}
    <p class="bt-fineprint">Order: vouches (Watcher 1, Warden 2, Sentinel 3) + most-needed chats like YouTube + stream check-ins in the last 30 days. Applicants only see their own band ("Top 5", "In the queue"). ${ctx.admin || ctx.owner ? "" : "A concern you add is private: only admins and the owner can read it."}</p>`;
  root.setAttribute("aria-busy", "false");
}

async function reload() {
  list = ctx.preview ? (previewData().queue as Applicant[]) : (await crewCall<{ queue: Applicant[] }>("crewQueue")).queue;
  render();
}

/** A small dialog with one required note. */
function noteDialog({ title, subtitle, label, hint, submit, onSubmit }: { title: string; subtitle: string; label: string; hint: string; submit: string; onSubmit: (note: string) => Promise<void> }) {
  const m = openModal({ feature: FEATURE, title, content: `${modalHeader(esc(title), esc(subtitle))}
    <form class="hq-form" novalidate><div class="bt-field"><label class="bt-label" for="hq-note">${esc(label)}</label><textarea class="bt-textarea" id="hq-note" maxlength="500" rows="4" required></textarea><span class="bt-fineprint">${esc(hint)}</span></div>
    <p class="bt-error" hidden></p>
    <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--primary">${esc(submit)}</button></div></form>` });
  const form = m.modal.querySelector<HTMLFormElement>("form")!, ta = form.querySelector("textarea")!, err = form.querySelector<HTMLElement>(".bt-error")!, btn = form.querySelector<HTMLButtonElement>("[type=submit]")!;
  ta.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = ta.value.trim();
    if (!note) { ta.setAttribute("aria-invalid", "true"); err.textContent = "Add a few words first."; err.hidden = false; ta.focus(); return; }
    ta.removeAttribute("aria-invalid"); err.hidden = true; btn.disabled = true; btn.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>Saving…`;
    try { await onSubmit(note); m.close(); }
    catch (x) { err.textContent = messageFor(x, "That didn't save. Try again."); err.hidden = false; btn.disabled = false; btn.textContent = submit; }
  });
}

const find = (id: string) => list.find((a) => a.appId === id)!;

root.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  const f = t.closest<HTMLElement>("[data-filter]");
  if (f) { filter = f.dataset.filter as Filter; render(); return; }

  const v = t.closest<HTMLButtonElement>("[data-vouch]");
  if (v && !v.disabled) {
    const a = find(v.dataset.vouch!), mine = a.vouchedByMe;
    v.disabled = true;
    try {
      await act(ctx, mine ? "crewUnvouch" : "crewVouch", { appId: a.appId }, () => {
        a.vouchedByMe = !mine;
        a.vouches = mine ? a.vouches.filter((x) => x.uid !== ctx.uid) : [...a.vouches, { uid: ctx.uid, handle: ctx.handle, grade: ctx.me.crew?.grade || 2 }];
      });
      toast(mine ? "Vouch taken back." : `You vouched for @${a.handle}. Thank you.`);
      await reload();
    } catch (err) { toast(messageFor(err, "That didn't work. Try again."), { kind: "error" }); v.disabled = false; }
    return;
  }

  const c = t.closest<HTMLElement>("[data-concern]");
  if (c) {
    const a = find(c.dataset.concern!);
    noteDialog({
      title: `Add a concern about @${a.handle}`, subtitle: "Only admins and the owner can read this.", label: "What's worrying you?",
      hint: "Private. The applicant and other mods never see it. Stick to what you saw, in a sentence or two.", submit: "Add concern",
      onSubmit: async (note) => { await act(ctx, "crewConcern", { appId: a.appId, note }, () => { (a.concerns ||= []).push({ byHandle: ctx.handle, note }); }); toast("Concern added. Only admins and the owner can see it."); render(); },
    });
    return;
  }

  const ap = t.closest<HTMLElement>("[data-approve]");
  if (ap) {
    const a = find(ap.dataset.approve!);
    await confirmAction({
      feature: FEATURE, title: `Approve @${a.handle}?`, confirmLabel: "Approve", busyLabel: "Approving…", danger: false,
      message: "They become an Initiate, get a welcome message and Academy access, and are added as a Twitch moderator automatically.",
      onConfirm: async () => {
        try { await act(ctx, "crewDecide", { appId: a.appId, decision: "approve" }, () => { list = list.filter((x) => x !== a); previewData().queue = list; }); }
        catch (err) { throw new Error(messageFor(err, "That didn't work. Try again.")); }
        toast(`@${a.handle} is on the crew. Welcome them in!`);
        await reload();
      },
    });
    return;
  }

  const nn = t.closest<HTMLElement>("[data-notnow]");
  if (nn) {
    const a = find(nn.dataset.notnow!);
    noteDialog({
      title: `Not now for @${a.handle}`, subtitle: "They'll see your note and can apply again in 60 days.", label: "A kind note for them",
      hint: "Say what would help, like more time in chat. They read this.", submit: "Send note",
      onSubmit: async (note) => { await act(ctx, "crewDecide", { appId: a.appId, decision: "notNow", note }, () => { list = list.filter((x) => x !== a); previewData().queue = list; }); toast(`Note sent to @${a.handle}.`); await reload(); },
    });
  }
});

onAccess(async (s) => {
  try {
    ctx = await loadCtx(s);
    if (!ctx.watcherPlus) {
      root.innerHTML = emptyState("Queue opens at Watcher", "Once you're a Watcher you can vouch for people who've applied to join the crew. You can see your progress to the next grade on HQ.", `<a class="bt-btn bt-btn--primary" href="/crew/hq">Back to HQ</a>`);
      root.setAttribute("aria-busy", "false");
      return;
    }
    cap = await loadVouchCap(ctx);
    await reload();
  } catch (err) {
    root.innerHTML = emptyState("The queue didn't load", messageFor(err, "Something went wrong. Try again in a moment."), `<a class="bt-btn bt-btn--primary" href="/crew/queue">Reload</a>`);
    root.setAttribute("aria-busy", "false");
  }
});
