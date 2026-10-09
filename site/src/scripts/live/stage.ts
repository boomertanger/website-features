// The main control (the centre of the Cockpit). Before the stream (docs/specs/control-room.md §3.1 to §3.3): today's streams to pick (scheduled, within 12
// hours), readiness chips, Running late (+5/+10/+15/+30 or a time: delayStream), Cancel (confirmAction with a reason, not red: cancelStream), Start an
// unscheduled stream (createAdhocStream, then its YouTube event shows until the owner has picked it in Streamlabs) and the Start dialog (startStream) with
// the WE'RE LIVE power-up. While live the same slot shows the check-in (live.ts registers it as hooks.liveStage).
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { burst } from "../../../../shared/ui/burst.js";
import { modalHeader } from "../../../../shared/ui/modal.js";
import type { Ctx } from "./state";
import { current, picked } from "./state";
import { BEAT_LABEL, ROOMS, ROOM_LABEL, fmtTime, plural, seatsOf, tiktokOf, type LStream, type PlatformStatus, type Room } from "./model";
import { esc, openLive, askLive, withBusy, toast, messageFor, mascotHtml, reduced } from "./ui";
import { gamePickerHtml, initGamePicker, type Pick } from "./gamepick";

const LATE = [5, 10, 15, 30];

function readiness(s: LStream) {
  const seats = seatsOf(s);
  const chip = (ok: boolean | null, text: string, extra = "") => `<span class="lc-ready-chip" data-ok="${ok === null ? "n" : ok ? "y" : "n"}"><b aria-hidden="true">${ok ? "✓" : "!"}</b> ${text}${extra}</span>`;
  const yt = !s.youtube ? chip(false, "YouTube event: none yet")
    : s.youtube.status === "ok" ? chip(true, "YouTube event ready")
    : s.youtube.status === "pending" ? chip(false, "YouTube event on its way")
    : chip(false, "YouTube event failed", ` <button type="button" class="bt-link-btn" data-act="yt-retry" data-id="${esc(s.id)}">Retry</button>`);
  const crew = seats.total ? chip(seats.filled >= seats.total, `Crew ${seats.filled} of ${seats.total} seats`) : chip(true, "No crew seats needed");
  const open = [seats.captainOpen ? "Captain" : "", ...seats.open.map((r) => `${ROOM_LABEL[r]} lead`)].filter(Boolean);
  const openChip = open.length ? chip(false, `Open: ${esc(open.join(", "))}`) : chip(true, "No open seats");
  const words = chip(true, "Words ready");
  return `<div class="lc-ready" aria-label="Before you start">${yt}${crew}${openChip}${words}</div>`;
}

function idleHtml(ctx: Ctx) {
  const list = ctx.todays;
  if (!list.length) {
    return `<div class="lc-empty">${mascotHtml()}<p>No stream is scheduled in the next 12 hours.</p><button type="button" class="bt-btn bt-btn--primary" data-act="adhoc">Start an unscheduled stream</button></div>`;
  }
  const sel = picked(ctx)!;
  const rows = list.map((s) => `<button type="button" class="lc-pick-row${s.id === sel.id ? " is-on" : ""}" data-act="pick" data-id="${esc(s.id)}" aria-pressed="${s.id === sel.id}">`
    + `<span class="bt-badge bt-badge--${s.id === sel.id ? "gold" : "gray"}">${esc(fmtTime(s.start))}</span><span><b>${esc(s.title)}</b><small>${esc(plural(s.plannedGames.length, "game"))} planned · ${s.type === "backstage" ? "Backstage · Fan Club" : esc(s.rooms.map((r) => ROOM_LABEL[r]).join(", "))}${s.adhoc ? " · Unscheduled" : ""}${s.delay ? " · Delayed" : ""}</small></span>`
    + `<span class="bt-badge bt-badge--${s.id === sel.id ? "blue" : "gray"}">${s.id === sel.id ? "Picked" : "Pick"}</span></button>`).join("");
  const late = `<div class="lc-late"><span id="lc-late-l">Running late?</span><span class="lc-chips" role="group" aria-labelledby="lc-late-l">${LATE.map((m) => `<button type="button" class="lc-chip" data-act="late" data-m="${m}">+${m} min</button>`).join("")}<button type="button" class="lc-chip" data-act="late-custom">A time…</button></span><button type="button" class="bt-link-btn" data-act="cancel-stream">Cancel this stream</button></div>`;
  return `<div class="lc-pick" role="group" aria-label="Today's streams">${rows}</div>${readiness(sel)}${late}`
    + `<div class="lc-start-row"><button type="button" class="bt-btn bt-btn--primary lc-big" data-act="start">Start the stream</button><button type="button" class="bt-link-btn" data-act="adhoc">Start an unscheduled stream</button></div>`;
}

