// /services/how-it-works (docs/specs/service-hub.md §8). The shared How it works behaviour (spotlight cards, the journey, BOOMBOT), the flip
// medals, Try it, and the closing line. Try it is a sample service: Like it and Love it light its tile at once; Not for me opens the comment box
// and needs 10 characters; nothing is saved or sent anywhere. The closing line shows a signed-in member's real progress ("You've rated 7 of
// 15 core services") from my/{uid} and public/services; visitors read nothing.
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../shared/ui/flip-card.js";
import { RATE_ICON, RATE_LABEL } from "../../../../shared/ui/rate.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { whenReady } from "../../lib/auth";

const root = document.querySelector<HTMLElement>("[data-svh]");
type Pick = "nope" | "like" | "love";

function initTry(box: HTMLElement) {
  const why = box.querySelector<HTMLElement>("[data-try-why]")!;
  const text = box.querySelector<HTMLTextAreaElement>("[data-try-text]")!;
  const res = box.querySelector<HTMLElement>("[data-try-res]")!;
  const tile = box.querySelector<HTMLElement>("[data-try-tile]")!;
  const badge = tile.querySelector<HTMLElement>("[data-try-badge]")!;
  const q = tile.querySelector<HTMLElement>("[data-try-q]")!;
  const btns = [...box.querySelectorAll<HTMLButtonElement>("[data-rate-v]")];
  const press = (v: Pick | "") => btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.rateV === v)));
  const light = (v: Pick) => {
    tile.classList.add("is-rated");
    tile.dataset.v = v;
    badge.innerHTML = RATE_ICON[v]; badge.hidden = false;
    q.textContent = RATE_LABEL[v];
    const said = v === "love" ? "you love" : v === "like" ? "you like" : "you aren't into";
    res.innerHTML = `<div class="bt-toast sv-try-toast"><span class="bt-toast-ic" aria-hidden="true">✓</span><span class="bt-toast-text">Saved: ${esc(said)} the Bone Library. (Not really, it's a sample.)</span></div>`;
  };
  box.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLButtonElement>("[data-rate-v]");
    if (b) {
      const v = b.dataset.rateV as Pick;
      press(v);
      if (v === "nope") {
        why.hidden = false;
        res.innerHTML = `<span class="bt-meta">Not for me needs a sentence first.</span>`;
        text.focus();
      } else { why.hidden = true; light(v); }
      return;
    }
    if (t.closest("[data-try-save]")) {
      if (text.value.trim().length < 10) {
        text.setAttribute("aria-invalid", "true");
        res.innerHTML = `<span class="bt-meta sv-try-err" role="alert">Add at least 10 characters so Boomer knows what to fix.</span>`;
        text.focus();
        return;
      }
      text.removeAttribute("aria-invalid");
      light("nope");
    }
  });
}

async function progress(line: HTMLElement) {
  const s = await whenReady();
  const D = await import("./data");
  if (!D.gate.isPreview(s) && !s.user) return;
  try {
    const [all, m] = await Promise.all([D.services(), D.my()]);
    const who = D.whoOf(s);
    const core = all.filter((x) => D.isCore(x) && D.rateable(x, who));
    const n = core.filter((x) => m.rated[x.id]).length;
    if (!core.length) return;
    line.textContent = n >= core.length ? `You've rated all ${core.length} core services. Your wall is lit.` : `You've rated ${n} of ${core.length} core services. Pick up where you left off.`;
  } catch { /* keep the plain line */ }
}

if (root) {
  initHowItWorks(root as unknown as Document);   // the helpers take any root; their JSDoc default types it as Document
  initFlipCards(root as unknown as Document);
  const tryBox = root.querySelector<HTMLElement>("[data-try]");
  if (tryBox) initTry(tryBox);
  const line = root.querySelector<HTMLElement>("[data-svh-progress]");
  if (line) void progress(line);
}
