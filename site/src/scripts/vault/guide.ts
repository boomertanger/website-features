// The queue's mod guide (docs/specs/game-vault-how-it-works.md §3, Q1): a "How the queue works" panel above
// the triage deck, staff only. Its text isn't in the repo or this bundle (the repo is public): it's
// sites/{siteId}/staffDocs/vault-guide (mods and admins read it; functions/scripts/seed-staff-doc.js
// writes it). The stored text is shared/staff-doc.js's small format, built here element by element with
// textContent, never as HTML. Open on a staff member's first visit; after they close it, a slim bar with
// "Show guide" (remembered per browser).
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { toBlocks } from "../../../../shared/staff-doc.js";

const KEY = "bt-vault-guide";
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};
type Run = { t: "text" | "b" | "kbd"; v: string };
const runs = (parent: HTMLElement, rs: Run[]) => rs.forEach((r) => parent.append(r.t === "text" ? document.createTextNode(r.v) : el(r.t, "", r.v)));

export async function mountGuide(mount: HTMLElement) {
  let sections: { title: string; body: string }[] = [];
  try {
    const snap = await getDoc(doc(db, "sites", SITE_ID, "staffDocs", "vault-guide"));
    sections = (snap.exists() && Array.isArray(snap.get("sections")) ? snap.get("sections") : []).filter((s: any) => typeof s?.title === "string" && typeof s?.body === "string");
  } catch (err) {
    console.warn("vault: the mod guide didn't load", err);
  }
  mount.replaceChildren();
  if (!sections.length) { mount.hidden = true; return; }

  let open = true;
  try { open = localStorage.getItem(KEY) !== "closed"; } catch { /* storage blocked: open */ }

  const panel = el("section", "vh-guide");
  panel.setAttribute("aria-label", "How the queue works");
  const head = el("div", "vh-guide-head");
  const title = el("b");
  title.append(Object.assign(el("span", "", "📖"), { ariaHidden: "true" }), document.createTextNode("How the queue works"));
  const toggle = el("button", "bt-btn bt-btn--ghost bt-btn--sm");
  toggle.type = "button";
  toggle.setAttribute("aria-controls", "vh-guide-body");
  head.append(title, toggle);

  const body = el("div", "vh-guide-body");
  body.id = "vh-guide-body";
  for (const s of sections) {
    const card = el("div", "vh-guide-card");
    card.append(el("h4", "", s.title));
    for (const b of toBlocks(s.body)) {
      if (b.type === "p") { const p = el("p"); runs(p, b.runs as Run[]); card.append(p); }
      else { const ul = el("ul"); for (const it of b.items as Run[][]) { const li = el("li"); runs(li, it); ul.append(li); } card.append(ul); }
    }
    body.append(card);
  }
  panel.append(head, body);

  const set = (on: boolean, remember = true) => {
    open = on;
    panel.classList.toggle("is-closed", !on);
    body.hidden = !on;
    toggle.textContent = on ? "Hide guide" : "Show guide";
    toggle.setAttribute("aria-expanded", String(on));
    if (remember) { try { localStorage.setItem(KEY, on ? "open" : "closed"); } catch { /* fine */ } }
  };
  toggle.addEventListener("click", () => set(!open));
  set(open, false);
  mount.append(panel);
  mount.hidden = false;
}
