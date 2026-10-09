// /admin: the Bug Zapper card (docs/specs/bug-zapper.md §7): how many new (Open) reports wait for a look, a red "N critical" badge when any is critical, the oldest one, and a door to the
// board ("No reports waiting" when it's clear). Display only: the rules and callables decide who reads and acts. Reads the Open reports with a single-field filter (no index) and counts
// the visible ones here (staff read hidden and private ones too; hidden ones don't count). Preview (non-production, signed out, ?as=admin) uses the sample data.
import { whenReady } from "../../lib/auth";
import { db, collection, getDocs, query, where, limit, SITE_ID } from "../../lib/db";
import { isAdmin, isPreview, preview } from "../bugs/gate";
import { esc, ago, sevBadge } from "../bugs/ui";
import type { Severity } from "../bugs/status";

const card = document.querySelector<HTMLElement>("[data-bugs-card]");

interface Waiting { title: string; severity: Severity; createdAt: number }
async function waiting(): Promise<Waiting[]> {
  const ms = (v: any): number => (v == null ? 0 : typeof v === "number" ? v : v.toMillis?.() ?? 0);
  if (isPreview()) return (preview().reports as any[]).filter((r) => r.status === "open" && !r.hidden).map((r) => ({ title: r.title, severity: r.severity, createdAt: r.createdAt }));
  const snap = await getDocs(query(collection(db, "sites", SITE_ID, "bugs", "main", "reports"), where("status", "==", "open"), limit(100)));
  return snap.docs.map((d) => d.data()).filter((r: any) => r.hidden !== true).map((r: any) => ({ title: r.title || "", severity: r.severity || "minor", createdAt: ms(r.createdAt) }));
}

whenReady().then(async (s) => {
  if (!card || !isAdmin(s)) return;
  const set = (sel: string, html: string) => { card.querySelector<HTMLElement>(sel)!.innerHTML = html; };
  try {
    const list = (await waiting()).sort((a, b) => a.createdAt - b.createdAt);
    const n = list.length, crit = list.filter((r) => r.severity === "critical").length;
    card.querySelector<HTMLElement>("[data-bugs-body]")!.hidden = !n;
    card.querySelector<HTMLElement>("[data-bugs-clear]")!.hidden = n > 0;
    set("[data-bugs-n]", String(n));
    set("[data-bugs-what]", n === 1 ? "new report waiting for a look" : "new reports waiting for a look");
    set("[data-bugs-crit]", crit ? `<span class="bt-badge bt-badge--red"><span class="bt-badge-dot"></span>${crit} critical</span>` : "");
    if (n) set("[data-bugs-oldest]", `<div><b>${esc(list[0].title)}</b><span>Oldest · ${esc(ago(list[0].createdAt))}</span></div>${sevBadge(list[0].severity)}`);
    card.hidden = false;
  } catch (err) {
    console.warn("bugs card: couldn't read the reports", err);
    card.querySelector<HTMLElement>("[data-bugs-body]")!.hidden = true;
    card.querySelector<HTMLElement>("[data-bugs-clear]")!.hidden = false;
    set("[data-bugs-clear]", '<p class="bt-empty-title">Couldn\'t count the new reports</p><p>Open the board.</p>');
    card.hidden = false;
  }
});
