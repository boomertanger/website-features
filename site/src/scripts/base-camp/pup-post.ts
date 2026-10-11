// site/src/scripts/base-camp/pup-post.ts — the Pup Post mail card's behaviour (docs/specs/base-camp.md "Pup Post mail card";
// components/base-camp/PupPost.astro builds the envelope). The page HTML only ever holds the blurred placeholder bars: members get the address from
// sites/boomertanger/memberContent/mail ({ to, lines[] }) at run time, with Copy address (the lines joined by newlines). Visitors keep the bars and
// get the lock card ("The address is for Fan Club members"), whose Join free opens the sign-in dialog. Reusable anywhere ([data-pup-post]),
// later on /contact for members.
import { onMemberDoc, type MailDoc, type MemberState } from "./member";
import { esc, lockCard } from "./ui";
import { toast } from "../../../../shared/ui/toast.js";

const LOCKED = `<div class="pm-to pm-to--locked" aria-hidden="true"><span class="pm-k">To</span><i></i><i></i><i></i><i></i></div>`;

function render(card: HTMLElement, m: MemberState<MailDoc>) {
  const to = card.querySelector<HTMLElement>("[data-pm-to]")!;
  const lock = card.querySelector<HTMLElement>("[data-pm-lock]")!;
  const lines = (m.doc?.lines || []).filter((l) => typeof l === "string" && l.trim());
  const member = m.status === "member";
  card.classList.toggle("is-locked", !member);
  if (!member) {
    to.innerHTML = LOCKED;
    lock.innerHTML = lockCard(m, "The address is for Fan Club members", "Fan Club members can send real mail to Boomer and Skipper. Join free to see the address.", card.dataset.return || "", "Join free to see the address");
    return;
  }
  lock.innerHTML = "";
  if (!lines.length) {
    to.innerHTML = `<div class="pm-to"><span class="pm-k">To</span><b>${esc(m.doc?.to || "Boomer or Skipper")}</b></div><p class="pm-note">The address is on its way. Check back soon.</p>`;
    return;
  }
  to.innerHTML = `<div class="pm-to"><span class="pm-k">To</span><b>${esc(m.doc?.to || "Boomer or Skipper")}</b>${lines.map((l) => `<span>${esc(l)}</span>`).join("")}</div>
    <div class="pm-acts"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-pm-copy>Copy address</button>${m.preview ? `<span class="bt-badge bt-badge--gray">Sample address</span>` : ""}</div>`;
  to.querySelector<HTMLButtonElement>("[data-pm-copy]")!.addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      btn.textContent = "Copied";
      toast("Address copied. Please keep it in the club.");
      setTimeout(() => { btn.textContent = "Copy address"; }, 1600);
    } catch { toast("Couldn't copy it. Select the address and copy it instead.", { kind: "error" }); }
  });
}

/** Wires every Pup Post card under root. */
export function mountPupPosts(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-pup-post]").forEach((card) => {
    if (card.dataset.pmWired) return;
    card.dataset.pmWired = "1";
    onMemberDoc<MailDoc>("mail", (m) => render(card, m));
  });
}