export function stageHtml(ctx: Ctx): string {
  if (ctx.mode === "live") {
    const f = ctx.hooks.liveStage as undefined | ((c: Ctx) => string);
    if (f) return f(ctx);
    const st = current(ctx)!;
    return crPanelHtml({ id: "lc-stage", cls: "lc-a-stage", title: "Live", icon: "controls", bodyHtml: `<div class="lc-pick-row is-on"><span class="bt-badge bt-badge--gold">${esc(fmtTime(st.start))}</span><div><b>${esc(st.title)}</b></div></div>` });
  }
  return crPanelHtml({ id: "lc-stage", cls: "lc-a-stage", title: "Tonight", icon: "controls", tagHtml: ctx.todays.length ? `<small class="lc-hint">Pick the stream, then start it</small>` : "", bodyHtml: idleHtml(ctx) });
}

/* ------------------------------------------------------------------ dialogs and actions */
async function delay(ctx: Ctx, minutes: number) {
  const s = picked(ctx); if (!s) return;
  try {
    await ctx.api.call("delayStream", { streamId: s.id, startMs: s.start + minutes * 60000, endMs: s.end + minutes * 60000 });
    toast(`Delayed by ${minutes} minutes. /schedule shows the new time.`);
    await ctx.refresh();
  } catch (err) { toast(messageFor(err), { kind: "error" }); }
}

function lateDialog(ctx: Ctx) {
  const s = picked(ctx); if (!s) return;
  const { modal, close } = openLive({ title: "Running late", content: `${modalHeader("Running late", esc(`${s.title} is set for ${fmtTime(s.start)}`))}<div class="bt-field"><label class="bt-label" for="lc-late-n">Push it back by (minutes)</label><input class="bt-input" id="lc-late-n" type="number" min="1" max="240" step="1" value="20" inputmode="numeric"></div><p class="bt-fine bt-fine--left" data-err role="alert"></p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Never mind</button><button type="button" class="bt-btn bt-btn--primary" data-do>Delay</button></div>` });
  const n = modal.querySelector<HTMLInputElement>("#lc-late-n")!;
  modal.querySelector<HTMLButtonElement>("[data-do]")!.addEventListener("click", async (e) => {
    const m = Math.round(Number(n.value));
    if (!Number.isFinite(m) || m < 1 || m > 240) { modal.querySelector("[data-err]")!.textContent = "Enter 1 to 240 minutes."; return; }
    await withBusy(e.currentTarget as HTMLButtonElement, "Delaying…", () => delay(ctx, m));
    close();
  });
}

async function cancelDialog(ctx: Ctx) {
  const s = picked(ctx); if (!s) return;
  await askLive({
    title: `Cancel ${s.title}?`, message: `It stays on /schedule as a record, and members are told. Nothing is deleted.`,
    bodyHtml: `<div class="bt-field"><label class="bt-label" for="lc-cancel-why">Reason (shown on the schedule, optional)</label><input class="bt-input" id="lc-cancel-why" maxlength="140" autocomplete="off"></div>`,
    cancelLabel: "Keep it", confirmLabel: "Cancel the stream", busyLabel: "Cancelling…",
    onConfirm: async (modal: HTMLElement) => {
      const reason = modal.querySelector<HTMLInputElement>("#lc-cancel-why")?.value.trim();
      try { await ctx.api.call("cancelStream", { streamId: s.id, ...(reason ? { reason } : {}) }); } catch (err) { throw new Error(messageFor(err)); }
      toast("Cancelled. It stays on /schedule as a record.");
      await ctx.refresh();
    },
  });
}

