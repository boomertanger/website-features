// The crew strip on the season pass (/shift; docs/specs/fun-factory.md §13e), for mods and admins only (display
// only: the callables check roles). "You're crew · Open the builder · Idea library", plus what needs them: a
// season waiting for review (a Review link for admins; "with an admin" for mods) and additions to a live season
// (admins: "2 additions to approve"; the mod who added one: "Your event is waiting for approval", or sent back
// with a note). Read once through factoryListSeasons after sign-in and cached for five minutes (the builder
// drops the cache when it changes something).
import { onAccess, isCrew } from "./layout";
import * as A from "./api";
import { escapeHtml } from "../../../../shared/ui/dom.js";

const box = document.querySelector<HTMLElement>("[data-ff-crew]");
const KEY = "ff-crew-v1", MAX_AGE = 5 * 60 * 1000;
const esc = (v: unknown) => escapeHtml(String(v ?? ""));
const label = (s: Pick<A.SeasonRow, "number" | "name">) => `Season ${String(s.number ?? 0).padStart(2, "0")}`;

async function seasons(): Promise<A.SeasonRow[]> {
  try {
    const c = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (c && Date.now() - c.at < MAX_AGE) return c.seasons as A.SeasonRow[];
  } catch { /* no cache */ }
  const { seasons } = await A.listSeasons();
  try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), seasons })); } catch { /* not cached */ }
  return seasons;
}

if (box) {
  onAccess(async (s) => {
    if (!isCrew(s)) return;
    const admin = s.isAdmin || s.roles.includes("admin");
    const uid = s.user!.uid;
    let list: A.SeasonRow[] = [];
    try { list = await seasons(); } catch { /* the strip still shows its links */ }
    const notes: string[] = [];
    for (const r of list.filter((x) => x.status === "review")) {
      notes.push(admin
        ? `<span class="ff-crew-note">${esc(label(r))} is waiting for review <a href="/shift/builder?season=${encodeURIComponent(r.id)}">Review</a></span>`
        : `<span class="ff-crew-note">${esc(label(r))} is waiting for review · with an admin</span>`);
    }
    const live = list.filter((x) => x.status === "live");
    if (admin) {
      const waiting = live.flatMap((r) => r.pendingAdditions.filter((p) => p.approval === "pending").map((p) => ({ r, p })));
      if (waiting.length) notes.push(`<span class="ff-crew-note">${waiting.length} ${waiting.length === 1 ? "addition" : "additions"} to approve <a href="/shift/builder?season=${encodeURIComponent(waiting[0].r.id)}">Approve</a></span>`);
    } else {
      for (const r of live) for (const p of r.pendingAdditions.filter((x) => x.addedBy?.uid === uid)) {
        const what = p.cadence === "event" ? "event" : "campaign";
        notes.push(`<span class="ff-crew-note">${p.approval === "changes" ? `Your ${what} was sent back, see the admin's note` : `Your ${what} is waiting for approval`} <a href="/shift/builder?season=${encodeURIComponent(r.id)}">Open</a></span>`);
      }
    }
    box.innerHTML = `<span class="ff-crew-tag">Crew</span><b>You're crew</b><a href="/shift/builder">Open the builder</a><a href="/shift/builder/ideas">Idea library</a>${notes.join("")}`;
    box.hidden = false;
  });
}
