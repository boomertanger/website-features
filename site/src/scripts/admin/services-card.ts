// /admin: the Service Hub card (docs/specs/service-hub.md §7): New Not for me in the last 7 days and Not tested on this version, from the summary doc
// (one read; the rules let admins only), and a door to /admin/services. Display only. Preview (non-production, signed out, ?as=admin) counts the sample
// rows. A read that fails shows a plain "Couldn't read" line, never a broken card.
import { whenReady } from "../../lib/auth";
import { isPreview, previewApi, realApi } from "../services-admin/data";
import { nope7, untested } from "../services-admin/ui";

const card = document.querySelector<HTMLElement>("[data-services-card]");

whenReady().then(async (s) => {
  const preview = isPreview(!!s.user);
  if (!card || !(preview || s.isAdmin)) return;
  const body = card.querySelector<HTMLElement>("[data-services-body]")!;
  try {
    const { rows } = await (preview ? await previewApi() : await realApi()).load();
    if (!rows.length) body.innerHTML = '<p class="bt-meta">No services yet. Open the Service Hub to sync them from the build.</p>';
    else {
      const nope = rows.reduce((a, r) => a + nope7(r), 0), un = rows.filter(untested).length;
      const stat = (n: number, what: string) => `<div class="bt-stat"><span class="bt-stat-value">${n}</span><span class="bt-stat-unit">${what}</span></div>`;
      body.innerHTML = stat(nope, "new Not for me (7 days)") + stat(un, `not tested on ${un === 1 ? "its" : "their"} current version`) + `<p class="bt-meta">${rows.length} services in the hub.</p>`;
    }
  } catch (err) {
    console.warn("services card: couldn't read the summary", err);
    body.innerHTML = '<p class="bt-meta">Couldn\'t read the services. Open the Service Hub.</p>';
  }
  card.hidden = false;
});
