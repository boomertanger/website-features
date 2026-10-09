// /admin: the Feature Lab card (docs/specs/feature-lab.md §7): how many new (Submitted) ideas wait for a look, the oldest one, and a door to the
// board. Display only: the rules and callables decide who reads and acts. Reads the Submitted ideas with a single-field filter (no index)
// and counts the visible ones here. Preview (non-production, signed out, ?as=admin) uses the sample data.
import { whenReady } from "../../lib/auth";
import { db, collection, getDocs, query, where, limit, SITE_ID } from "../../lib/db";
import { isAdmin, isPreview, preview } from "../lab/gate";
import { esc, ago } from "../lab/ui";

const card = document.querySelector<HTMLElement>("[data-lab-card]");

async function waiting(): Promise<{ title: string; createdAt: number }[]> {
  const ms = (v: any): number => (v == null ? 0 : typeof v === "number" ? v : v.toMillis?.() ?? 0);
  if (isPreview()) return (preview().ideas as any[]).filter((i) => i.status === "submitted" && !i.hidden).map((i) => ({ title: i.title, createdAt: i.createdAt }));
  const snap = await getDocs(query(collection(db, "sites", SITE_ID, "lab", "main", "ideas"), where("status", "==", "submitted"), limit(100)));
  return snap.docs.map((d) => d.data()).filter((i: any) => i.hidden !== true).map((i: any) => ({ title: i.title || "", createdAt: ms(i.createdAt) }));
}

whenReady().then(async (s) => {
  if (!card || !isAdmin(s)) return;
  try {
    const list = (await waiting()).sort((a, b) => a.createdAt - b.createdAt);
    const n = list.length;
    card.querySelector<HTMLElement>("[data-lab-n]")!.textContent = String(n);
    card.querySelector<HTMLElement>("[data-lab-what]")!.textContent = n === 1 ? "new idea waiting for a look" : "new ideas waiting for a look";
    card.querySelector<HTMLElement>("[data-lab-oldest]")!.innerHTML = n ? `Oldest: "${esc(list[0].title)}", ${esc(ago(list[0].createdAt))}.` : "Nothing waiting. The board is all caught up.";
    card.hidden = false;
  } catch (err) {
    console.warn("lab card: couldn't read the ideas", err);
    card.querySelector<HTMLElement>("[data-lab-n]")!.textContent = "–";
    card.querySelector<HTMLElement>("[data-lab-oldest]")!.textContent = "Couldn't count the new ideas. Open the board.";
    card.hidden = false;
  }
});
