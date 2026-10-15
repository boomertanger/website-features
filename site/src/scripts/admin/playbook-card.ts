// /admin: The Playbook's card (docs/specs/playbook.md §2): owner only. The first read-through's progress ("4 of 10 pages reviewed") or the pages due
// ("3 pages due since Nov 1"), and a door to /admin/playbook. Nobody else sees it (the rules deny the reads anyway). Never shows Playbook text.
import { whenReady } from "../../lib/auth";
import { db, doc, getDoc, getDocs, collection, SITE_ID } from "../../lib/db";

const card = document.querySelector<HTMLElement>("[data-playbook-card]");

whenReady().then(async (s) => {
  if (!card || !s.user || s.status === "needsSignup") return;
  try {
    const site = await getDoc(doc(db, "sites", SITE_ID));
    if (site.get("ownerUid") !== s.user.uid) return;
    const base = ["sites", SITE_ID, "playbook", "main"] as const;
    const [main, state, pages] = await Promise.all([getDoc(doc(db, ...base)), getDoc(doc(db, ...base, "state", "current")), getDocs(collection(db, ...base, "pages"))]);
    const n = card.querySelector<HTMLElement>("[data-pb-n]")!, what = card.querySelector<HTMLElement>("[data-pb-what]")!, lead = card.querySelector<HTMLElement>("[data-pb-lead]")!;
    const R = pages.docs.filter((d) => d.id !== "flags");
    if (!R.length) { n.textContent = "0"; what.textContent = "pages"; lead.textContent = "The Playbook is empty. Run the seed."; }
    else if (!(main.exists() && main.get("firstReadDone"))) {
      const done = R.filter((d) => d.get("lastReviewedAt")).length;
      n.textContent = String(done); what.textContent = `of ${R.length} pages reviewed`; lead.textContent = "Your first read-through. Monthly reviews start once every page is read.";
    } else {
      const due = state.exists() ? Number(state.get("dueCount")) || 0 : 0, since = state.exists() ? state.get("dueSince") : null;
      n.textContent = String(due);
      what.textContent = due === 1 ? "page due" : "pages due";
      lead.textContent = due ? `Due since ${since ? new Date(`${since}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) : "the 1st"}. Copy the review prompt.` : "All caught up. The next review starts on the 1st.";
    }
    card.hidden = false;
  } catch (err) { console.warn("playbook card: couldn't read", err); }
});
