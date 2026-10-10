// Post an idea (docs/specs/feature-lab.md §7; mockup "Post an idea"): It's for (Site, Stream, Other), Title, What should it do?, About (optional: the Service
// Hub service it is about, default "Not about one thing"), then the
// success view: the IDEA IN stamp with a bubble burst, "It's on the board", and the Night Shift line when a live mission counted it.
// Visitors get the Join dialog titled "Join to post ideas"; members with an unverified email get the verify prompt. A token per open
// dialog makes a double click post one idea.
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { burst } from "../../../../shared/ui/burst.js";
import { messageFor } from "../../lib/errors";
import { AREA, type Area } from "./data";
import { post, newToken } from "./store";
import { requireVerified, isPreview } from "./gate";
import { loadServices, serviceSelectHtml } from "../services-pick";
import { esc, stamp } from "./ui";
import { bigFlask } from "./art";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function openPost(onPosted: (id: string) => void, openIdea: (id: string) => void) {
  if (!(await requireVerified("Join to post ideas"))) return;
  let area: Area = "site", tok = newToken(), service = "";
  const m = openModal({ title: "New idea", feature: "feature-lab", content: "" });
  const modal = m.modal;

  const form = (keep = { title: "", description: "" }) => {
    modal.innerHTML = `${modalHeader("New idea", "Got an idea? Pitch it here and members will vote on what gets built next.")}
      <div class="bt-field"><span class="bt-label">It's for</span><div class="bt-pills fl-area-pick" role="radiogroup" aria-label="Area">${(Object.keys(AREA) as Area[]).map((k) => `<button type="button" role="radio" aria-checked="${area === k}" class="${area === k ? "is-on" : ""}" data-subarea="${k}">${AREA[k]}</button>`).join("")}</div></div>
      <div class="bt-field"><label class="bt-label" for="fl-t">Title</label><input id="fl-t" class="bt-input" type="text" maxlength="200" value="${esc(keep.title)}" autocomplete="off"><span class="bt-hint">3–200 characters</span></div>
      <div class="bt-field"><label class="bt-label" for="fl-d">What should it do?</label><textarea id="fl-d" class="bt-textarea" rows="4" maxlength="2000">${esc(keep.description)}</textarea><span class="bt-hint">10–2,000 characters. A new game idea? Pitch it in the Arcade Studio instead.</span></div>
      <div data-svc-slot></div>
      <p class="bt-error" hidden data-err role="alert"></p>
      <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-go>Post idea</button></div>`;
    // About (optional): filled once the list is in, keeping the member's pick across redraws
    void loadServices({ preview: isPreview() }).then((list) => { const slot = modal.querySelector<HTMLElement>("[data-svc-slot]"); if (slot && list.length) slot.innerHTML = serviceSelectHtml({ id: "fl-svc", label: "About (optional)", list, value: service, none: "Not about one thing" }); });
    modal.querySelector<HTMLInputElement>("#fl-t")?.focus();
  };
  const done = (id: string, counted: boolean) => {
    const d = new Date();
    modal.innerHTML = `${modalHeader("Idea posted")}
      <div class="fl-done"><div class="fl-done-art" data-burst>${bigFlask()}${stamp("In", "Idea", `${MONTHS[d.getMonth()]} ${d.getDate()}`)}</div><h3>It's on the board</h3><p>Your vote is already on it. Members can vote and comment now, and every status change shows up in its history.</p>${counted ? '<span class="fl-ns">⏱ Night Shift · <b>Big idea</b> done</span>' : ""}</div>
      <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-again>Post another</button><button type="button" class="bt-btn bt-btn--primary" data-see>See it on the board</button></div>`;
    burst(modal.querySelector<HTMLElement>("[data-burst]"));
    modal.querySelector<HTMLButtonElement>("[data-see]")!.focus();
    modal.querySelector("[data-again]")!.addEventListener("click", () => { tok = newToken(); service = ""; form(); });
    modal.querySelector("[data-see]")!.addEventListener("click", () => { m.close(); openIdea(id); });
  };

  modal.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const pick = t.closest<HTMLElement>("[data-subarea]");
    if (pick) {
      area = pick.dataset.subarea as Area;
      modal.querySelectorAll<HTMLElement>("[data-subarea]").forEach((x) => { const on = x === pick; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", String(on)); });
      return;
    }
    const go = t.closest<HTMLButtonElement>("[data-go]");
    if (!go) return;
    const err = modal.querySelector<HTMLElement>("[data-err]")!;
    const title = modal.querySelector<HTMLInputElement>("#fl-t")!.value.trim(), description = modal.querySelector<HTMLTextAreaElement>("#fl-d")!.value.trim();
    err.hidden = true;
    if (title.length < 3) { err.textContent = "The title needs to be 3 to 200 characters."; err.hidden = false; return; }
    if (description.length < 10) { err.textContent = "The description needs to be 10 to 2,000 characters."; err.hidden = false; return; }
    go.disabled = true;
    go.innerHTML = '<span class="bt-spinner" aria-hidden="true"></span>Posting…';
    try {
      const res = await post({ title, description, area, token: tok, ...(service ? { serviceId: service } : {}) });
      onPosted(res.id);
      done(res.id, res.counted);
    } catch (ex) {
      err.textContent = messageFor(ex, "Couldn't post your idea. Try again.");
      err.hidden = false;
      go.disabled = false;
      go.textContent = "Post idea";
    }
  });
  modal.addEventListener("change", (e) => { const t = e.target as HTMLSelectElement; if (t.matches("#fl-svc")) service = t.value; });
  form();
}
