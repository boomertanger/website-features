// The live controls (docs/specs/control-room.md §3 to §4, §9): the check-in control with the big word, the beats' buttons, the Scene card, the launch
// panel, the game switcher, the TikTok viewer entry, banners, Stop and After-show, and the Stream wrap-up. Display only: every action is a callable
// (liveBeat, liveCheckInWindow, liveScene, switchGame, liveViewerEntry, liveAfterShow, stopStream) the server checks and logs again.
// THE WORD: liveCheckInWindow returns it to the caller, and it is also in private/control, which the owner and A2+ may read. Here it lives only in
// this page's memory (ctx.snap) and the screen: never stored, logged, or put in the URL.
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { launchHtml } from "../../../../shared/ui/launch.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { readoutsHtml } from "../../../../shared/ui/readout.js";
import { burst } from "../../../../shared/ui/burst.js";
import { fmtClock } from "../../../../shared/ui/checkin.js";
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import type { Ctx } from "./state";
import { BEATS, BEAT_LABEL, ROOMS, ROOM_LABEL, fmtDur, plural, type Beat, type Room } from "./model";
import { esc, askLive, withBusy, toast, messageFor, mascotHtml, reduced } from "./ui";
import { gamePickerHtml, initGamePicker } from "./gamepick";

let len = 0;                       // the chosen window length (minutes)
let brbMin = 5;
let dismissedBanner = "";
const SCENES: [string, string][] = [["auto", "Auto"], ["starting", "Starting soon"], ["stats", "Live stats"], ["break", "Break"], ["break-side", "Break · side rail"], ["brb", "Be right back"], ["ending", "Ending"]];

const winOf = (ctx: Ctx) => {
  const w = ctx.snap.control?.window, now = Date.now();
  if (!w) return { w: null, open: false };
  return { w, open: !w.closedAt && w.closesAt > now };
};
const beatNow = (ctx: Ctx): Beat | null => ctx.snap.pub?.beat ?? null;
const nextBeatKey = (ctx: Ctx): Beat | undefined => BEATS.find((k) => !["now", "done", "skipped"].includes(ctx.snap.pub?.beats?.[k]?.status || ""));

/* ------------------------------------------------------------------ the check-in control (the main control while live) */
function liveStageHtml(ctx: Ctx): string {
  const pub = ctx.snap.pub!, beat = beatNow(ctx);
  const { w, open } = winOf(ctx);
  const choices = ctx.main?.windowLengthChoices || [2, 3, 5, 10];
  if (!len) len = ctx.main?.windowDefaultMinutes || 5;
  const s = ctx.snap.live!;
  const name = beat ? BEAT_LABEL[beat] : "";
  const stopRow = `<div class="lc-stop-row">${beat === "end" && s.type !== "backstage" ? `<button type="button" class="bt-btn bt-btn--secondary" data-act="after-show">Start after-show</button>` : ""}<button type="button" class="bt-btn ${beat === "end" ? "bt-btn--primary" : "bt-btn--secondary"}" data-act="stop">Stop the stream</button></div>`;
  let body: string, cls = "lc-a-stage", tag = "", title = `Check-in · ${name}`;
  if (open && w && w.beat === beat) {
    cls += " bt-checkin is-open";
    tag = `<span class="bt-live-tag"><i></i>Open</span>`;
    const rooms = (s.type === "backstage" ? [] : s.rooms) as Room[];
    const first = (ctx.snap.control?.firstIn?.[w.beat] || []).map((x) => x.handle);
    body = `<div class="lc-word" data-closes="${w.closesAt}" data-length="${w.lengthMinutes * 60000}">
      <div class="bt-checkin-ring" style="--ring:1" role="timer" aria-label="Time left in this check-in"><span data-cd></span></div>
      <div><div class="lc-word-say" data-word="${esc(w.word || "")}" aria-live="off">${esc(w.word || "…")}</div><div class="lc-word-hint">Say it out loud. It's on the stream view too, and never on the public page.</div></div>
      <div class="bt-checkin-count"><span data-bc>0</span><small>checked in this beat</small></div></div>
      ${rooms.length ? `<div class="lc-rooms">${rooms.map((r) => `<div class="lc-room">${platformIconHtml(r)}<span>${esc(ROOM_LABEL[r])}</span><span class="lc-bar"><i data-rbar="${r}"></i></span><b data-r="${r}">0</b></div>`).join("")}</div>` : ""}
      ${first.length ? `<div class="bt-checkin-first">First in: ${first.map((h) => `<b>@${esc(h)}</b>`).join(" ")}</div>` : ""}
      <div class="lc-acts"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="ci-extend">+1 minute</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="ci-close">Close now</button></div>`;
  } else if (w && w.beat === beat) {
    // this beat's window has closed: its count, and the one Reopen
    const n = pub.counts.byBeat?.[w.beat] || 0;
    tag = `<span class="bt-badge bt-badge--gray">Closed</span>`;
    body = `<div class="lc-idle"><div><b>Closed · ${n.toLocaleString("en-US")} checked in</b><p>${w.reopened ? "It was reopened once already. The next one opens at the next beat." : "You can reopen it once while this beat runs: same word, so earlier check-ins stay valid."}</p></div>${w.reopened ? "" : `<button type="button" class="bt-btn bt-btn--secondary" data-act="ci-reopen">Reopen check-in</button>`}</div>`;
  } else {
    tag = `<span class="bt-badge bt-badge--gray">Ready</span>`;
    body = `<div class="lc-idle"><div><b>Open when you are ready to talk to chat</b><p>The word appears here and on the stream view when you open it.</p>
      <div class="lc-chips lc-len" role="group" aria-label="Window length">${choices.map((m) => `<button type="button" class="lc-chip" data-act="ci-len" data-m="${m}" aria-pressed="${len === m}">${m} min</button>`).join("")}</div></div>
      <button type="button" class="bt-btn bt-btn--primary lc-big" data-act="ci-open">Open check-in</button></div>`;
  }
  return crPanelHtml({ id: "lc-stage", cls, title, icon: "checkin", tagHtml: tag, bodyHtml: body + stopRow });
}

