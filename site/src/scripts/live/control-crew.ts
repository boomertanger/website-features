// /live/control: the crew's part of the Control Room (Mod Machina phase 3 part 5; docs/specs/mod-machina.md §17a "Flag to owner", "The Captain", "Confirm tonight's crew").
// Flags at the top of the page with a chime, "Captain tonight" in the Crew card (the owner picks who is on the helm, captainSet) and "Confirm tonight's crew" after Stop.
// Its own slow read (the duty doc and the flags, every 5 s while the tab is visible), so control.ts's poll stays as it was. Markup is mod-deck-tools.ts (shared with the Deck).
import { initFlags } from "../../../../shared/ui/flag-card.js";
import { db, doc, getDoc, getDocs, collection, query, orderBy, limit, SITE_ID } from "../../lib/db";
import { dutyFrom, flagFrom, type DutyState, type Flag } from "./mod-deck-data";
import { flagStackHtml, confirmNightHtml, makeChime, flagTitle, avatarHtml } from "./mod-deck-tools";
import { esc, toast, messageFor } from "./ui";
import type { Ctx } from "./state";

export interface CrewState { duty: DutyState | null; flags: Flag[] }
const POLL_MS = 5000;

export async function readCrew(streamId: string, owner: boolean): Promise<CrewState> {
  const base = `sites/${SITE_ID}`;
  const [d, f] = await Promise.all([
    getDoc(doc(db, `${base}/streams/${streamId}/private/duty`)).catch(() => null),
    getDocs(query(collection(db, `${base}/streams/${streamId}/flags`), orderBy("createdAt", "desc"), limit(20))).catch(() => null),
  ]);
  const flags = (f?.docs || []).map((x: any) => flagFrom(x.id, x.data())).filter((x: Flag | null): x is Flag => !!x && x.doneAt == null && (owner || x.urgent));
  return { duty: d && d.exists() ? dutyFrom(d.data()) : null, flags };
}

export function initCrew(ctx: Ctx, read: (streamId: string) => Promise<CrewState> = (id) => readCrew(id, ctx.role === "owner")) {
  let st: CrewState = { duty: null, flags: [] };
  let known = new Set<string>(), first = true, stopTitle: (() => void) | null = null, key = "", busy = false;
  let added: Record<string, number> = {}, confirmBusy = false, timer = 0;
  const chime = makeChime();
  const sid = () => ctx.snap.pub?.streamId || "";
  const owner = () => ctx.role === "owner";

  // ---- markup
  const flagsHtml = () => flagStackHtml(st.flags, { now: Date.now(), soundOff: st.flags.length > 0 && !chime.isReady(), extra: "also sent to admins on duty" });
  ctx.hooks.crewExtraHtml = () => {
    const duty = st.duty;
    if (!owner() || ctx.mode !== "live" || !duty) return "";
    const cands = Object.entries(duty.onDuty).filter(([, e]) => e.grade >= 2);
    const now = duty.captainNow;
    const rows = cands.map(([uid, e]) => {
      const isCapt = now?.uid === uid;
      return `<div class="lc-capt-row">${avatarHtml(e.handle || "?")}<span><b>@${esc(e.handle || "crew")}</b>${e.away ? "<small>Away</small>" : ""}</span>${isCapt ? `<span class="bt-badge bt-badge--gold">Captain</span>` : `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="capt-set" data-uid="${esc(uid)}">Make Captain</button>`}</div>`;
    }).join("");
    return `<div class="lc-capt"><span class="bt-label">Captain tonight${now ? ` · @${esc(now.handle || "crew")}${now.acting ? " (acting)" : ""}` : ""}</span>${rows || `<p class="lc-hint">Nobody at Watcher grade or above is on duty yet.</p>`}</div>`;
  };
  ctx.hooks.confirmHtml = () => {
    const duty = st.duty;
    if (!owner() || ctx.mode !== "ended" || !duty?.night) return "";
    return `<div class="lc-confirm">${confirmNightHtml({ rows: duty.night.rows, streamMinutes: duty.night.minutes, added, confirmed: !!duty.confirmedAt, busy: confirmBusy, autoAt: duty.endedAt ? duty.endedAt + 24 * 3600000 : null })}</div>`;
  };

  // ---- the flags slot (the first child of the page) and the redraw
  function paint() {
    const el = ctx.root.querySelector<HTMLElement>('[data-slot="flags"]');
    if (!el) return;
    const html = flagsHtml();
    const k = `${st.flags.map((f) => f.id + (f.seenAt ? "s" : "n")).join()}|${chime.isReady()}`;
    if (el.dataset.k !== k) { el.dataset.k = k; el.innerHTML = html; }
    if (!(el as any)._flags) {
      (el as any)._flags = true;
      initFlags(el, { onSeen: (id: string) => void ack(id, "seen"), onDone: (id: string) => void ack(id, "done"), onSound: () => { chime.arm(); paint(); } });
    }
  }
  ctx.after.push(paint);

  async function ack(flagId: string, action: "seen" | "done") {
    try {
      await ctx.api.call("liveFlagAck", { streamId: sid(), flagId, action });
      st = { ...st, flags: action === "done" ? st.flags.filter((f) => f.id !== flagId) : st.flags.map((f) => (f.id === flagId ? { ...f, seenAt: Date.now() } : f)) };
      noteFlags(); paint();
    } catch (err) { toast(messageFor(err, "Couldn't answer that flag. Try again."), { kind: "error" }); }
  }
  function noteFlags() {
    const fresh = st.flags.filter((f) => !known.has(f.id) && !f.seenAt);
    known = new Set(st.flags.map((f) => f.id));
    if (!first && fresh.length) { chime.play(); stopTitle?.(); stopTitle = flagTitle("Control Room"); }
    first = false;
    if (!st.flags.some((f) => !f.seenAt)) { stopTitle?.(); stopTitle = null; }
  }

  // ---- reading
  async function poll() {
    const id = sid();
    if (busy || !id || ctx.mode === "idle" || document.hidden) return;
    busy = true;
    try {
      const next = await read(id);
      const k = JSON.stringify(next);
      if (k !== key) { key = k; st = next; noteFlags(); ctx.render(); }
    } catch (err) { console.warn("control: crew read", err); }
    finally { busy = false; }
  }
  timer = window.setInterval(() => void poll(), POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void poll(); });
  ctx.after.push(() => { if (sid() && !key) void poll(); });
  void timer;

  // ---- actions
  ctx.acts["capt-set"] = async (btn) => {
    const uid = btn.dataset.uid; if (!uid) return;
    btn.setAttribute("aria-busy", "true"); (btn as HTMLButtonElement).disabled = true;
    try { await ctx.api.call("captainSet", { streamId: sid(), uid }); toast("Captain set. They have the helm."); key = ""; await poll(); }
    catch (err) { toast(messageFor(err, "Couldn't set the Captain. Try again."), { kind: "error" }); (btn as HTMLButtonElement).disabled = false; btn.removeAttribute("aria-busy"); }
  };
  ctx.acts["confirm-night"] = async () => {
    if (confirmBusy) return;
    confirmBusy = true; ctx.render();
    try {
      await ctx.api.call("dutyConfirmNight", { streamId: sid(), added: Object.fromEntries(Object.entries(added).filter(([, v]) => v > 0)) });
      toast("Crew confirmed. Gears are paid.");
      if (st.duty) st = { ...st, duty: { ...st.duty, confirmedAt: Date.now(), needsConfirm: false } };
    } catch (err) { toast(messageFor(err, "Couldn't confirm the crew. Try again."), { kind: "error" }); }
    finally { confirmBusy = false; ctx.render(); }
  };
  ctx.root.addEventListener("click", (e) => {
    const stp = (e.target as HTMLElement).closest<HTMLElement>("[data-step]");
    if (!stp || !ctx.root.contains(stp)) return;
    const [u, dv] = (stp.dataset.step || "").split("|");
    added = { ...added, [u]: Math.max(0, (added[u] || 0) + Number(dv)) };
    ctx.render();
  });
}

