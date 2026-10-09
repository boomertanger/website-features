// The Stream Deck card and the stream view key (docs/specs/control-room.md §3 "Stream Deck card", §8). OWNER ONLY: the grid has no deck slot for anyone
// else, initDeck does nothing unless the role is "owner", and liveDeckKey / liveObsKey refuse everyone else on the server. A key is generated or
// rotated with the callable, shown ONCE in a dialog with a copy button, and only a hash is stored: afterwards the card says "set on <date>" (live/main
// deckKeyAt / obsKeyAt, written by the callable). The action list uses a "<your deck key>" placeholder; the real key is never shown again.
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { modalHeader } from "../../../../shared/ui/modal.js";
import { app } from "../../lib/firebase";
import type { Ctx } from "./state";
import { esc, openLive, askLive, toast, messageFor, withBusy, copyText } from "./ui";

const DECK_BASE = () => `https://us-central1-${app.options.projectId}.cloudfunctions.net/liveDeck`;
const KEY = "<your deck key>";
const q = (action: string, extra = "") => `${DECK_BASE()}?k=${KEY}&action=${action}${extra}`;
interface Act { label: string; note: string; url: string; later?: boolean; never?: boolean }
const ACTIONS: Act[] = [
  { label: "Begin the next beat", note: "Start, Break 1, Break 2, End in order", url: q("nextBeat") },
  { label: "Open check-in", note: "Add &minutes=2, 3, 5 or 10 (default 5)", url: q("openCheckin") },
  { label: "+1 minute", note: "Extends the open check-in", url: q("extend") },
  { label: "Close check-in", note: "Closes it now", url: q("closeCheckin") },
  { label: "Scene: Auto", note: "The stream view follows the beat", url: q("scene", "&scene=auto") },
  { label: "Scene: Be right back", note: "Add &brbMinutes=5 for a timer", url: q("scene", "&scene=brb") },
  { label: "Scene: Ending", note: "Pins the Ending scene", url: q("scene", "&scene=ending") },
  { label: "Next planned game", note: "Switches to tonight's next game", url: q("nextGame") },
  { label: "Start or end Questions, answered, skip", note: "Coming with live activities", url: "", later: true },
  { label: "Start Hot Seat, spin, next step", note: "Coming with live activities", url: "", later: true },
  { label: "Drop the preset badge", note: "Coming with live activities", url: "", later: true },
  { label: "Start the stream, Stop the stream", note: "Never on the deck: a key can't confirm. Use the controls page.", url: "", never: true },
];
const fmtDate = (t: number | null | undefined) => (t ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

function keyCard(kind: "deck" | "obs", set: boolean, at: number | null) {
  const name = kind === "deck" ? "Stream Deck key" : "Stream view key";
  const status = set ? `<span class="lc-ok">● Key set${at ? ` on ${esc(fmtDate(at))}` : ""}</span>` : `<span class="lc-wait">No key yet${at ? ` (revoked ${esc(fmtDate(at))})` : ""}</span>`;
  return `<div class="ld-key" data-kind="${kind}"><div><b>${name}</b><small>${status}</small></div><div class="ld-key-acts"><button type="button" class="bt-btn bt-btn--${set ? "secondary" : "primary"} bt-btn--sm" data-act="key-make" data-kind="${kind}">${set ? "Rotate the key" : "Make a key"}</button>${set ? `<button type="button" class="bt-link-btn" data-act="key-revoke" data-kind="${kind}">Revoke</button>` : ""}</div></div>`;
}
const copyRow = (label: string, text: string, note = "") => `<div class="ld-row"><div><b>${esc(label)}</b>${note ? `<small>${esc(note)}</small>` : ""}<code>${esc(text)}</code></div><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="copy-url" data-text="${esc(text)}" aria-label="Copy the URL for ${esc(label)}">Copy</button></div>`;

function deckHtml(ctx: Ctx) {
  const m = ctx.main;
  const origin = location.origin;
  const wide = `${origin}/live/obs?k=<your stream view key>&layout=wide`, tall = `${origin}/live/obs?k=<your stream view key>&layout=tall`;
  const list = ACTIONS.map((a) => a.url
    ? copyRow(a.label, a.url, a.note)
    : `<div class="ld-row is-off"><div><b>${esc(a.label)}</b><small>${esc(a.note)}</small></div><span class="bt-badge bt-badge--gray">${a.never ? "Never on the deck" : "Soon"}</span></div>`).join("");
  const deck = crPanelHtml({ id: "lc-deck", cls: "lc-deckpanel", title: "Stream Deck", icon: "controls", tagHtml: `<span class="bt-badge bt-badge--admin">Owner only</span>`,
    bodyHtml: `<p class="lc-hint ld-lead">Each key on the Stream Deck software calls one of these URLs (a web-request plugin; verify which). Replace <code>&lt;your deck key&gt;</code> with the key you made. It is shown once, then only a hash is kept. 30 requests a minute at most.</p>${keyCard("deck", !!m?.deckKeySet, m?.deckKeyAt ?? null)}<div class="ld-list">${list}</div>` });
  const view = crPanelHtml({ id: "lc-obs", cls: "lc-deckpanel", title: "Stream view", icon: "video", tagHtml: `<span class="bt-badge bt-badge--admin">Owner only</span>`,
    bodyHtml: `<p class="lc-hint ld-lead">Browser sources for Streamlabs and TikTok LIVE Studio. The key is required because the scene shows the check-in word. The stream view page itself arrives soon; these are the URLs it will use.</p>${keyCard("obs", !!m?.obsKeySet, m?.obsKeyAt ?? null)}<div class="ld-list">${copyRow("Wide (1920×1080): Streamlabs, Twitch and YouTube", wide)}${copyRow("Tall (1080×1920): Dual Output vertical and TikTok LIVE Studio", tall)}</div>` });
  return `<div class="ld-wrap">${deck}${view}</div>`;
}

function keyDialog(kind: "deck" | "obs", key: string) {
  const name = kind === "deck" ? "Stream Deck key" : "Stream view key";
  const { modal, close } = openLive({ title: name, content: `${modalHeader(esc(name), "Copy it now. It is shown once, and only a hash is stored.")}
    <div class="ld-keybox"><code data-key>${esc(key)}</code><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-copy>Copy</button></div>
    <p class="bt-notice lc-gold" role="note">Put it straight into the Stream Deck software${kind === "obs" ? " or the browser source URL" : ""}. Don't paste it in chat. If it leaks, rotate it here.</p>
    <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-done>I've copied it</button></div>` });
  modal.addEventListener("click", async (e) => {
    if ((e.target as HTMLElement).closest("[data-copy]")) { toast((await copyText(key)) ? "Key copied." : "Couldn't copy: select it and copy by hand.", { kind: "info" }); }
    if ((e.target as HTMLElement).closest("[data-done]")) { modal.querySelector("[data-key]")!.textContent = ""; close(); }
  });
}

export function initDeck(ctx: Ctx) {
  if (ctx.role !== "owner") return;
  ctx.hooks.deckHtml = deckHtml;
  const call = (kind: "deck" | "obs", data: object) => ctx.api.call<{ key?: string }>(kind === "deck" ? "liveDeckKey" : "liveObsKey", data);
  const reload = async () => { try { ctx.main = await ctx.api.main(); } catch { /* keep the old dates */ } ctx.render(); };
  ctx.acts["key-make"] = async (b) => {
    const kind = b.dataset.kind as "deck" | "obs", had = kind === "deck" ? ctx.main?.deckKeySet : ctx.main?.obsKeySet;
    const go = async () => { try { const r = await call(kind, {}); if (r.key) keyDialog(kind, r.key); await reload(); } catch (err) { toast(messageFor(err), { kind: "error" }); } };
    if (!had) { await withBusy(b as HTMLButtonElement, "Making…", go); return; }
    await askLive({ title: "Rotate the key?", message: "The old key stops working at once. Every Stream Deck key or browser source using it needs the new one.", confirmLabel: "Rotate the key", busyLabel: "Rotating…", onConfirm: async () => { await go(); } });
  };
  ctx.acts["key-revoke"] = async (b) => {
    const kind = b.dataset.kind as "deck" | "obs";
    await askLive({ title: "Revoke the key?", message: "It stops working at once and no new one is made. You can make a key again any time.", confirmLabel: "Revoke it", busyLabel: "Revoking…", onConfirm: async () => { try { await call(kind, { revoke: true }); } catch (err) { throw new Error(messageFor(err)); } toast("Key revoked."); await reload(); } });
  };
  ctx.acts["copy-url"] = async (b) => { toast((await copyText(b.dataset.text || "")) ? "URL copied. Swap in your key." : "Couldn't copy: select the URL and copy by hand.", { kind: "info" }); };
}
