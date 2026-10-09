// /admin: the Cloud Stash card (docs/specs/cloud-stash.md §8): this month's usage as a small meter with its status badge, the loose-ends count, and a door to /admin/stash. Display only:
// the rules decide who reads. Preview (non-production, signed out, ?as=admin) uses the sample data. A read that fails shows a plain "Couldn't read" line, never a broken card.
import { whenReady } from "../../lib/auth";
import { isAdmin, isPreview, preview } from "../stash/gate";
import { USAGE_STATUS, type UsageStatus } from "../stash/status";
import { esc, badge, ago } from "../stash/ui";

const card = document.querySelector<HTMLElement>("[data-stash-card]");

async function read(): Promise<{ status: UsageStatus; pct: number | null; limit: number | null; at: number; loose: number } | null> {
  if (isPreview()) {
    const p = preview(), q = new URLSearchParams(location.search).get("usage");
    const u = p.usage[q === "paused" || q === "over" ? q : "healthy"];
    return { status: u.status, pct: u.credits.pct, limit: u.credits.limit, at: Date.now() - u.fetchedAtAgo, loose: p.scan.counts.orphan + p.scan.counts.stale + p.scan.counts.untracked };
  }
  const { loadSnapshot } = await import("../stash/data");
  const s = await loadSnapshot();
  const c = s.scan?.counts;
  return s.usage ? { status: s.usage.status, pct: s.usage.credits.pct, limit: s.usage.credits.limit, at: s.usage.fetchedAt, loose: c ? c.orphan + c.stale + c.untracked : 0 } : null;
}

whenReady().then(async (s) => {
  if (!card || !isAdmin(s)) return;
  const body = card.querySelector<HTMLElement>("[data-stash-body]")!;
  try {
    const r = await read();
    if (!r) { body.innerHTML = '<p class="bt-meta">No usage numbers yet. Open Cloud Stash and press Refresh.</p>'; }
    else {
      const m = USAGE_STATUS[r.status], pct = r.pct == null ? 0 : Math.min(100, r.pct);
      body.innerHTML = `<div class="cs-mini"><div class="bt-meter bt-meter--${m.meter}"><div class="bt-meter-track" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="Cloudinary credits used this month"><div class="bt-meter-fill" style="width:${pct}%"></div></div></div>${badge(m.badge, m.label)}</div>
        <p class="bt-meta">${r.pct == null ? "No percentage yet" : `${Math.round(r.pct)}% of this month's ${r.limit ? `${r.limit} credits` : "credits"}`} · from Cloudinary ${esc(ago(r.at))}${r.loose ? ` · ${r.loose} loose ${r.loose === 1 ? "end" : "ends"}` : ""}</p>`;
    }
  } catch (err) {
    console.warn("stash card: couldn't read the usage", err);
    body.innerHTML = '<p class="bt-meta">Couldn\'t read the usage. Open Cloud Stash.</p>';
  }
  card.hidden = false;
});