/** Ring, countdown, counts by room: filled in place so they tick instead of redrawing. */
function applyStage(ctx: Ctx) {
  if (ctx.mode !== "live") return;
  const box = ctx.root.querySelector<HTMLElement>(".lc-word");
  const pub = ctx.snap.pub!;
  if (box) {
    const closes = Number(box.dataset.closes), lenMs = Number(box.dataset.length), left = Math.max(0, closes - Date.now());
    const ring = box.querySelector<HTMLElement>(".bt-checkin-ring"); ring?.style.setProperty("--ring", Math.min(1, left / lenMs).toFixed(3));
    const cd = box.querySelector("[data-cd]"); const t = fmtClock(left); if (cd && cd.textContent !== t) cd.textContent = t;
    const beat = beatNow(ctx);
    const bc = box.querySelector("[data-bc]"); const n = String(beat ? pub.counts.byBeat?.[beat] || 0 : 0); if (bc && bc.textContent !== n) bc.textContent = n;
    const byRoom = pub.counts.byRoom || {}, max = Math.max(1, ...ROOMS.map((r) => byRoom[r] || 0));
    ctx.root.querySelectorAll<HTMLElement>("[data-r]").forEach((el) => { el.textContent = String(byRoom[el.dataset.r!] || 0); });
    ctx.root.querySelectorAll<HTMLElement>("[data-rbar]").forEach((el) => el.style.setProperty("--f", Math.min(1, (byRoom[el.dataset.rbar!] || 0) / max).toFixed(3)));
    if (left <= 0 && !box.dataset.ended) { box.dataset.ended = "1"; setTimeout(() => ctx.render(), 400); }
    const word = box.querySelector<HTMLElement>("[data-word]");
    if (word && !word.dataset.shown) { word.dataset.shown = "1"; scramble(word); }
  }
  const brb = ctx.root.querySelector("[data-brb]"), until = ctx.snap.control?.brbUntil;
  if (brb && until) brb.textContent = until > Date.now() ? fmtClock(until - Date.now()) : "0:00";
}
/** The word scrambles, then settles (none under reduced motion). */
function scramble(el: HTMLElement) {
  const word = el.dataset.word || "";
  if (reduced() || !word) return;
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let n = 0;
  const t = setInterval(() => { n++; el.textContent = [...word].map((c, i) => (i < n / 2 ? c : A[Math.floor(Math.random() * 26)])).join(""); if (n >= word.length * 2) { clearInterval(t); el.textContent = word; } }, 40);
}

