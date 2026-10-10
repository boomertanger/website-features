// /live/control: the launch panel's Chat Games tiles (docs/specs/chat-games.md §3, §9; part 1). One tile per ENABLED format in the registry
// (chatGames/main/formats, by order; nothing is hard-coded here), the running one from public/live.chatGame. Start, Swap and End are for the owner
// and for whoever is the Captain right now (captainNow.uid on the live stream's private/duty, any grade); everyone else on this page (A2+) sees the
// tiles read-only. Start opens the format's launch dialog through window.btChatGames.openLaunch; End goes through window.btChatGames.end.
// The callables check all of this again. Preview (?as=…): ?formats=1 shows two sample tiles.
import { db, doc, getDoc, getDocs, collection, SITE_ID } from "../../lib/db";
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { launchHtml, initLaunch } from "../../../../shared/ui/launch.js";
import type { Ctx } from "./state";
import { esc, mascotHtml } from "./ui";
import { loadRunPanel, runPanelHtml, wireRunPanel, type RunPanelData } from "./cg-questions";
import { watchRun } from "./questions-data";
import { watchHsPanel, hsPanelHtml, wireHsPanel, type HsPanelData } from "./cg-hotseat";
import { watchChoicePanel, choicePanelHtml, wireChoicePanel, waitingPanelHtml, wireWaitingPanel, type ChoicePanelData } from "./cg-choices";

interface Fmt { id: string; title: string; icon: string; blurb: string; order: number }
const CAPTAIN_MS = 15000;

