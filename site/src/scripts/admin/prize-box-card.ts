// /admin: the Prize Box card (docs/specs/prize-box.md §5 "A card on /admin"): open contests, entries waiting for a review and prizes to ship, and a door to
// /admin/prize-box. Admins only; display only (the rules let admins read contests, entries and winners; the callables decide everything else).
import { whenReady } from "../../lib/auth";
import { db, collection, query, where, getDocs, getCount, SITE_ID } from "../../lib/db";

const card = document.querySelector<HTMLElement>("[data-pb-card]");

whenReady().then(async (s) => {
  if (!card || !s.user || !s.isAdmin) return;
  const base = ["sites", SITE_ID, "prizeBox", "main"] as const;
  const set = (k: string, v: string) => { const el = card.querySelector<HTMLElement>(`[data-pb-${k}]`); if (el) el.textContent = v; };
  try {
    const open = await getDocs(query(collection(db, ...base, "contests"), where("status", "in", ["open", "drawing", "closed", "judging"])));
    let review = 0;
    for (const c of open.docs.filter((d) => d.get("type") === "online")) review += (await getCount(query(collection(db, ...base, "contests", c.id, "entries"), where("status", "==", "submitted")))).data().count;
    const ship = (await getCount(query(collection(db, ...base, "winners"), where("status", "==", "claimed"), where("kind", "==", "mailed")))).data().count;
    set("open", String(open.docs.filter((d) => ["open", "drawing"].includes(d.get("status"))).length));
    set("review", String(review));
    set("ship", String(ship));
  } catch (err) {
    console.warn("prize box card: couldn't count", err);
    ["open", "review", "ship"].forEach((k) => set(k, "–"));
  }
  card.hidden = false;
});
