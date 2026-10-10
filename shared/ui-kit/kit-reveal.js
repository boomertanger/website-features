// shared/ui-kit/kit-reveal.js — the ".bt-reveal" section of the UI Kit page (/dev/ui-kit): the page version of the footer's Show / Copy
// (docs/specs/hotline-boom.md §10, design-system §8u) in every state: hidden, typing, shown, copied and reduced motion. ui-kit.js appends
// revealKitHtml() to the page and calls initRevealKit(mount). The live rows use the real builder and initReveals; the frozen states use
// example.com addresses (the real addresses are never written into a page's HTML).
import { revealHtml, revealRowHtml, initReveals } from "../ui/reveal.js";

const ROWS = [
  { key: "business", label: "Business", user: "business", domain: "example.com" },
  { key: "fanmail", label: "Fan mail", user: "fanmail", domain: "example.com" },
  { key: "support", label: "Support", user: "support", domain: "example.com" },
  { key: "privacy", label: "Privacy", user: "privacy", domain: "example.com" },
];

/** A frozen state: the real row markup with its state set by hand (no script). */
function frozen(row, state, text, button) {
  return revealRowHtml(row).replace('data-state="hidden"', `data-state="${state}"`)
    .replace(/(<span class="bt-reveal-addr"[^>]*>)[^<]*(<\/span>)/, `$1${text}$2`).replace(">Show</button>", `>${button}</button>`);
}

export function revealKitHtml() {
  const r = ROWS[0];
  return `
  <section class="kit-section" id="kit-reveal">
    <h2 class="kit-h">Reveal (.bt-reveal)</h2>
    <p class="kit-p">The page version of the footer's Show / Copy (<span class="kit-code">shared/ui/reveal.js</span>: revealRowHtml, revealHtml, initReveals). Used by Hotline Boom's "Rather use email?". The dot colours are the contact tokens, including <span class="kit-code">--bt-contact-privacy</span>. The address is never in the HTML: the row keeps the user and the domain parts apart and the script joins them on Show.</p>
    <p class="kit-sub">Live: press Show (it types the address in), then Copy</p>
    ${revealHtml({ lead: "These go straight to the owner's own inboxes, not the site. Replies come from the same address.", rows: ROWS })}
    <p class="kit-sub">Every state, frozen: hidden, typing, shown, copied</p>
    <div class="bt-reveal"><div class="bt-reveal-rows">
      ${frozen(ROWS[0], "hidden", `••••••••@${r.domain}`, "Show")}
      ${frozen(ROWS[1], "typing", "fanmail@exa", "Show")}
      ${frozen(ROWS[2], "shown", `support@${r.domain}`, "Copy")}
      ${frozen(ROWS[3], "copied", `privacy@${r.domain}`, "Copied")}
    </div></div>
    <p class="kit-sub">Reduced motion (data-instant here; prefers-reduced-motion does the same): Show puts the address in at once, no typing, no blinking caret</p>
    <div class="bt-reveal" data-instant><div class="bt-reveal-rows">${revealRowHtml({ ...r, label: "Business" })}</div></div>
  </section>`;
}

export function initRevealKit(mount) {
  const sec = mount.querySelector("#kit-reveal");
  if (!sec) return;
  initReveals(sec);   // the frozen rows are wired too: a click there just plays the flow from that state
}
