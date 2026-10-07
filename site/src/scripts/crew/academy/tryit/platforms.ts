// Try it for module 3 "Platform guides": "Where's the button?". Pick an app and an action; the drawn mini chat for
// that app lights up where to tap. Local only (docs/specs/crew-academy.md §3). The sketch is decorative; the
// callout under it says the same thing in words.
import { mountShell, esc } from "../tryit1-kit";

type App = "twitch" | "youtube" | "tiktok";
type Act = "remove" | "timeout" | "hide" | "approve";
const APPS: [App, string][] = [["twitch", "Twitch"], ["youtube", "YouTube"], ["tiktok", "TikTok"]];
const ACTS: [Act, string][] = [["timeout", "Timeout"], ["remove", "Remove a message"], ["hide", "Hide a user"], ["approve", "Approve a held message"]];

// Which parts of the sketch light up (their data-t tokens), and what to say.
const HIT: Record<App, Record<Act, [string[], string]>> = {
  twitch: {
    timeout: [["timeout"], "Tap the clock on the message (or type /timeout name 300). Pick the length, then note it in the Mod Deck."],
    remove: [["remove"], "Tap the bin on the message to delete it. Click a name for the full set of mod tools."],
    hide: [[], "Twitch has no Hide. Delete the message, or ban to keep someone out for good."],
    approve: [["approve"], "Open Mod View: AutoMod's held messages wait in the queue. Tap Allow or Deny."],
  },
  youtube: {
    timeout: [["menu", "timeout"], "Tap the three dots on the message, then Put user in timeout."],
    remove: [["menu", "remove"], "Tap the three dots on the message, then Remove."],
    hide: [["menu", "hide"], "Tap the three dots on the message, then Hide user on channel."],
    approve: [["approve"], "Messages held for review need a yes or no. Tap Approve, or Remove to refuse."],
  },
  tiktok: {
    timeout: [["press", "timeout"], "Long-press the comment, then Mute and choose a length."],
    remove: [["press", "remove"], "Long-press the comment, then Block. Report it as well if it breaks TikTok's rules."],
    hide: [["press", "remove"], "Long-press the comment, then Block. That's TikTok's way of hiding someone."],
    approve: [["filters"], "TikTok has no held queue. Keyword filters in your settings catch the worst before it shows."],
  },
};

const t = (tok: string, inner: string, tag = "span", cls = "ta1-ui") => `<${tag} class="${cls}" data-t="${tok}">${inner}</${tag}>`;