/** Step one of an unscheduled stream, then its YouTube event until the owner has picked it in Streamlabs. */
function adhocDialog(ctx: Ctx) {
  const f = { type: "platform" as "platform" | "backstage", rooms: new Set<Room>(ROOMS), first: null as Pick | null };
  const { modal, close, setBeforeClose } = openLive({ title: "Start an unscheduled stream", wide: true, content: "" });
  let createdId = "";
  const form = () => {
    modal.innerHTML = `${modalHeader("Start an unscheduled stream", "It starts now, but isn't live until you press Start. Its YouTube event is made at once so you can pick it in Streamlabs.")}
      <form class="lc-form" novalidate>
        <div class="bt-field"><label class="bt-label" for="lc-ad-title">Title</label><input class="bt-input" id="lc-ad-title" maxlength="80" autocomplete="off" placeholder="Surprise stream"></div>
        <div class="bt-field"><span class="bt-label" id="lc-ad-type-l">Type</span><div class="bt-pills" role="group" aria-labelledby="lc-ad-type-l"><button type="button" data-type="platform" class="${f.type === "platform" ? "is-on" : ""}" aria-pressed="${f.type === "platform"}">Platform</button><button type="button" data-type="backstage" class="${f.type === "backstage" ? "is-on" : ""}" aria-pressed="${f.type === "backstage"}">Backstage</button></div></div>
        <div class="bt-field" data-rooms-field${f.type === "backstage" ? " hidden" : ""}><span class="bt-label" id="lc-ad-rooms-l">Chats</span><div class="lc-chips" role="group" aria-labelledby="lc-ad-rooms-l">${ROOMS.map((r) => `<button type="button" class="lc-chip" data-room="${r}" aria-pressed="${f.rooms.has(r)}">${esc(ROOM_LABEL[r])}</button>`).join("")}</div></div>
        <p class="bt-fine bt-fine--left" data-back-note${f.type === "backstage" ? "" : " hidden"}>Backstage is on the site only, for the Fan Club.</p>
        <div class="bt-field" data-aud-field${f.type === "backstage" ? " hidden" : ""}><label class="bt-label" for="lc-ad-aud">Audience</label><select class="bt-select" id="lc-ad-aud"><option value="public">Public</option><option value="fanClub">Fan Club</option></select></div>
        <div class="bt-field"><span class="bt-label">First game</span><p class="lc-picked" data-first>${f.first ? esc(f.first.title) : "None yet: you can switch once you're live."}</p>${gamePickerHtml("adhoc")}</div>
        <p class="bt-fine bt-fine--left" data-err role="alert"></p>
        <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Never mind</button><button type="submit" class="bt-btn bt-btn--primary" data-make>Make the stream</button></div>
      </form>`;
    const q = <T extends HTMLElement>(s: string) => modal.querySelector<T>(s)!;
    const sync = () => {
      q("[data-rooms-field]").hidden = f.type === "backstage"; q("[data-aud-field]").hidden = f.type === "backstage"; q("[data-back-note]").hidden = f.type !== "backstage";
      modal.querySelectorAll<HTMLElement>("[data-type]").forEach((b) => { const on = b.dataset.type === f.type; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); });
      modal.querySelectorAll<HTMLElement>("[data-room]").forEach((b) => b.setAttribute("aria-pressed", String(f.rooms.has(b.dataset.room as Room))));
      q("[data-first]").textContent = f.first ? f.first.title : "None yet: you can switch once you're live.";
    };
    modal.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-type], [data-room]");
      if (!t) return;
      if (t.dataset.type) f.type = t.dataset.type as typeof f.type;
      else { const r = t.dataset.room as Room; f.rooms.has(r) ? f.rooms.delete(r) : f.rooms.add(r); }
      sync();
    });
    initGamePicker(q("[data-gp]"), ctx, { actionLabel: "First game", onPick: (g) => { f.first = g; sync(); } });
    q<HTMLFormElement>("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = q<HTMLInputElement>("#lc-ad-title").value.trim(), err = q("[data-err]");
      if (!title) { err.textContent = "Give it a title."; q("#lc-ad-title").focus(); return; }
      if (f.type === "platform" && !f.rooms.size) { err.textContent = "Pick at least one chat."; return; }
      err.textContent = "";
      await withBusy(q<HTMLButtonElement>("[data-make]"), "Making it…", async () => {
        try {
          const r = await ctx.api.call<{ streamId: string }>("createAdhocStream", { adhoc: { title, type: f.type, rooms: f.type === "backstage" ? [] : ROOMS.filter((x) => f.rooms.has(x)), audience: f.type === "backstage" ? "fanClub" : q<HTMLSelectElement>("#lc-ad-aud").value, ...(f.first ? { firstGame: { gameId: f.first.gameId } } : {}) } });
          createdId = r.streamId; ctx.pickedId = createdId;
          await ctx.refresh();
          event();
        } catch (e2) { err.textContent = messageFor(e2); }
      });
    });
    q<HTMLInputElement>("#lc-ad-title").focus();
  };
  // step two: the YouTube event, until the owner has picked it in Streamlabs
  const event = () => {
    setBeforeClose(() => true);
    const draw = () => {
      const s = ctx.snap.streams.find((x) => x.id === createdId);
      const st = s?.youtube?.status;
      const body = st === "ok" ? `<span class="lc-ok">✓ The YouTube event is ready.</span> In Streamlabs, refresh the list and pick it, then press Start.`
        : st === "failed" ? `<span class="lc-bad">The event couldn't be made.</span> <button type="button" class="bt-link-btn" data-retry>Retry</button>`
        : s?.type === "backstage" || s?.rooms.some((r) => r.startsWith("yt")) || !s ? `<span class="lc-wait">Making the YouTube event…</span>` : `<span class="lc-ok">No YouTube event needed for these chats.</span>`;
      modal.querySelector<HTMLElement>("[data-ev]")!.innerHTML = body;
    };
    modal.innerHTML = `${modalHeader("The stream is ready", "It isn't live yet.")}<div class="lc-ev" data-ev role="status" aria-live="polite"></div><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--primary" data-done>Done</button></div>`;
    draw();
    const t = window.setInterval(async () => { if (!modal.isConnected) { clearInterval(t); return; } await ctx.refresh(); draw(); }, 3000);
    modal.addEventListener("click", async (e) => {
      if ((e.target as HTMLElement).closest("[data-retry]")) { try { await ctx.api.call("youtubeRetry", { streamId: createdId }); await ctx.refresh(); draw(); } catch (err) { toast(messageFor(err), { kind: "error" }); } }
      if ((e.target as HTMLElement).closest("[data-done]")) { clearInterval(t); close(); }
    });
  };
  form();
}

