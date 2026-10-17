// /boomertang (docs/specs/boomertang.md §3, §6): the newsstand from Firestore. The newest published issue (tang/main.currentIssueId) takes the
// spread, every other published issue goes on the shelf, newest first, each with this reader's access line (Free for everyone / Free with
// Fan Club / Sub Club first). Drafts never show here. Until Firestore answers (or if it can't), the built page (No. 1) stays as it is.
import issuesData from "../../data/boomertang/issues.json";
import { isProduction } from "../../lib/env.js";
import { spreadHtml, backIssuesHtml } from "../../lib/boomertang/stand.js";
import { loadTang, onReader, accessOf } from "./access";
import { followAccount } from "./mode";

const root = document.getElementById("boomertang-root");
if (root) init(root);

function init(root: HTMLElement) {
  const issues = (issuesData as { issues: any[] }).issues.filter((i) => !i.sample || !isProduction);
  const mascot = root.querySelector<HTMLTemplateElement>("[data-tang-mascot]")?.innerHTML.trim() || "";
  const qr = root.querySelector<HTMLTemplateElement>("[data-tang-qr]")?.innerHTML.trim() || "";
  const spreadEl = root.querySelector<HTMLElement>("[data-tang-spread]")!, backEl = root.querySelector<HTMLElement>("[data-tang-back]")!;
  const tangP = loadTang(issues.map((i) => i.id));

  onReader(async (r) => {
    if (r.state) followAccount(r.state);
    const t = await tangP;
    const published = issues.filter((i) => t.issues[i.id]?.status === "published");
    const current = published.find((i) => i.id === t.currentIssueId) || published.sort((a, b) => (b.vol - a.vol) || (b.no - a.no))[0];
    if (!current) return;   // nothing published yet (production before launch): the built No. 1 stays
    const a = accessOf(current.id, !!current.textInRepo, t, r);
    const eds = t.issues[current.id]?.editions || [];
    const edited = eds[0] ? `Updated ${new Date(`${eds[0].date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : "";
    spreadEl.innerHTML = spreadHtml(current, a, { qr: current.sample ? "" : qr, edited });
    const back = published.filter((i) => i.id !== current.id).sort((x, y) => (y.vol - x.vol) || (y.no - x.no)).map((i) => ({ issue: i, access: accessOf(i.id, !!i.textInRepo, t, r) }));
    backEl.innerHTML = backIssuesHtml(back, { visitor: r.kind === "visitor", mascot });
  });
}