function sketch(app: App): string {
  if (app === "twitch") {
    return `<div class="ta1-phone" data-sk="twitch"><div class="ta1-phone-h"><b>Twitch chat</b><span class="ta1-chip">Mod View</span></div>`
      + `<div class="ta1-chatx"><div class="ta1-msg"><b class="ta1-nm" data-c="3">Ivy</b><span class="ta1-tx">that door!!</span></div>`
      + `<div class="ta1-msg ta1-msg--bad"><b class="ta1-nm" data-c="1">spambot9</b><span class="ta1-tx">FREE FOLLOWERS at bit.ly/xyz</span>`
      + `<span class="ta1-tools">${t("remove", "Bin")}${t("timeout", "Clock")}${t("ban", "Ban")}</span></div></div>`
      + `<div class="ta1-held"><small>AutoMod held a message</small><div class="ta1-msg"><b class="ta1-nm" data-c="4">viewer31</b><span class="ta1-tx">this game is trash lol</span></div><div class="ta1-row">${t("approve", "Allow", "span", "ta1-ui ta1-ui--go")}${t("deny", "Deny")}</div></div></div>`;
  }
  if (app === "youtube") {
    return `<div class="ta1-phone" data-sk="youtube"><div class="ta1-phone-h"><b>YouTube live chat</b><span class="ta1-chip">Landscape</span></div>`
      + `<div class="ta1-chatx"><div class="ta1-msg"><b class="ta1-nm" data-c="3">Ivy</b><span class="ta1-tx">that door!!</span></div>`
      + `<div class="ta1-msg ta1-msg--bad"><b class="ta1-nm" data-c="1">spambot9</b><span class="ta1-tx">FREE FOLLOWERS at bit.ly/xyz</span>${t("menu", "&#8942;", "span", "ta1-ui ta1-ui--dots")}</div>`
      + `<div class="ta1-menu">${t("remove", "Remove")}${t("timeout", "Put user in timeout")}${t("hide", "Hide user on channel")}</div></div>`
      + `<div class="ta1-held"><small>Held for review</small><div class="ta1-msg"><b class="ta1-nm" data-c="4">viewer31</b><span class="ta1-tx">this game is trash lol</span></div><div class="ta1-row">${t("approve", "Approve", "span", "ta1-ui ta1-ui--go")}${t("deny", "Remove")}</div></div></div>`;
  }
  return `<div class="ta1-phone" data-sk="tiktok"><div class="ta1-phone-h"><b>TikTok LIVE</b>${t("filters", "Keyword filters", "span", "ta1-ui ta1-chip")}</div>`
    + `<div class="ta1-chatx"><div class="ta1-msg"><b class="ta1-nm" data-c="3">ivy.plays</b><span class="ta1-tx">that door!!</span></div>`
    + `<div class="ta1-msg ta1-msg--bad" data-t="press"><b class="ta1-nm" data-c="1">spambot9</b><span class="ta1-tx">FREE FOLLOWERS at bit.ly/xyz</span></div></div>`
    + `<div class="ta1-sheet"><small>Hold a comment</small><div class="ta1-row">${t("timeout", "Mute")}${t("remove", "Block")}${t("report", "Report")}</div></div></div>`;
}

export default function init(root: HTMLElement): void {
  const { body, done } = mountShell(root, "Where's the button?", "Choose an app and an action. The drawn chat lights up where to tap.");
  let app: App = "twitch";
  let act: Act | null = null;
  const seen = new Set<Act>();

  const seg = <T extends string>(label: string, key: string, items: [T, string][], cur: T | null) =>
    `<div class="ta1-pick"><p class="ta1-h" id="ta1-${key}">${label}</p><div class="ta1-seg" role="group" aria-labelledby="ta1-${key}">${items.map(([v, n]) => `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-${key}="${v}" aria-pressed="${cur === v}">${esc(n)}</button>`).join("")}</div></div>`;

  function render() {
    const hit = act ? HIT[app][act] : null;
    body.innerHTML = `<div class="ta1-picks">${seg("App", "app", APPS, app)}${seg("Action", "act", ACTS, act)}</div>`
      + `<div class="ta1-stage" aria-hidden="true">${sketch(app)}</div>`
      + `<p class="ta1-fb" role="status" data-s="${hit ? "ok" : ""}">${hit ? esc(hit[1]) : "Pick an action to see where to tap."}</p>`
      + `<p class="ta1-meta">${seen.size} of ${ACTS.length} actions seen</p>`;
    if (hit) body.querySelectorAll<HTMLElement>("[data-t]").forEach((el) => {
      const toks = (el.dataset.t || "").split(" ");
      if (toks.some((k) => hit[0].includes(k))) el.classList.add("is-hit");
    });
    body.querySelector<HTMLElement>(".ta1-stage")!.dataset.lit = hit && hit[0].length ? "1" : "";
    done.hidden = seen.size < ACTS.length;
    if (!done.hidden) done.innerHTML = `<b>Found them all</b><p>The buttons differ by app, but the ladder doesn't: remind, warn, timeout, ban, the same on every chat.</p>`;
  }

  body.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-app], button[data-act]");
    if (!b) return;
    if (b.dataset.app) app = b.dataset.app as App;
    if (b.dataset.act) { act = b.dataset.act as Act; }
    if (act) seen.add(act);
    render();
    body.querySelector<HTMLElement>(b.dataset.app ? `button[data-app="${app}"]` : `button[data-act="${act}"]`)?.focus();
  });
  render();
}
