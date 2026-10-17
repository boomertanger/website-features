// A contest page, /prizes/<contest> (docs/specs/prize-box.md §5; mockup prize-box-wheel-and-draw.html section 3): served by /prizes/view/ for every
// /prizes/:slug (site/public/_redirects), which reads the slug from the address. The hero header with the small box scene, status and type badges;
// the entry card in its state (a visitor's lock card that opens Join; not eligible with the reason; open: the upload dropzone, a written entry or
// the mail-in code; entered, with Replace and Withdraw; the code with the mailing address and the received tracker; judging; winners); How it works,
// the rules in short, the prizes, the time left (.bt-mini-cd) and the entry count. A winner's claim dialog opens here (openModal) for ?claim=1.
// Data: the contest (Firestore Lite, public once out of draft), prizeMine { contestId } (eligibility, the entry, the code, the address, wins),
// and the entry callables. Preview (non-production): ?sample=1&entry=open|entered|code|noteligible.
import { onAuth, type AuthState } from "../../lib/auth";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { toast } from "../../../../shared/ui/toast.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { messageFor, reasonOf } from "../../lib/errors";
import { call, loadContest, STATUS, TYPE_WORD, METHOD_WORD, ENTRY_WORD, BEAT_WORD, miniCd, dateWord, dateTimeWord, placeWord, contestHref, sampleAsked, type Contest, type ContestMine } from "./data";
import { openClaim } from "./claim";


const slugFromUrl = () => { const parts = location.pathname.split("/").filter(Boolean); return parts[0] === "prizes" && parts[1] && parts[1] !== "view" ? decodeURIComponent(parts[1]) : new URLSearchParams(location.search).get("c") || (sampleAsked() ? "draw-boomers-nightmare" : ""); };
const mascotSvg = () => { const t = document.getElementById("bt-mascot-tpl") as HTMLTemplateElement | null; const s = t && t.content.querySelector("svg"); return s ? s.innerHTML : ""; };
const scene = () => `<svg class="pz-scene" viewBox="0 0 320 220" role="img" aria-label="The Prize Box, with the mascot peeking out"><defs><linearGradient id="pzBeam" x1="0" y1="1" x2="0" y2="0"><stop class="beam-a" offset="0"/><stop class="beam-b" offset="1"/></linearGradient></defs>
  <ellipse class="pz-floor" cx="160" cy="204" rx="120" ry="10"/><path class="pz-beams" d="M84 112 L40 0 L280 0 L246 112 Z" fill="url(#pzBeam)"/>
  <g class="bt-mascot pz-mas" transform="translate(108 34) scale(0.5)">${mascotSvg()}</g>
  <rect class="wood" x="72" y="112" width="176" height="88" rx="4"/><path class="slat" d="M72 141 H248 M72 170 H248"/><path class="ribbon" d="M150 112 V200 M170 112 V200"/>
  <path class="brass" d="M72 112 h16 v16 M248 112 h-16 v16 M72 200 h16 v-16 M248 200 h-16 v-16"/>
  <g class="pz-lid"><rect class="wood" x="66" y="92" width="188" height="22" rx="3"/><path class="ribbon" d="M150 92 V114 M170 92 V114"/><path class="ribbon" d="M160 92 c-14 -18 -30 -10 -18 0 M160 92 c14 -18 30 -10 18 0"/></g>
  <circle class="pz-spark" style="--d:0s" cx="64" cy="60" r="3"/><circle class="pz-spark" style="--d:.8s" cx="262" cy="46" r="2.5"/><circle class="pz-spark" style="--d:1.5s" cx="230" cy="88" r="2"/><circle class="pz-spark" style="--d:.4s" cx="96" cy="22" r="2"/></svg>`;
const card = (title: string, body: string, extra = "") => `<div class="bt-card"${extra}><h2 class="bt-card-title">${title}</h2>${body}</div>`;
const rulesLink = (c: Contest) => `<a class="bt-btn bt-btn--ghost" href="${contestHref(c)}/rules">Read the official rules</a>`;