/* ------------------------------------------------------------------ beats, scene, launch, banners */
function beatActs(ctx: Ctx): string {
  if (ctx.mode !== "live") return "";
  const pub = ctx.snap.pub!, nk = nextBeatKey(ctx), beat = beatNow(ctx);
  const out: string[] = [];
  if (nk) {
    out.push(`<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-act="beat-begin" data-beat="${nk}">Begin ${esc(BEAT_LABEL[nk])}</button>`);
    if (nk === "break1" || nk === "break2") out.push(`<button type="button" class="bt-link-btn" data-act="beat-skip" data-beat="${nk}">Skip ${esc(BEAT_LABEL[nk])}</button>`, `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="beat-begin" data-beat="end">Begin End</button>`);
  }
  if ((beat === "break1" || beat === "break2") && !pub.game) out.push(`<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="back-to-game">Back to the game</button>`);
  return out.join("");
}

function sceneHtml(ctx: Ctx): string {
  if (ctx.mode !== "live") return "";
  const c = ctx.snap.control, pinned = c?.pinned || "auto";
  const chips = SCENES.map(([k, l]) => `<button type="button" class="lc-chip" data-act="scene" data-scene="${k}" aria-pressed="${pinned === k}">${esc(l)}</button>`).join("");
  const brb = `<div class="lc-brb"><span id="lc-brb-l">Be right back timer</span><span class="lc-chips" role="group" aria-labelledby="lc-brb-l">${[5, 10, 15].map((m) => `<button type="button" class="lc-chip" data-act="brb-min" data-m="${m}" aria-pressed="${brbMin === m}">${m} min</button>`).join("")}</span>${pinned === "brb" && c?.brbUntil ? `<b class="lc-brb-t" data-brb></b>` : ""}</div>`;
  return crPanelHtml({ id: "lc-scene", cls: "lc-a-scene", title: "Scene", icon: "video", tagHtml: `<small class="lc-hint">${pinned === "auto" ? "Auto follows the beat" : "Pinned"}</small>`, bodyHtml: `<div class="lc-chips" role="group" aria-label="Stream view scene">${chips}</div>${brb}` });
}

function launchPanel(ctx: Ctx): string {
  const tiles = [
    { id: "questions", icon: "❓", title: "Questions", sub: "Coming with live activities", state: "off" },
    { id: "hotseat", icon: "🔥", title: "Hot Seat", sub: "Coming with live activities", state: "off" },
  ];
  const live = ctx.mode === "live";
  return crPanelHtml({ id: "lc-launch", cls: "lc-a-launch", title: "Launch panel", icon: "launch", tagHtml: `<small class="lc-hint">${live ? "One on stream at a time" : "Ready when you are live"}</small>`, bodyHtml: `${launchHtml({ tiles: tiles as any })}<div class="lc-empty lc-empty--sm">${mascotHtml()}<p>Questions and Hot Seat arrive with the live activities.</p></div>` });
}

function bannersHtml(ctx: Ctx): string {
  const c = ctx.snap.control, s = ctx.snap.live;
  if (ctx.mode !== "live" || !c || !s) return "";
  const now = Date.now(), out: string[] = [];
  if (c.twitch?.status === "offline" && s.rooms.includes("twitch") && s.type !== "backstage") {
    const since = c.twitch.offlineSince || now;
    if (now - since >= 3 * 60000 && dismissedBanner !== `tw${since}`) out.push(`<div class="bt-notice lc-gold" role="alert"><b>Twitch says you're offline</b> (for ${esc(fmtDur(now - since))}). If Streamlabs or the PC crashed, restart it: nothing ends on its own for 12 hours.<div class="lc-banner-acts"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="stop">Stop the stream</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-act="banner-wait" data-k="tw${since}">Wait</button></div></div>`);
  }
  if (c.yt?.status === "failed") out.push(`<div class="bt-notice lc-gold" role="status"><b>The YouTube event wasn't found.</b> <button type="button" class="bt-link-btn" data-act="yt-retry" data-id="${esc(s.id)}">Retry</button></div>`);
  return out.join("");
}

