// Suggest a cover (docs/specs/game-vault.md §6): only for a game with no cover (the mascot shows).
// The member drops a picture, crops it to 3:4 in the browser, and it uploads as a private
// (authenticated) file with a signature from vaultCoverSuggestSignature; vaultCoverSubmit then
// checks the file on Cloudinary and queues it for a mod. The rules show as plain messages:
// JPG, PNG or WebP; up to 5 MB; at least 300 × 400; one pending suggestion per game; 3 a day.
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { call } from "../../lib/call";
import { messageFor, reasonOf } from "../../lib/errors";
import { requireVerified } from "./gate";
import { esc } from "./ui";
import { coverPicker, uploadSigned, RULES_TEXT } from "./crop";

const PROBLEMS: Record<string, string> = {
  format: "That file type won't work. Use a JPG, PNG or WebP.",
  tooBig: "That file is over 5 MB. Try a smaller one.",
  tooSmall: "That picture is too small. Covers need at least 300 × 400 pixels.",
  notPortrait: "Covers are portrait, 3:4. Crop it to fit and try again.",
  notFound: "The upload didn't arrive. Try again.",
};
const REASONS: Record<string, string> = {
  hasCover: "This game has a cover now, so it doesn't need a suggestion.",
  alreadySuggested: "You've already suggested a cover for this game. A mod will look at it soon.",
  coverLimit: "You can suggest 3 covers a day. Try again tomorrow.",
  noGame: "That game isn't in the Vault any more.",
  inUse: "That upload was already sent.",
};

export async function openCoverSuggest(g: { slug: string; title: string }) {
  if (!(await requireVerified("Join to suggest a cover"))) return;
  let blob: Blob | null = null;
  const m = openModal({
    title: `Suggest a cover for ${g.title}`, feature: "game-vault",
    content: `${modalHeader(`Suggest a cover`, `For ${esc(g.title)}. A mod checks it before it shows.`)}<div class="bt-stack" style="gap:14px"><div data-pick></div><p class="bt-fine bt-fine--left">${RULES_TEXT} One suggestion per game, 3 a day. Only a picture of the game's box art or key art, please. <a href="/cloud-stash/how-it-works" target="_blank" rel="noopener">What happens to your upload?</a></p><div data-err role="alert"></div></div><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-send disabled>Send for a check</button></div>`,
  });
  const send = m.modal.querySelector<HTMLButtonElement>("[data-send]")!, err = m.modal.querySelector<HTMLElement>("[data-err]")!;
  coverPicker(m.modal.querySelector<HTMLElement>("[data-pick]")!, { onReady: (b) => { blob = b; send.disabled = !b; } });
  send.addEventListener("click", async () => {
    if (!blob) return;
    err.innerHTML = "";
    send.disabled = true; send.textContent = "Uploading…";
    try {
      const sig = await call<{ uploadUrl: string; fields: Record<string, string>; publicId: string }>("vaultCoverSuggestSignature", { slug: g.slug });
      await uploadSigned(sig, blob);
      send.textContent = "Sending…";
      await call("vaultCoverSubmit", { publicId: sig.publicId, slug: g.slug });
      m.modal.innerHTML = `${modalHeader("Thanks for the cover")}<div class="gv-result" role="status"><span class="bt-modal-icon" aria-hidden="true">🖼️</span><b>A mod will look at it soon</b><p>Once it's approved it becomes ${esc(g.title)}'s cover, with your name on it. If it isn't used, you'll see why on your account.</p></div><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--primary" data-bt-close>Done</button></div>`;
    } catch (e) {
      const why = reasonOf(e);
      const problem = (e as any)?.details?.problem;
      const msg = (why === "badCover" && problem && PROBLEMS[problem]) || (why && REASONS[why]) || messageFor(e, "That didn't go through. Try again.");
      err.innerHTML = `<p class="bt-notice bt-notice--error">${esc(msg)}</p>`;
      send.disabled = why === "hasCover" || why === "alreadySuggested" || why === "coverLimit"; send.textContent = "Send for a check";
    }
  });
}
