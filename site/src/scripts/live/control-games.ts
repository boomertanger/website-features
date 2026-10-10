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
    // the running game's run controls and the Waiting panel: btChatGames.mountRun (part 7), in one element that outlives this redraw (syncRunPanel)
    return crPanelHtml({ id: "lc-launch", cls: "lc-a-launch", title: "Launch panel", icon: "launch", tagHtml: `<small class="lc-hint">${hint}</small>`, bodyHtml: body + `<div data-cgrun-host></div>` });
  };

  // ---- the run controls (btChatGames.mountRun, part 7; the same panels the Mod Deck mounts): Questions, Hot Seat, Would You Rather and Predictions
  // follow the run with their own listeners (cg-watch.ts). The panel lives in one element that's moved into each redraw of the launch panel, so a redraw
  // never restarts them.
  const runEl = document.createElement("div");
  runEl.className = "lc-cgrun";
  function syncRunPanel() {
    const host = ctx.root.querySelector<HTMLElement>("[data-cgrun-host]");
    if (host && runEl.parentElement !== host) host.appendChild(runEl);
    const cg = window.btChatGames as any;
    if (!cg?.mountRun) return;
    const live = !!liveId();
    const g = live && ctx.snap.pub?.streamId === liveId() ? ctx.snap.pub?.chatGame || null : null;
    cg.mountRun(runEl, { chatGame: g, waiting: live ? ctx.snap.pub?.chatGameWaiting || [] : [], may: live && canRun(), owner: ctx.role === "owner", preview });
  }
  ctx.after.push(syncRunPanel);

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
  void import("./chatgames-site").then(() => syncRunPanel());
}
