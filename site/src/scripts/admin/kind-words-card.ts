// /admin: the Kind words card (docs/specs/base-camp.md "Kind Words engine", Admin): how many postcards and notes wait for a read across the boards,
// and a door to /admin/kind-words. Admins only; display only (the rules let admins read every card, the callables decide).
import { whenReady } from "../../lib/auth";
import { db, collection, query, where, getCount, SITE_ID } from "../../lib/db";

const card = document.querySelector<HTMLElement>("[data-kw-card]");

whenReady().then(async (s) => {
  if (!card || !s.user || !s.isAdmin) return;
  try {
    const n = (await getCount(query(collection(db, "sites", SITE_ID, "kindWords"), where("status", "==", "pending")))).data().count;
    card.querySelector<HTMLElement>("[data-kw-n]")!.textContent = String(n);
    card.querySelector<HTMLElement>("[data-kw-what]")!.textContent = n === 1 ? "postcard or note waiting for a read" : "postcards and notes waiting for a read";
  } catch (err) {
    console.warn("kind words card: couldn't count", err);
    card.querySelector<HTMLElement>("[data-kw-n]")!.textContent = "–";
  }
  card.hidden = false;
});