async function init(root: HTMLElement) {
  const host = root.querySelector<HTMLElement>("[data-pz-contest]")!;
  const slug = slugFromUrl();
  let c: Contest | null = null;
  try { c = slug ? await loadContest(slug) : null; } catch { c = null; }
  if (!c) { host.innerHTML = `<div class="pz-empty" style="margin:28px var(--bt-gutter)">${document.getElementById("bt-mascot-tpl")?.innerHTML ?? ""}<div><b>This contest isn't here</b><p>It may have ended or moved. <a href="/prizes">See every contest</a>.</p></div></div>`; return; }
  const contest = c;
  document.title = `${contest.title} · Prize Box`;
  let auth: AuthState | null = null, mine: ContestMine | null = null, busy = false;
  const draw = () => { host.innerHTML = pageHtml(contest, auth, mine); bind(); };

  async function refresh() {
    const signed = !!auth && (auth.status === "verified" || auth.status === "unverified" || sampleAsked());
    if (signed && contest.type !== "live") { try { mine = await call<ContestMine>("prizeMine", { contestId: contest.id }); } catch { mine = null; } }
    else mine = null;
    draw();
    if (new URLSearchParams(location.search).get("claim") === "1" && mine) { const w = mine.wins.find((x) => x.status === "pending"); if (w) openClaim(w, { onClaimed: () => void refresh() }); }
  }
  onAuth((s) => { if (s.status === "loading") return; const k = `${s.status}|${s.user?.uid || ""}`; if (auth && `${auth.status}|${auth.user?.uid || ""}` === k) return; auth = s; void refresh(); });
  if (sampleAsked() && !auth) { auth = { status: "verified" } as AuthState; void refresh(); }
  draw();

  function bind() {
    // the countdown ticks every 30 s
    const cd = host.querySelector<HTMLElement>("[data-pz-cd]");
    if (cd) window.setInterval(() => { cd.innerHTML = miniCd(contest.closesAt); }, 30000);
    // online: the dropzone, then prizeEntryParams → Cloudinary → prizeEnter
    const dz = host.querySelector<HTMLButtonElement>("[data-pz-drop]"), fileIn = host.querySelector<HTMLInputElement>("[data-pz-file]");
    let file: File | null = null;
    const pick = (f: File | null) => {
      if (!f || !dz) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { toast("Use a JPG, PNG or WebP file.", { kind: "error" }); return; }
      if (f.size > 10 * 1024 * 1024) { toast("That file is over 10 MB. Try a smaller one.", { kind: "error" }); return; }
      file = f; dz.innerHTML = `<span><b>${esc(f.name)}</b> is ready</span><span class="bt-hint">Click to pick another file.</span>`; dz.classList.add("is-ready");
    };
    dz?.addEventListener("click", () => fileIn?.click());
    fileIn?.addEventListener("change", () => pick(fileIn.files && fileIn.files[0]));
    dz?.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("is-over"); });
    dz?.addEventListener("dragleave", () => dz.classList.remove("is-over"));
    dz?.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("is-over"); pick(e.dataTransfer?.files?.[0] || null); });
    host.querySelector<HTMLFormElement>("[data-pz-enter]")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return;
      const f = e.currentTarget as HTMLFormElement, fd = new FormData(f), btn = f.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      const rulesOk = fd.get("rulesOk") === "on", showIfWin = fd.get("showIfWin") === "on";
      if (!rulesOk) { toast("Tick that you've read the official rules.", { kind: "error" }); return; }
      busy = true; btn.disabled = true; btn.textContent = "Sending…";
      try {
        if (contest.entryKind === "text") await call("prizeEnter", { contestId: contest.id, text: fd.get("text"), title: fd.get("title"), rulesOk, showIfWin });
        else {
          if (!file) throw Object.assign(new Error("Add your drawing first."), { details: { reason: "file" } });
          if (!sampleAsked()) {
            const p = await call<{ publicId: string; uploadUrl: string; fields: Record<string, string | number> }>("prizeEntryParams", { contestId: contest.id });
            const form = new FormData(); Object.entries(p.fields).forEach(([k, v]) => form.append(k, String(v))); form.append("file", file);
            const up = await fetch(p.uploadUrl, { method: "POST", body: form });
            if (!up.ok) throw new Error(`The upload failed (${up.status}). Try again.`);
            await call("prizeEnter", { contestId: contest.id, publicId: p.publicId, title: fd.get("title"), rulesOk, showIfWin });
          }
        }
        toast(mine && mine.entry && mine.entry.status !== "withdrawn" ? "Your entry was replaced." : "You're entered. Good luck!");
        await refresh();
        host.querySelector(".pz-entered-stamp")?.classList.add("is-new");
      } catch (err) {
        toast(reasonOf(err) === "uploadsPaused" ? "Uploads are paused for a bit. Try again later." : (err as Error).message && !reasonOf(err) ? (err as Error).message : messageFor(err), { kind: "error" });
      } finally { busy = false; }
    });
    host.querySelector("[data-pz-replace]")?.addEventListener("click", () => { if (mine && mine.entry) { mine = { ...mine, entry: { ...mine.entry, status: "replacing" } as any }; draw(); } });
    host.querySelector("[data-pz-withdraw]")?.addEventListener("click", async () => {
      const ok = await confirmAction({ feature: "prize-box", title: "Withdraw your entry?", message: "Your entry and its file are removed. You can enter again while the contest is open.", confirmLabel: "Withdraw", danger: true });
      if (!ok) return;
      try { await call("prizeWithdraw", { contestId: contest.id }); toast("Your entry was withdrawn."); await refresh(); } catch (err) { toast(messageFor(err), { kind: "error" }); }
    });
    host.querySelector<HTMLFormElement>("[data-pz-getcode]")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget as HTMLFormElement);
      if (fd.get("rulesOk") !== "on") { toast("Tick that you've read the official rules.", { kind: "error" }); return; }
      try { await call("prizeGetCode", { contestId: contest.id, rulesOk: true, showIfWin: fd.get("showIfWin") === "on" }); toast("Here's your entry code."); await refresh(); } catch (err) { toast(messageFor(err), { kind: "error" }); }
    });
    host.querySelector("[data-pz-copy]")?.addEventListener("click", (e) => { const code = (e.currentTarget as HTMLElement).dataset.code || ""; void navigator.clipboard?.writeText(code).then(() => toast("Copied."), () => toast("Couldn't copy. Select it and copy instead.", { kind: "error" })); });
    host.querySelector("[data-pz-view]")?.addEventListener("click", async () => {
      try { const r = await call<{ url: string }>("prizeEntryUrl", { contestId: contest.id }); window.open(r.url, "_blank", "noopener"); } catch (err) { toast(messageFor(err), { kind: "error" }); }
    });
    host.querySelector("[data-pz-claim]")?.addEventListener("click", () => { const w = mine && mine.wins.find((x) => x.status === "pending"); if (w) openClaim(w, { onClaimed: () => void refresh() }); });
  }
}