function ttForm(ctx: Ctx): string {
  const c = ctx.snap.control;
  if (ctx.mode !== "live" || !ctx.tiktokOn) return "";
  return `<form class="lc-tt-form" data-tt-form><label class="bt-label" for="lc-tt-n">TikTok viewers (typed by the TikTok lead, or you)</label><div class="lc-tt-row"><input class="bt-input" id="lc-tt-n" type="number" min="0" step="1" inputmode="numeric" value="${c?.tiktok ? c.tiktok.viewers : ""}"><button type="submit" class="bt-btn bt-btn--secondary bt-btn--sm">Set</button></div></form>`;
}

/* ------------------------------------------------------------------ the wrap-up */
function wrapHtml(ctx: Ctx): string {
  const p = ctx.snap.pub;
  const w = ctx.wrap || (p ? { durationMs: (p.actualEnd || 0) - (p.actualStart || 0), peak: p.peak, checkins: p.counts.total, byBeat: p.counts.byBeat as Record<string, number>, title: p.title || "The stream" } : null);
  if (!w) return "";
  const max = Math.max(1, ...BEATS.map((k) => w.byBeat[k] || 0));
  const bars = BEATS.map((k, i) => `<div class="lc-wbar"><b>${(w.byBeat[k] || 0).toLocaleString("en-US")}</b><i style="--h:${Math.round(((w.byBeat[k] || 0) / max) * 100)};animation-delay:${i * 120}ms"></i>${esc(BEAT_LABEL[k])}</div>`).join("");
  const left = ctx.role === "owner" ? (ctx.hooks.unticked?.() as { beat: string; text: string }[] | undefined) || [] : [];
  const leftPanel = ctx.role === "owner" ? crPanelHtml({ title: "Left on your list", icon: "checklist", bodyHtml: left.length ? `<ul class="lc-missed">${left.map((l) => `<li>${esc(l.text)} <small>(${esc(l.beat)})</small></li>`).join("")}</ul><p class="lc-hint">The templates didn't change; the next stream starts fresh.</p>` : `<p class="lc-hint">Everything on your list was ticked.</p>` }) : "";
  return `<div class="lc-wrap">${mascotHtml()}<div class="lc-wrap-stamp">${stampHtml({ label: "Wrapped", sub: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }), tone: "lime" })}</div>
    <h2 class="bt-title bt-title--hero">Stream wrapped</h2><p class="lc-hero-sub">${esc(w.title)} ran ${esc(fmtDur(w.durationMs))}. The site is off air.</p>
    ${readoutsHtml([{ key: "dur", value: fmtDur(w.durationMs), label: "On air" }, { key: "peak", value: w.peak, label: "Peak watching" }, { key: "ci", value: w.checkins, label: "Check-ins" }], { cols: 3 })}
    <div class="lc-wrap-grid">${crPanelHtml({ title: "Check-ins by beat", icon: "stats", bodyHtml: `<div class="lc-wbars">${bars}</div>` })}${leftPanel}</div>
    <div class="lc-wrap-acts"><button type="button" class="bt-btn bt-btn--primary" data-act="wrap-back">Back to the controls</button></div></div>`;
}