export function initGames(ctx: Ctx) {
  let formats: Fmt[] = [], captainUid: string | null = null, captainFor = "", captainAt = 0, loading = false;
  const preview = !!ctx.api.preview;
  const q = () => new URLSearchParams(location.search);

  async function loadFormats() {
    if (preview) {
      formats = q().get("formats") === "1" ? [{ id: "hot-seat", title: "Hot Seat", icon: "🔥", blurb: "Three answer, everyone votes", order: 2 }, { id: "would-you-rather", title: "Would You Rather", icon: "⚖️", blurb: "Two options, the split on stream", order: 3 }] : [];
      return;
    }
    try {
      const snap = await getDocs(collection(db, "sites", SITE_ID, "chatGames", "main", "formats"));
      formats = snap.docs.filter((d: any) => d.get("enabled") === true).map((d: any) => ({ id: d.id, title: String(d.get("title") || d.id), icon: String(d.get("icon") || "🎲"), blurb: String(d.get("blurb") || ""), order: Number(d.get("order")) || 0 }))
        .sort((a, b) => a.order - b.order);
    } catch { formats = []; }
  }
  /** Who is Captain on the live stream (crew and the owner read private/duty). Re-read every 15 s while live. */
  async function loadCaptain(sid: string) {
    if (preview) { captainUid = q().get("captain") === "1" ? ctx.uid : null; captainFor = sid; captainAt = Date.now(); return; }
    try { const s = await getDoc(doc(db, "sites", SITE_ID, "streams", sid, "private", "duty")); captainUid = s.exists() ? (s.get("captainNow")?.uid ?? null) : null; }
    catch { captainUid = null; }
    captainFor = sid; captainAt = Date.now();   // also after a failed read, so a refusal never loops
  }
  const liveId = () => (ctx.mode === "live" ? ctx.snap.live?.id || "" : "");
  const canRun = () => ctx.role === "owner" || (!!captainUid && captainUid === ctx.uid);

  ctx.hooks.launchHtml = () => {
    const live = !!liveId(), may = live && canRun();
    const g = live && ctx.snap.pub?.streamId === liveId() ? ctx.snap.pub?.chatGame || null : null;
    const list = [...formats];
    if (g && !list.some((f) => f.id === g.formatId)) list.push({ id: g.formatId, title: g.title || g.formatId, icon: "🎲", blurb: "", order: 999 });
    const why = !live ? "Ready when you are live" : may ? "" : "The Captain or the owner starts games";
    const tiles = list.map((f) => {
      const running = !!g && g.formatId === f.id;
      return { id: `cg:${f.id}`, icon: f.icon, title: f.title, sub: running ? (g!.title || f.blurb) : why || f.blurb, state: running ? (may ? "running" : "off") : may ? "idle" : "off", action: g ? "Swap" : "Start", statusText: may ? "On stream · End" : "On stream" };
    });
    const body = tiles.length
      ? launchHtml({ tiles: tiles as any, label: "Chat Games" })
      : `<div class="lc-empty lc-empty--sm">${mascotHtml()}<p>Chat Games switch on here as each one ships: Questions and Hot Seat first.</p></div>`;
    const hint = live ? (g ? `${esc(g.title || "A game")} is on stream` : "One on stream at a time") : "Ready when you are live";
    // the running format's run controls (Questions: the card on stream, Answered / Skip / Pin next), patched in place by syncRun()
    const runHost = g && g.formatId === "questions" ? `<div class="lq-runhost" data-qrun-host>${runHtml}</div>`
      : g && g.formatId === "hot-seat" ? `<div class="lhs-runhost" data-hsrun-host>${hsHtml}</div>`
      : g && CHOICE_IDS.includes(g.formatId) ? `<div class="lcg-runhost" data-chrun-host>${chHtml}</div>` : "";
    // locked Predictions waiting for a result (part 5), each openable to settle
    const waiting = live ? ctx.snap.pub?.chatGameWaiting || [] : [];
    const waitHost = waiting.length ? `<div class="lcg-waithost" data-cgwait-host>${waitingPanelHtml(waiting, may)}</div>` : "";
    return crPanelHtml({ id: "lc-launch", cls: "lc-a-launch", title: "Launch panel", icon: "launch", tagHtml: `<small class="lc-hint">${hint}</small>`, bodyHtml: body + runHost + waitHost });
  };

  // ---- the Questions run panel: the run doc is watched (cg-watch.ts), so a card change redraws at once; Up next (the lanes, which change as members
  // ask and vote) is re-read with it and every 15 s while the tab is visible (crew only). Patched in place, no page redraw.
  let runHtml = "", runFor = "", runData: RunPanelData | null = null, runBusy = false, runTimer = 0, runWatch = "", runStop: (() => void) | null = null;
  async function syncRun(force = false) {
    const g = ctx.snap.pub?.chatGame;
    if (!g || g.formatId !== "questions" || !liveId()) { runHtml = ""; runData = null; runFor = ""; runStop?.(); runStop = null; runWatch = ""; if (runTimer) { clearInterval(runTimer); runTimer = 0; } return; }
    if (runWatch !== g.runId) { runStop?.(); runWatch = g.runId; let first = true; runStop = watchRun(g.runId, preview, () => { if (first) { first = false; return; } void syncRun(true); }); }
    const key = `${g.runId}|${g.state}|${g.round}`;
    if (runBusy || (!force && key === runFor)) return;
    runBusy = true;
    try { runData = await loadRunPanel(g.runId, preview); runFor = key; runHtml = runData ? runPanelHtml(runData, canRun()) : ""; }
    catch { /* keep the last */ }
    finally { runBusy = false; }
    const host = ctx.root.querySelector<HTMLElement>("[data-qrun-host]");
    if (host && host.innerHTML !== runHtml) host.innerHTML = runHtml;
    if (!runTimer) runTimer = window.setInterval(() => { if (!document.hidden) void syncRun(true); }, 15000);
  }
  ctx.after.push(() => {
    const host = ctx.root.querySelector<HTMLElement>("[data-qrun-host]");
    if (host) wireRunPanel(host, () => runData?.run || null, () => void syncRun(true), preview);
    void syncRun();
  });

  // ---- the Would You Rather and Predictions run panels (part 5): the run doc and staff/{r<n> | p} are watched (cg-watch.ts), not polled
  const CHOICE_IDS = ["would-you-rather", "predictions"];
  let chHtml = "", chData: ChoicePanelData | null = null, chFor = "", chStop: (() => void) | null = null, chTimer = 0;
  const paintCh = () => {
    chHtml = chData ? choicePanelHtml(chData, canRun()) : "";
    const host = ctx.root.querySelector<HTMLElement>("[data-chrun-host]");
    if (host && host.innerHTML !== chHtml) host.innerHTML = chHtml;
  };
  function syncCh() {
    const g = ctx.snap.pub?.chatGame;
    if (!g || !CHOICE_IDS.includes(g.formatId) || !liveId()) { chStop?.(); chStop = null; chFor = ""; chHtml = ""; chData = null; if (chTimer) { clearInterval(chTimer); chTimer = 0; } return; }
    if (chFor !== g.runId) { chStop?.(); chFor = g.runId; chStop = watchChoicePanel(g.runId, g.formatId, preview, (p) => { chData = p; paintCh(); }); }
    else paintCh();
    if (!chTimer) chTimer = window.setInterval(() => {
      if (document.hidden) return;
      const c = chData?.run.closesAt;
      if (c && !chData?.run.paused) ctx.root.querySelectorAll<HTMLElement>("[data-cg-left]").forEach((t) => { const l = Math.max(0, c - Date.now()); t.textContent = `${Math.floor(l / 60000)}:${String(Math.floor((l % 60000) / 1000)).padStart(2, "0")}`; });
    }, 1000);
  }
  ctx.after.push(() => {
    const host = ctx.root.querySelector<HTMLElement>("[data-chrun-host]");
    if (host) wireChoicePanel(host, () => chData?.run || null, preview, () => ctx.role === "owner");
    const wait = ctx.root.querySelector<HTMLElement>("[data-cgwait-host]");
    if (wait) wireWaitingPanel(wait, preview);
    syncCh();
  });

  // ---- the Hot Seat run panel (part 4): the run doc and the current round doc are watched (cg-watch.ts), not polled; the clock ticks locally
  let hsHtml = "", hsData: HsPanelData | null = null, hsFor = "", hsStop: (() => void) | null = null, hsTimer = 0;
  const paintHs = () => {
    hsHtml = hsData ? hsPanelHtml(hsData, canRun()) : "";
    const host = ctx.root.querySelector<HTMLElement>("[data-hsrun-host]");
    if (host && host.innerHTML !== hsHtml) host.innerHTML = hsHtml;
  };
  function syncHs() {
    const g = ctx.snap.pub?.chatGame;
    if (!g || g.formatId !== "hot-seat" || !liveId()) {
      hsStop?.(); hsStop = null; hsFor = ""; hsHtml = ""; hsData = null; if (hsTimer) { clearInterval(hsTimer); hsTimer = 0; } return;
    }
    if (hsFor !== g.runId) { hsStop?.(); hsFor = g.runId; hsStop = watchHsPanel(g.runId, preview, (p) => { hsData = p; paintHs(); }); }
    else paintHs();
    if (!hsTimer) hsTimer = window.setInterval(() => {
      if (document.hidden) return;
      const t = ctx.root.querySelector<HTMLElement>("[data-hs-left]"), c = hsData?.run.closesAt;
      if (t && c) t.textContent = `${Math.floor(Math.max(0, c - Date.now()) / 60000)}:${String(Math.floor((Math.max(0, c - Date.now()) % 60000) / 1000)).padStart(2, "0")}`;
    }, 1000);
  }
  ctx.after.push(() => {
    const host = ctx.root.querySelector<HTMLElement>("[data-hsrun-host]");
    if (host) wireHsPanel(host, () => hsData?.run || null, () => {}, preview);   // the listeners bring every change
    syncHs();
  });

  ctx.after.push(() => {
    const slot = ctx.root.querySelector<HTMLElement>('[data-slot="launch"]');
    if (slot) initLaunch(slot as any, { onLaunch: (id: string, state: string) => launch(id, state) });
    const sid = liveId();
    if (sid && !loading && (sid !== captainFor || Date.now() - captainAt > CAPTAIN_MS)) {
      const before = captainUid;
      loading = true;
      void loadCaptain(sid).finally(() => { loading = false; if (captainUid !== before) ctx.render(); });   // redraw only when the Captain changed
    }
  });

  function launch(id: string, state: string) {
    const cg = window.btChatGames as any;
    if (!id.startsWith("cg:") || !cg || !canRun()) return;
    const formatId = id.slice(3), g = ctx.snap.pub?.chatGame;
    if (state === "running" && g) void cg.end({ runId: g.runId, title: g.title });
    else void cg.openLaunch({ formatId, streamId: liveId(), title: formats.find((f) => f.id === formatId)?.title || formatId });
  }

  void loadFormats().then(() => ctx.render());
  void import("./chatgames-site");
}