function entryCard(c: Contest, auth: AuthState | null, mine: ContestMine | null): string {
  const visitor = !auth || (auth.status !== "verified" && auth.status !== "unverified" && auth.status !== "needsSignup" && !sampleAsked());
  if (c.type === "live") {
    return card("How to enter", `<p>There's nothing to fill in: everyone checked in to the stream is in the draw${c.beat ? ` at ${esc(BEAT_WORD[c.beat] || "a break")}` : ""}. Check in when the window opens, and watch for the Prize Wheel.</p><div class="pz-actions"><a class="bt-btn bt-btn--primary" href="/schedule" data-pulse="pb-schedule">See the schedule</a><a class="bt-btn bt-btn--secondary" href="/live">Watch live</a></div>`);
  }
  if (visitor) return `<div class="bt-lock-card"><span class="bt-lock-card-ic" aria-hidden="true">🎁</span><div><b>Join free to enter</b><p>Members enter contests and win prizes. Joining takes about a minute.</p></div><button type="button" class="bt-btn bt-btn--primary" data-signin="join" data-signin-title="Join free to enter contests" data-pulse="pb-join">Join free</button></div>`;
  if (auth && auth.status === "needsSignup") return `<div class="bt-lock-card"><span class="bt-lock-card-ic" aria-hidden="true">🎁</span><div><b>Finish joining to enter</b><p>You're nearly there.</p></div><button type="button" class="bt-btn bt-btn--primary" data-signin="signup">Finish joining</button></div>`;
  const e = mine && mine.entry && mine.entry.status !== "withdrawn" ? mine.entry : null;
  const win = mine && mine.wins.find((w) => w.status === "pending");
  if (win) return card("You won!", `${stampHtml({ label: "Winner", tone: "lime", size: "sm" })}<p><b>${esc(win.prizeTitle)}</b>${win.place > 1 ? ` (${placeWord(win.place)} place)` : ""}. Claim it within ${Math.max(0, Math.ceil(((win.claimBy || 0) - Date.now()) / 86400000))} days.</p><div class="pz-actions"><button type="button" class="bt-btn bt-btn--primary" data-pz-claim data-pulse="claim-prize">Claim my prize</button></div>`);
  if (["judging", "closed", "drawing"].includes(c.status)) {
    return `<div class="bt-notice"><b>Entries are closed.</b> ${c.method === "judge" ? "Boomer is judging now." : "The winner is drawn soon."} Winners are posted here.</div>` + (e ? card("Your entry", `<p>${e.kind === "mail" ? (e.receivedAt ? `Received ${esc(dateWord(e.receivedAt))}${e.postmarkedOn ? `, postmarked ${esc(e.postmarkedOn)}` : ""}.` : "Your envelope hasn't arrived.") : `Sent ${esc(dateWord(e.createdAt))}.`} ${e.status === "rejected" ? `Not accepted: ${esc(e.rejectReason || "")}` : "In the judging."}</p>`) : "");
  }
  if (["won", "done"].includes(c.status)) return "";
  if (c.status !== "open") return card("Not open yet", `<p>Entries open ${esc(dateWord(c.opensAt))}. Come back then.</p>`);
  if (mine && !mine.eligible && !e) return card("You can't enter this one", `<p>${esc(mine.message || "This contest has extra entry rules.")}</p><p class="pz-note">Other contests may be open to you: <a href="/prizes#open">see them all</a>.</p>`);
  const rules = `<label class="bt-check"><input type="checkbox" name="showIfWin" checked> Show my ${c.type === "online" && c.entryKind !== "text" ? "drawing and handle" : "handle"} on the site if I win</label><label class="bt-check"><input type="checkbox" name="rulesOk"> I've read the <a href="${contestHref(c)}/rules" target="_blank" rel="noopener">official rules</a></label>`;
  if (c.type === "mail") {
    if (e && e.code) {
      return card("Your entry by mail", `<div class="pz-code"><strong>${esc(e.code)}</strong><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-pz-copy data-code="${esc(e.code)}">Copy</button><span class="pz-note">Write it on the back of your entry and on the envelope.</span></div>`
        + (mine && mine.mailingAddress ? `<p class="pz-note">Mail it to:</p><address class="pz-addr">${esc(mine.mailingAddress)}</address>` : `<p class="pz-note">The mailing address shows here once Boomer has set it.</p>`)
        + `<ul class="pz-track"><li class="is-done"><i>✓</i>Code created ${esc(dateWord(e.createdAt))}</li><li class="${e.receivedAt ? "is-done" : ""}"><i>${e.receivedAt ? "✓" : ""}</i>${e.receivedAt ? `Envelope received ${esc(dateWord(e.receivedAt))}` : "Envelope received"}</li><li><i></i>Winners picked</li></ul>`
        + `<p class="pz-note">Postmarked by <b>${esc(dateWord(c.closesAt))}</b>. Your name and address never need to be on the entry.</p>${e.receivedAt ? "" : '<div class="pz-actions"><button type="button" class="bt-btn bt-btn--danger bt-btn--sm" data-pz-withdraw>Withdraw my entry</button></div>'}`);
    }
    return card("Enter by mail", `<form data-pz-getcode class="pz-col"><p>Get your entry code, write it on the back of your entry and on the envelope, and mail it postmarked by <b>${esc(dateWord(c.closesAt))}</b>. The code links the entry to your account, so your name and address never need to be on it.</p>${rules}<div class="pz-actions"><button type="submit" class="bt-btn bt-btn--primary" data-pulse="pb-get-code">Get my entry code</button></div></form>`);
  }
  if (e && (e as any).status !== "replacing") {
    const st = ENTRY_WORD[e.status] || e.status;
    return card("Your entry", `<div class="pz-entry-row"><span class="pz-thumb" aria-hidden="true">${e.kind === "upload" ? "🖼️" : "✍️"}</span><div><p><b>${esc(e.title || (e.kind === "text" ? "Your written entry" : "Your drawing"))}</b> · ${esc(st)}</p><p>Sent ${esc(dateWord(e.createdAt))}. You can replace it until ${esc(dateTimeWord(c.closesAt))}.</p>${e.status === "rejected" ? `<p>Not accepted: ${esc(e.rejectReason || "")}</p>` : ""}${e.kind === "text" && e.text ? `<p>${esc(e.text)}</p>` : ""}</div></div>`
      + `<div class="pz-actions">${e.hasFile ? '<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-pz-view>See my file</button>' : ""}<button type="button" class="bt-btn bt-btn--secondary" data-pz-replace>Replace it</button><button type="button" class="bt-btn bt-btn--danger" data-pz-withdraw>Withdraw my entry</button></div>`, ' data-pz-entered');
  }
  if (c.entryKind === "text") {
    return card("Send your entry", `<form data-pz-enter class="pz-col"><div class="bt-field"><label class="bt-label" for="pz-text">Your entry</label><textarea class="bt-input" id="pz-text" name="text" rows="5" maxlength="2000" required></textarea></div><div class="bt-field"><label class="bt-label" for="pz-t">Give it a title (optional)</label><input class="bt-input" id="pz-t" name="title" maxlength="60"></div>${rules}<div class="pz-actions"><button type="submit" class="bt-btn bt-btn--primary" data-pulse="pb-enter">Send my entry</button><span class="pz-note">You can replace it until the deadline.</span></div></form>`);
  }
  return card("Send your entry", `<form data-pz-enter class="pz-col"><button type="button" class="bt-dropzone" data-pz-drop><span><b>Drop your drawing here</b> or choose a file</span><span class="bt-hint">JPG, PNG or WebP, up to 10 MB. Only you and the team see it until the winners are shown.</span></button><input type="file" accept="image/png,image/jpeg,image/webp" data-pz-file hidden>`
    + `<div class="bt-field"><label class="bt-label" for="pz-t">Give it a title (optional)</label><input class="bt-input" id="pz-t" name="title" maxlength="60" placeholder="The Thing Under the Desk"></div>${rules}<div class="pz-actions"><button type="submit" class="bt-btn bt-btn--primary" data-pulse="pb-enter">Send my entry</button><span class="pz-note">You can replace it until the deadline.</span></div></form>`);
}