/* ------------------------------------------------------------------ actions */
export function initLive(ctx: Ctx) {
  ctx.hooks.liveStage = liveStageHtml;
  ctx.hooks.beatActs = beatActs;
  ctx.hooks.sceneHtml = sceneHtml;
  ctx.hooks.launchHtml = launchPanel;
  ctx.hooks.bannersHtml = bannersHtml;
  ctx.hooks.ttForm = ttForm;
  ctx.hooks.wrapHtml = wrapHtml;
  ctx.hooks.tick = () => applyStage(ctx);
  ctx.after.push(() => {
    applyStage(ctx);
    const gp = ctx.root.querySelector<HTMLElement>('[data-gp="switch"]');
    if (gp && !gp.dataset.wired) {
      gp.dataset.wired = "1";
      initGamePicker(gp, ctx, { actionLabel: "Switch", onPick: (g) => switchGame(ctx, g.gameId, g.title) });
    }
    const w = ctx.root.querySelector<HTMLElement>(".lc-wrap-stamp");
    if (w && !w.dataset.done) { w.dataset.done = "1"; if (!reduced()) burst(w, { n: 28 }); }
  });
  const call = async (btn: HTMLElement, label: string, name: string, data: unknown, after?: (r: any) => void) => {
    await withBusy(btn as HTMLButtonElement, label, async () => {
      try { const r = await ctx.api.call(name, data); after?.(r); await ctx.refresh(); }
      catch (err) { toast(messageFor(err), { kind: "error" }); await ctx.refresh(); }
    });
  };
  const A = ctx.acts;
  A["ci-len"] = (b) => { len = Number(b.dataset.m); ctx.render(); };
  A["ci-open"] = (b) => call(b, "Opening…", "liveCheckInWindow", { action: "open", lengthMinutes: len }, () => ctx.hooks.shortcut?.("openCheckin"));
  A["ci-extend"] = (b) => call(b, "Adding…", "liveCheckInWindow", { action: "extend" });
  A["ci-close"] = (b) => call(b, "Closing…", "liveCheckInWindow", { action: "close" });
  A["ci-reopen"] = (b) => call(b, "Reopening…", "liveCheckInWindow", { action: "reopen" });
  A["beat-begin"] = (b) => call(b, "Starting…", "liveBeat", { action: "begin", beat: b.dataset.beat });
  A["beat-skip"] = (b) => call(b, "Skipping…", "liveBeat", { action: "skip", beat: b.dataset.beat });
  A["back-to-game"] = (b) => call(b, "Going back…", "liveBeat", { action: "backToGame" });
  A["scene"] = (b) => call(b, "…", "liveScene", { scene: b.dataset.scene, ...(b.dataset.scene === "brb" ? { brbMinutes: brbMin } : {}) });
  A["brb-min"] = (b) => { brbMin = Number(b.dataset.m); if (ctx.snap.control?.pinned === "brb") void call(b, "…", "liveScene", { scene: "brb", brbMinutes: brbMin }); else ctx.render(); };
  A["switch-game"] = (b) => switchGame(ctx, b.dataset.id!, b.dataset.title || "");
  A["banner-wait"] = (b) => { dismissedBanner = b.dataset.k || ""; ctx.render(); };
  A["wrap-back"] = () => { ctx.wrapDismissed = true; ctx.wrap = null; void ctx.refresh(); };
  A["stop"] = () => {
    void askLive({
      title: "Stop the stream?", message: "Records the end time, closes anything still open and turns the live lights off. Then you'll see the wrap-up.",
      confirmLabel: "Stop the stream", busyLabel: "Stopping…",
      onConfirm: async () => {
        try {
          const r = await ctx.api.call<{ durationMs: number; peak: number; checkins: number; checkinsByBeat: Record<string, number> }>("stopStream", {});
          ctx.wrapDismissed = false;
          ctx.wrap = { durationMs: r.durationMs, peak: r.peak, checkins: r.checkins, byBeat: r.checkinsByBeat || {}, title: ctx.snap.live?.title || "The stream" };
          ctx.hooks.rememberChecklist?.();
        } catch (err) { throw new Error(messageFor(err)); }
        await ctx.refresh();
      },
    });
  };
  A["after-show"] = () => {
    void askLive({
      title: "Start the after-show?", message: "Ends the public stream and starts the Fan Club after-show in one step. Then in Streamlabs: stop, turn off Twitch and the vertical output, pick the new unlisted event and go live (about a minute's gap). End TikTok LIVE Studio separately.",
      confirmLabel: "Start the after-show", busyLabel: "Starting…",
      onConfirm: async () => {
        try { await ctx.api.call("liveAfterShow", {}); } catch (err) { throw new Error(messageFor(err)); }
        await ctx.refresh(); ctx.hooks.wereLive?.();
      },
    });
  };
  ctx.root.addEventListener("submit", async (e) => {
    const f = (e.target as HTMLElement).closest<HTMLFormElement>("[data-tt-form]");
    if (!f) return;
    e.preventDefault();
    const n = Number(f.querySelector<HTMLInputElement>("input")!.value);
    if (!Number.isInteger(n) || n < 0) { toast("Type the viewer count as a whole number.", { kind: "error" }); return; }
    try { await ctx.api.call("liveViewerEntry", { viewers: n }); toast("TikTok viewers saved."); await ctx.refresh(); }
    catch (err) { toast(messageFor(err), { kind: "error" }); }
  });
  void plural; void gamePickerHtml;
}

async function switchGame(ctx: Ctx, gameId: string, title: string) {
  try { await ctx.api.call("switchGame", { game: { gameId } }); toast(`Switched to ${title || "the game"}.`); await ctx.refresh(); }
  catch (err) { toast(messageFor(err), { kind: "error" }); }
}