/** Preview (signed out, non-production): a sample night so ?flag=urgent|plain and ?confirm=1 can be seen. Nothing is read or written. */
export function sampleCrew(owner: boolean): (streamId: string) => Promise<CrewState> {
  const q = new URLSearchParams(location.search), now = Date.now();
  const flags: Flag[] = q.get("flag") ? [
    { id: "f1", type: "pii", room: "ytVertical", note: "Someone posted what looks like a home address. I deleted it and hid the user; screenshot saved.", byHandle: "hollowgrin", urgent: true, createdAt: now - 60000, seenAt: null, doneAt: null },
    ...(q.get("flag") === "plain" ? [{ id: "f2", type: "raid" as const, room: "twitch", note: "Raid incoming from a channel with about 40 viewers, they seem friendly.", byHandle: "vexx", urgent: false, createdAt: now - 6 * 60000, seenAt: null, doneAt: null }] : []),
  ] : [];
  const duty = {
    streamId: "pv", state: "live", startedAt: now - 72 * 60000, endedAt: now - 9 * 60000, afterShow: false,
    captainNow: { uid: "u-no", handle: "nightowl", acting: false, since: now - 70 * 60000 },
    onDuty: { "u-no": { handle: "nightowl", grade: 4, since: now - 70 * 60000, roles: [{ role: "captain", room: null }], away: null }, "u-hg": { handle: "hollowgrin", grade: 2, since: now - 60 * 60000, roles: [{ role: "lead", room: "ytLandscape" }], away: null } },
    prompts: {}, rooms: {}, needsConfirm: true, confirmedAt: null, lockedOut: [], flagsSeen: {}, captainAtStop: "u-no",
    night: { minutes: 192, rows: [
      { uid: "u-no", handle: "nightowl", grade: 4, lines: { captain: 192 }, minutes: 192 },
      { uid: "u-hg", handle: "hollowgrin", grade: 2, lines: { "lead:ytLandscape": 176 }, minutes: 176 },
      { uid: "u-ml", handle: "mothlight", grade: 1, lines: { "lead:tiktok": 54 }, minutes: 54 },
    ] },
  } as unknown as DutyState;
  return async () => ({ duty, flags: owner ? flags : flags.filter((f) => f.urgent) });
}
