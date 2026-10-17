// Chat's Verdict (docs/specs/boomertang.md §5, §6 "V1 Ballot cards"): the issue's polls, live. Each card reads its poll (tang/main/polls/{id};
// the rules let whoever can read the issue see it). A member who hasn't voted sees the purple option buttons; after voting, the bars with
// their pick outlined and Change my vote (one vote per poll, changeable while it's open, through tangVote). Visitors see the bars and
// "Join free to vote". A closed poll shows "Final result". The member's own votes come from tangVote { issueId, mine: true } (votes are
// server only).
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { call } from "../../lib/call";
import { toast } from "../../../../shared/ui/toast.js";
import { onReader, type Reader } from "./access";

interface Poll { issueId: string; question: string; options: { id: string; label: string }[]; counts: Record<string, number>; open: boolean; closesAt?: { toMillis(): number } | null; closedAt?: { toMillis(): number } | null }
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function mountVerdict(host: HTMLElement, issueId: string) {
  if (host.dataset.mounted) return;
  host.dataset.mounted = "1";
  const cards = Array.from(host.querySelectorAll<HTMLElement>("[data-poll]"));
  const polls: Record<string, Poll | null> = {};
  let mine: Record<string, string> = {}, reader: Reader | null = null;
  const changing = new Set<string>();

  const loadPolls = Promise.all(cards.map(async (c) => {
    const id = c.dataset.poll!;
    try { const s = await getDoc(doc(db, "sites", SITE_ID, "tang", "main", "polls", id)); polls[id] = s.exists() ? (s.data() as Poll) : null; }
    catch { polls[id] = null; }
  }));

  function paint(card: HTMLElement, justVoted = false) {
    const id = card.dataset.poll!, p = polls[id];
    const bars = card.querySelector<HTMLElement>("[data-poll-bars]")!, foot = card.querySelector<HTMLElement>("[data-poll-foot]")!, state = card.querySelector<HTMLElement>("[data-poll-state]")!;
    if (!p) { state.textContent = "Poll"; foot.innerHTML = '<span class="tg-meta">The results show here once the poll opens.</span>'; return; }
    const open = p.open && !(p.closesAt && p.closesAt.toMillis() < Date.now());
    state.textContent = open ? "Open poll" : "Final result";
    const total = p.options.reduce((n, o) => n + (p.counts?.[o.id] || 0), 0);
    const member = !!reader && reader.signedIn && reader.member;
    const my = mine[id];
    const ballot = open && member && (!my || changing.has(id));
    if (ballot) {
      bars.innerHTML = p.options.map((o) => `<button type="button" class="tg-opt" data-vote="${esc(o.id)}" data-pulse="tang-vote"${my === o.id ? ' aria-describedby="tg-cur-' + esc(id) + '"' : ""}><span>${esc(o.label)}</span><span class="pct">${my === o.id ? "Your vote" : "Vote"}</span></button>`).join("");
    } else {
      const top = Math.max(0, ...p.options.map((o) => p.counts?.[o.id] || 0));
      bars.innerHTML = p.options.map((o) => {
        const n = p.counts?.[o.id] || 0, pct = total ? Math.round((n / total) * 100) : 0;
        return `<div class="tg-opt${total && n === top ? " is-top" : ""}${my === o.id ? " is-mine" : ""}"><span class="fill" style="--w:${pct}%"></span><span>${esc(o.label)}${my === o.id ? " · your vote" : ""}</span><span class="pct">${pct}%</span></div>`;
      }).join("");
      bars.classList.toggle("tg-voted", justVoted);
    }
    const count = `<span class="tg-meta">${total} vote${total === 1 ? "" : "s"}</span>`;
    if (!open) foot.innerHTML = `${count}<span class="tg-meta">${p.closedAt ? `Voting closed ${day(p.closedAt.toMillis())}` : "Voting closed"}</span>`;
    else if (!member) foot.innerHTML = `${count}<button type="button" class="bt-link-btn" data-signin="join" data-signin-title="Join free to vote in Chat's Verdict" data-pulse="tang-join">Join free to vote</button>`;
    else if (my && !changing.has(id)) foot.innerHTML = `${count}<button type="button" class="bt-link-btn" data-change>Change my vote</button>`;
    else foot.innerHTML = `${count}<span class="tg-meta">One vote, change it any time while the poll is open</span>${changing.has(id) ? '<button type="button" class="bt-link-btn" data-keep>Keep my vote</button>' : ""}`;
  }
  const paintAll = () => cards.forEach((c) => paint(c));

  host.addEventListener("click", async (e) => {
    const t = e.target as Element, card = t.closest<HTMLElement>("[data-poll]");
    if (!card) return;
    const id = card.dataset.poll!;
    if (t.closest("[data-change]")) { changing.add(id); paint(card); card.querySelector<HTMLElement>("[data-vote]")?.focus(); return; }
    if (t.closest("[data-keep]")) { changing.delete(id); paint(card); return; }
    const b = t.closest<HTMLButtonElement>("[data-vote]");
    if (!b) return;
    const optionId = b.dataset.vote!, label = b.querySelector("span")?.textContent || "";
    card.querySelectorAll<HTMLButtonElement>("[data-vote]").forEach((x) => { x.disabled = true; });
    try {
      const r = await call<{ counts: Record<string, number>; mine: string }>("tangVote", { pollId: id, optionId });
      polls[id] = { ...polls[id]!, counts: r.counts };
      mine[id] = r.mine; changing.delete(id);
      paint(card, true);
      toast(`Vote saved: ${label}. You can change it while the poll is open.`, { kind: "ok", ms: 4200 });
    } catch (err) {
      const reason = (err as { details?: { reason?: string } })?.details?.reason;
      toast(reason === "closed" ? "Voting just closed on this poll." : reason === "rateLimit" ? "That's a lot of votes. Try again in a little while." : reason === "needsSignup" ? "Finish signing up first, then vote." : "Your vote didn't go through. Try again.", { kind: "info", ms: 5000 });
      paint(card);
    }
  });

  onReader(async (r) => {
    reader = r;
    await loadPolls;
    mine = {};
    if (r.signedIn && r.member) {
      try { mine = (await call<{ votes: Record<string, string> }>("tangVote", { issueId, mine: true })).votes || {}; } catch { mine = {}; }
    }
    paintAll();
  });
}
