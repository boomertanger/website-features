// /prizes/mine (docs/specs/prize-box.md §5; tool page, design-system §8m): a member's own Prize Box. Prizes to claim first (each opens the claim dialog,
// with the days left; a day or less is red), then the entries by contest with their status (sent, accepted, not accepted with the reason, withdrawn,
// received, judged), the mail-in codes with the received tracker, and past wins (codes show once claimed). Empty: the mascot and a link to the open
// contests. Visitors get the lock card (in the page). One read: prizeMine. Preview (non-production): ?sample=1[&mine=empty].
import { onAuth, type AuthState } from "../../lib/auth";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { toast } from "../../../../shared/ui/toast.js";
import { messageFor } from "../../lib/errors";
import { call, sampleAsked, contestHref, dateWord, placeWord, ENTRY_WORD, TYPE_WORD, type Mine, type Win } from "./data";
import { openClaim } from "./claim";


const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const days = (w: Win) => Math.max(0, Math.ceil(((w.claimBy || 0) - Date.now()) / 86400000));
const KIND: Record<Win["kind"], string> = { digital: "A code", storeCode: "A store code", mailed: "Mailed to you", badgeXp: "Badge and XP" };

function init(root: HTMLElement) {
  const host = root.querySelector<HTMLElement>("[data-pz-mine]")!;
  let data: Mine | null = null, loadedFor = "";
  async function load() {
    try { data = await call<Mine>("prizeMine", {}); } catch (err) { host.innerHTML = `<div class="bt-notice">${esc(messageFor(err))}</div>`; return; }
    draw();
  }
  function draw() {
    const d = data!;
    const claims = d.toClaim.length ? `<section aria-labelledby="pz-h-claim"><h2 class="bt-heading" id="pz-h-claim">Prizes to claim</h2><div class="pz-claims">${d.toClaim.map((w) => `<button type="button" class="bt-card pz-claim" data-pz-claim="${esc(w.winnerId)}" data-pulse="claim-prize"><span class="pz-claim-ic" aria-hidden="true">🎁</span><span><b>${esc(w.prizeTitle)}</b><small>${esc(w.contestTitle)}${w.place > 1 ? `, ${placeWord(w.place)} place` : ""} · ${esc(KIND[w.kind])}</small></span><span class="pz-days${days(w) <= 1 ? " is-urgent" : ""}">${days(w)} day${days(w) === 1 ? "" : "s"} left</span></button>`).join("")}</div></section>` : "";
    const entries = d.entries.length ? `<section aria-labelledby="pz-h-entries"><h2 class="bt-heading" id="pz-h-entries">Your entries</h2><div class="pz-rows">${d.entries.map((e) => {
      const st = e.contestStatus === "won" || e.contestStatus === "done" ? (e.status === "rejected" ? "Not accepted" : "Judged") : ENTRY_WORD[e.status] || e.status;
      const tone = e.status === "rejected" ? "red" : e.status === "withdrawn" ? "gray" : st === "Judged" ? "lime" : e.status === "accepted" || e.status === "received" ? "green" : "gold";
      const detail = e.kind === "mail"
        ? `Code <span class="pz-code-sm">${esc(e.code || "")}</span> · ${e.receivedAt ? `envelope received ${esc(dateWord(e.receivedAt))}${e.postmarkedOn ? `, postmarked ${esc(e.postmarkedOn)}` : ""}` : "envelope not here yet"}`
        : `${esc(e.title || (e.kind === "text" ? "Written entry" : "Your drawing"))} · sent ${esc(dateWord(e.createdAt))}`;
      return `<article class="bt-card pz-row"><h3><a href="${contestHref(e)}">${esc(e.contestTitle)}</a></h3><span class="bt-badge bt-badge--${tone}">${esc(st)}</span><p>${esc(TYPE_WORD[e.type])} · ${detail}${e.status === "rejected" && e.rejectReason ? `<br>Why: ${esc(e.rejectReason)}` : ""}</p></article>`;
    }).join("")}</div></section>` : "";
    const past = d.wins.filter((w) => w.status !== "pending");
    const wins = past.length ? `<section aria-labelledby="pz-h-wins"><h2 class="bt-heading" id="pz-h-wins">Past wins</h2><div class="pz-rows">${past.map((w) => `<article class="bt-card pz-row"><h3><a href="${contestHref({ slug: w.contestSlug })}">${esc(w.contestTitle)}</a></h3><span class="bt-badge bt-badge--${w.status === "forfeited" ? "gray" : "lime"}">${w.status === "shipped" ? "Shipped" : w.status === "forfeited" ? "Not claimed" : "Claimed"}</span><p>${esc(w.prizeTitle)}${w.place > 1 ? `, ${placeWord(w.place)} place` : ""} · won ${esc(dateWord(w.at))}${w.code ? `<br>Your code: <span class="pz-code-sm">${esc(w.code)}</span> <button type="button" class="bt-link-btn" data-pz-copy="${esc(w.code)}">Copy</button>` : ""}</p></article>`).join("")}</div></section>` : "";
    host.innerHTML = claims || entries || wins ? claims + entries + wins
      : `<div class="pz-empty">${mascot()}<div><b>Nothing here yet</b><p>Your entries, codes and prizes show up here. Find something to enter on <a href="/prizes#open">the open contests</a>.</p></div></div>`;
  }
  host.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const c = t.closest<HTMLElement>("[data-pz-claim]");
    if (c && data) { const w = data.toClaim.find((x) => x.winnerId === c.dataset.pzClaim); if (w) openClaim(w, { onClaimed: () => void load() }); return; }
    const cp = t.closest<HTMLElement>("[data-pz-copy]");
    if (cp) void navigator.clipboard?.writeText(cp.dataset.pzCopy || "").then(() => toast("Copied."), () => toast("Couldn't copy. Select it and copy instead.", { kind: "error" }));
  });
  const show = (which: "loading" | "visitor" | "page") => root.querySelectorAll<HTMLElement>("[data-pz-when]").forEach((el) => { el.hidden = el.dataset.pzWhen !== which; });
  if (sampleAsked()) { show("page"); void load(); return; }
  onAuth((s: AuthState) => {
    if (s.status === "loading") { show("loading"); return; }
    const signed = !!s.user && (s.status === "verified" || s.status === "unverified");
    if (!signed) { show("visitor"); return; }
    show("page");
    if (loadedFor !== s.user!.uid) { loadedFor = s.user!.uid; void load(); }
  });
}

// started last: every helper above is defined by now
const root = document.getElementById("prize-box-root");
if (root) init(root);