/**
 * The Start dialog. While it is open it asks livePlatformStatus every 5 s (one request at a time, errors quiet, stopped when it closes) and fills each
 * row in: Looking… then Live ✓ or Not live yet. TikTok has no API: its row is the switch (ON when TikTok is a planned chat; saved with liveRoom right before Start).
 * Start stays allowed whatever the rows say; a gold note tells what isn't live yet.
 */
function startDialog(ctx: Ctx) {
  const s = picked(ctx); if (!s) return;
  let first: Pick | null = s.plannedGames[0] ? { gameId: s.plannedGames[0].gameId, title: s.plannedGames[0].title } : null;
  const back = s.type === "backstage";
  let ps: PlatformStatus | null = null;
  const persisted = tiktokOf(s), planned = !back && s.rooms.includes("tiktok");
  let tt = planned;   // ON when TikTok is one of the planned chats; the write happens when Start is pressed

  const row = (id: string, name: string) => `<div class="lc-chk" data-row="${id}" data-state="wait"><b aria-hidden="true">·</b><span><b>${esc(name)}</b><small data-t>Looking…</small></span></div>`;
  const rows = back ? row("yt", "YouTube event (unlisted)")
    : [s.rooms.includes("twitch") ? row("tw", "Twitch") : "", row("yt", "YouTube event"), s.rooms.includes("ytVertical") ? row("vt", "YouTube vertical broadcast") : "",
      s.rooms.includes("tiktok") ? `<div class="lc-chk" data-row="tk" data-state="wait"><b aria-hidden="true">·</b><span><b>TikTok</b><small data-t>Start TikTok LIVE Studio, then switch it on here.</small></span><button type="button" class="bt-switch" role="switch" aria-checked="${tt}" aria-label="Live on TikTok" data-tt></button></div>` : ""].join("");
  const { modal, close } = openLive({ title: `Start ${s.title}?`, wide: true, onClose: () => stop(), content: `${modalHeader(esc(`Start ${s.title}?`), back ? "A members-only backstage show: it plays on /live for the Fan Club (chat rooms: the site only), tells them it is on and begins the Start beat. Twitch and TikTok stay off." : "This turns on the live lights across the site, tells members you're live and begins the Start beat.")}
    <div class="lc-chks">${rows}</div><p class="bt-notice lc-gold" role="note" data-note></p>
    <div class="bt-field"><span class="bt-label">First game</span><p class="lc-picked" data-first>${first ? esc(first.title) : "None planned: you can switch once you're live."}</p>${gamePickerHtml("start")}</div>
    <p class="bt-fine bt-fine--left" data-err role="alert"></p>
    <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Not yet</button><button type="button" class="bt-btn bt-btn--primary lc-big" data-go>Start the stream</button></div>` });
  const set = (id: string, ok: boolean | null, text: string) => {
    const r = modal.querySelector<HTMLElement>(`[data-row="${id}"]`); if (!r) return;
    r.dataset.state = ok === null ? "wait" : ok ? "ok" : "warn";
    r.querySelector("b")!.textContent = ok === null ? "·" : ok ? "✓" : "!";
    r.querySelector("[data-t]")!.textContent = text;
  };
  const note = () => {
    const miss: string[] = [];
    if (ps) {
      if (!back && s.rooms.includes("twitch") && !ps.twitch.live) miss.push("Twitch");
      if (!ps.youtube.live) miss.push(back ? "the YouTube event" : "YouTube");
      if (ps.youtube.verticalWanted && !ps.youtube.verticalActive) miss.push("the vertical broadcast");
    }
    modal.querySelector("[data-note]")!.textContent = !ps ? "Make sure you are live in Streamlabs. You can still start if something isn't live yet; the controls show what's missing."
      : miss.length ? `${miss.join(", ").replace(/^./, (c) => c.toUpperCase())} ${miss.length === 1 ? "isn't" : "aren't"} live yet. You can still start; the controls keep looking.` : "Everything we can see is live. Start when you're ready.";
  };
  const draw = () => {
    if (!ps) return;
    if (!back && s.rooms.includes("twitch")) set("tw", ps.twitch.live, ps.twitch.live ? `Live ✓${ps.twitch.viewers != null ? ` · ${ps.twitch.viewers} watching` : ""}` : ps.twitch.error ? "Can't check Twitch from here" : "Not live yet");
    set("yt", ps.youtube.live, !ps.youtube.connected ? "YouTube isn't connected" : ps.youtube.live ? "Live ✓" : ps.youtube.eventStatus === "ok" ? "Event ready, not live yet" : "Not live yet");
    if (ps.youtube.verticalWanted) set("vt", ps.youtube.verticalActive, ps.youtube.verticalActive ? "Live ✓" : "Not found yet: Dual Output makes it at go-live");
    note();
  };
  // the poll: one request at a time, quiet on errors, stopped when the dialog closes
  let timer = 0, busy = false, closed = false;
  const poll = async () => {
    if (busy || closed) return;
    busy = true;
    try { const r = await ctx.api.call<PlatformStatus>("livePlatformStatus", { streamId: s.id }); if (!closed) { ps = r; draw(); } } catch { /* quiet: the rows keep their last answer */ }
    finally { busy = false; }
  };
  const stop = () => { closed = true; clearInterval(timer); };
  note(); void poll(); timer = window.setInterval(poll, 5000);
  modal.querySelector<HTMLElement>("[data-tt]")?.addEventListener("click", (e) => { tt = !tt; (e.currentTarget as HTMLElement).setAttribute("aria-checked", String(tt)); });
  initGamePicker(modal.querySelector<HTMLElement>("[data-gp]")!, ctx, { actionLabel: "First game", onPick: (g) => { first = g; modal.querySelector("[data-first]")!.textContent = g.title; } });
  modal.querySelector<HTMLButtonElement>("[data-go]")!.addEventListener("click", async (e) => {
    await withBusy(e.currentTarget as HTMLButtonElement, "Starting…", async () => {
      try {
        if (planned && tt !== persisted) await ctx.api.call("liveRoom", { streamId: s.id, room: "tiktok", on: tt });   // the owner's final choice, saved right before Start
        await ctx.api.call("startStream", { streamId: s.id, ...(first ? { firstGame: { gameId: first.gameId } } : {}) });
        stop(); close();
        await ctx.refresh();
        wereLive(ctx);
      } catch (err) { modal.querySelector("[data-err]")!.textContent = messageFor(err); }
    });
  });
}

/** The WE'RE LIVE power-up: a short overlay on the controls (none under reduced motion). */
function wereLive(ctx: Ctx) {
  if (reduced()) return;
  const el = document.createElement("div");
  el.className = "lc-golive"; el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<span class="lc-golive-ring"></span><b>WE'RE LIVE</b><small>${esc(BEAT_LABEL.start)} beat is on</small>`;
  ctx.root.append(el);
  burst(el, { n: 24 });
  setTimeout(() => el.remove(), 2800);
}

export function initStage(ctx: Ctx) {
  ctx.hooks.wereLive = () => wereLive(ctx);
  ctx.acts["pick"] = (b) => { ctx.pickedId = b.dataset.id!; ctx.render(); };
  ctx.acts["late"] = async (b) => { await withBusy(b as HTMLButtonElement, "…", () => delay(ctx, Number(b.dataset.m))); };
  ctx.acts["late-custom"] = () => lateDialog(ctx);
  ctx.acts["cancel-stream"] = () => { void cancelDialog(ctx); };
  ctx.acts["adhoc"] = () => adhocDialog(ctx);
  ctx.acts["start"] = () => startDialog(ctx);
}
