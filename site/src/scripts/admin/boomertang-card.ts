// /admin: Boomertang's card (docs/specs/boomertang.md §2, §6): owner only. The newest issue ("No. 1 is the newest issue") and the drafts waiting
// on the desk, with a door to /admin/boomertang. Nobody else sees it; the desk's actions go through tangAdmin, which checks on the server.
import { whenReady } from "../../lib/auth";
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import issuesData from "../../data/boomertang/issues.json";
import { isProduction } from "../../lib/env.js";

const card = document.querySelector<HTMLElement>("[data-tang-card]");

whenReady().then(async (s) => {
  if (!card || !s.user || !s.isOwner) return;
  const set = (k: string, v: string) => { const el = card.querySelector<HTMLElement>(`[data-tang-${k}]`); if (el) el.textContent = v; };
  try {
    const base = ["sites", SITE_ID, "tang", "main"] as const;
    const issues = (issuesData as { issues: { id: string; no: number; sample?: boolean }[] }).issues.filter((i) => !i.sample || !isProduction);
    const [main, ...docs] = await Promise.all([getDoc(doc(db, ...base)), ...issues.map((i) => getDoc(doc(db, ...base, "issues", i.id)))]);
    const current = main.exists() ? main.get("currentIssueId") : null;
    const cur = issues.find((i) => i.id === current);
    const drafts = issues.filter((_, k) => docs[k].exists() && docs[k].get("status") !== "published").length;
    set("newest", cur ? `No. ${cur.no}` : "None");
    set("what", cur ? "is the newest issue" : "published yet");
    set("lead", drafts ? `${drafts} issue${drafts === 1 ? "" : "s"} on the desk waiting to be published.` : "No issue in the works. Publish, set who reads what and log editions on the desk.");
  } catch (err) {
    console.warn("boomertang card: couldn't read", err);
    set("newest", "–");
  }
  card.hidden = false;
});
