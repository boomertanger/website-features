// /admin: the owner's Twitch broadcaster card (Club Pass, docs/specs/club-pass.md §12). Connect, Reconnect and Disconnect the one
// broadcaster token that counts Twitch subs (scopes channel:read:subscriptions and channel:manage:moderators; Mod Machina's mod sync
// stays off). The token never reaches the browser: clubBroadcasterStatus says who it belongs to, its scopes and whether it works.
// Preview (non-production, signed out, ?as=admin): connected sample, or ?tw=off for the not-connected look. Nothing is saved.
import { whenReady } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";
import { messageFor } from "../../lib/errors";
import { startBroadcaster } from "../../lib/twitch";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";

const card = document.querySelector<HTMLElement>("[data-tb-card]");

interface Status { connected: boolean; login?: string | null; scope?: string[]; accessExpiresAt?: number | null; health?: { ok: boolean; why?: string } | null; missingScopes?: string[] }

const timeLeft = (ms: number) => {
  const min = Math.round((ms - Date.now()) / 60000);
  return min <= 0 ? "now" : min < 60 ? `in ${min} min` : `in ${Math.round(min / 60)} h`;
};

function show(st: Status | null, o: { preview: boolean; error?: string }) {
  if (!card) return;
  const badge = card.querySelector<HTMLElement>("[data-tb-badge]")!, line = card.querySelector<HTMLElement>("[data-tb-status]")!;
  const connect = card.querySelector<HTMLButtonElement>("[data-tb-connect]")!, off = card.querySelector<HTMLButtonElement>("[data-tb-disconnect]")!;
  const just = new URLSearchParams(location.search).get("twitch") === "connected";
  card.hidden = false;
  off.hidden = !st?.connected;
  connect.textContent = st?.connected ? "Reconnect" : "Connect Twitch broadcaster";
  if (o.error) { badge.className = "bt-badge bt-badge--gray"; badge.textContent = "Unknown"; line.textContent = o.error; }
  else if (!st?.connected) { badge.className = "bt-badge bt-badge--gray"; badge.textContent = "Not connected"; line.textContent = "Not connected. Twitch subs don't count on the site until you connect."; }
  else {
    const healthy = !!st.health?.ok && !(st.missingScopes || []).length;
    badge.className = `bt-badge ${healthy ? "bt-badge--green" : "bt-badge--red"}`;
    badge.textContent = healthy ? "Connected" : "Needs reconnect";
    const token = healthy
      ? `Token healthy${st.accessExpiresAt ? `, refreshes on its own (next ${timeLeft(st.accessExpiresAt)})` : ""}.`
      : (st.missingScopes || []).length ? `Missing ${st.missingScopes!.join(" and ")}: press Reconnect.` : "Twitch refused the token: press Reconnect.";
    line.textContent = `${just ? "Twitch connected. " : ""}Connected as ${st.login || "?"}. Scopes: ${(st.scope || []).join(", ") || "none"}. ${token}`;
  }
  connect.onclick = async () => {
    if (o.preview) { toast("Preview: nothing saved", { kind: "info" }); return; }
    connect.disabled = true;
    try { await startBroadcaster("/admin"); } catch (err) { line.textContent = messageFor(err, "Couldn't start the Twitch connection."); connect.disabled = false; }
  };
  off.onclick = () => {
    if (o.preview) { toast("Preview: nothing saved", { kind: "info" }); return; }
    void confirmAction({
      title: "Disconnect Twitch?",
      message: "Twitch subs stop being checked until you connect again. Passes already gold stay gold until the next sweep finds a change.",
      confirmLabel: "Disconnect",
      busyLabel: "Disconnecting…",
      onConfirm: async () => {
        try { const { call } = await import("../../lib/call"); await call("clubBroadcasterDisconnect"); } catch (err) { throw new Error(messageFor(err)); }
        show({ connected: false }, { preview: false });
      },
    });
  };
}

/** Owner only (the caller checks; every club callable checks again on the server). */
export async function initTwitchBroadcaster() {
  try {
    const { call } = await import("../../lib/call");
    show(await call<Status>("clubBroadcasterStatus"), { preview: false });
  } catch (err) { show(null, { preview: false, error: messageFor(err, "Couldn't check Twitch.") }); }
}

if (!isProduction) {
  whenReady().then((s) => {
    const q = new URLSearchParams(location.search);
    if (s.user || q.get("as") !== "admin") return;
    show(q.get("tw") === "off" ? { connected: false } : { connected: true, login: "boomertanger", scope: ["channel:manage:moderators", "channel:read:subscriptions"], accessExpiresAt: Date.now() + 3 * 3600000, health: { ok: true } }, { preview: true });
  });
}