function pageHtml(c: Contest, auth: AuthState | null, mine: ContestMine | null): string {
  const [tone, word] = STATUS[c.status] || ["gray", c.status];
  const steps = c.type === "live" ? [["Check in", "Check in on stream when the window opens."], ["The wheel", "Boomer spins the Prize Wheel at the break."], ["I'm here", "If it lands on you, tap I'm here within 60 seconds."], ["Claim it", "Winners have 7 days to claim."]]
    : [[c.type === "mail" ? "Mail it" : "Enter", c.type === "mail" ? `Postmarked by ${dateWord(c.closesAt)}, with your code.` : `By ${dateTimeWord(c.closesAt)}.`], [c.method === "judge" ? "Boomer judges" : "The draw", c.method === "judge" ? "His favorites win." : "A random pick from every accepted entry."], ["The reveal", "Winners are shown on stream and posted here."], ["Claim it", "Winners have 7 days to claim."]];
  const prizes = c.prizes.map((p) => `<li><span>${placeWord(p.place)}</span><div><b>${esc(p.title)}</b>${p.kind !== "badgeXp" ? " and the Prize Box Winner badge" : ""}</div></li>`).join("");
  const timeLeft = c.status === "open" && c.closesAt ? card("Time left", `<div class="bt-mini-cd" data-pz-cd>${miniCd(c.closesAt)}</div><p class="pz-note">Closes ${esc(dateTimeWord(c.closesAt))}. Reminders go out 1 day and 1 hour before.</p>`) : "";
  return `<header class="pz-head"><div><a class="pz-crumb" href="/prizes">Prize Box</a><h1 class="bt-title">${esc(c.title)}</h1><p class="pz-head-sub">${esc(c.blurb)}</p>`
    + `<div class="pz-head-tags"><span class="bt-badge bt-badge--${tone}"><span class="bt-badge-dot"></span>${esc(word)}</span><span class="bt-badge">${esc(TYPE_WORD[c.type])}</span><span class="bt-badge">${esc(METHOD_WORD[c.method])}</span></div></div>${scene()}</header>`
    + `<div class="pz-body"><div class="pz-col">${entryCard(c, auth, mine)}`
    + card("How it works", `<ol class="pz-steps">${steps.map(([b, t]) => `<li><b>${esc(b)}</b>${esc(t)}</li>`).join("")}</ol>`)
    + card("The rules in short", `<ul class="pz-list"><li>Free to enter. No purchase needed.</li><li>Members 13 and up. Under 18 needs a parent's or guardian's OK to claim a prize.</li><li>One entry per member.${c.type !== "live" ? " It must be your own work." : ""}</li><li>Crew and admins can't win.</li><li>Prizes that ship go to US addresses only.</li></ul>${rulesLink(c)}`)
    + `</div><aside class="pz-col">${card("Prizes", `<ul class="pz-prizes">${prizes}</ul>`)}${timeLeft}`
    + (c.type !== "live" ? card("Entries", `<p class="pz-note"><span class="pz-big">${c.entries}</span> so far. Entries stay private until the winners are shown.</p>`) : "")
    + `</aside></div>`;
}

// started last: every helper above is defined by now
const root = document.getElementById("prize-box-root");
if (root) void init(root);
