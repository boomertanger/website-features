// The Mod Deck's Captain tools, flags and "Confirm tonight's crew" (Mod Machina phase 3 part 5; docs/specs/mod-machina.md §17a "The Captain" and "Flag to owner"; mockup docs/design/mockups/mod-deck.html
// sections 1 to 3). Markup only (pure functions from plain data to strings), shared by /live/deck (mod-deck.ts) and /live/control (control.ts, for the flags and the confirm panel). Text is escaped.
// H1 helm strip: one row under the rooms strip (Unlock with a gold count, TikTok viewers with the count, Reassign, Launch panel), each opening its panel under the strip, one at a time.
// The Captain's row ends with a [data-helm-drop] spot: mod-deck.ts moves the "Drop a badge" button into it (drop-panel.ts mountHelmDrop; live drops).
import { launchHtml } from "../../../../shared/ui/launch.js";
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { flagCardHtml, flagsHtml } from "../../../../shared/ui/flag-card.js";
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import { initials } from "../../../../shared/ui/dom.js";
import { BEAT_LABEL, type Beat } from "./model";
import { esc } from "./ui";
import { ROOM_NAME, type ChatFormat, type Flag, type FlagType, type LockedOut, type NightRow, type OnDutyEntry, type Room } from "./mod-deck-data";

export type Tool = "unlock" | "tiktok" | "reassign" | "launch";
export const TOOL_LABEL: Record<Tool, string> = { unlock: "Unlock", tiktok: "TikTok viewers", reassign: "Reassign", launch: "Launch panel" };
const av = (name: string) => `<span class="bt-avatar-sm" aria-hidden="true">${esc(initials(name))}</span>`;
const roomLabel = (r: string | null) => (r ? ROOM_NAME[r as Room] || r : "");

// ---------------------------------------------------------------------------------------------- flags
export const FLAG_TYPES: { key: FlagType; icon: string; label: string; urgent: boolean }[] = [
  { key: "threat", icon: "⚠", label: "Threat", urgent: true },
  { key: "pii", icon: "🔒", label: "Personal info", urgent: true },
  { key: "raid", icon: "🌊", label: "Raid", urgent: false },
  { key: "harassment", icon: "✋", label: "Harassment", urgent: false },
  { key: "other", icon: "…", label: "Other", urgent: false },
];
export const flagLabel = (t: string) => FLAG_TYPES.find((x) => x.key === t)?.label || t;
const agoText = (t: number, now: number) => { const m = Math.max(0, Math.floor((now - t) / 60000)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`; };

/** The gold stack: one card per open flag, newest first. `extra` for admins on a Deck: the flag was also sent to the owner. */
export function flagStackHtml(flags: Flag[], { now = Date.now(), soundOff = false, extra = "", seenIds = new Set<string>() }: { now?: number; soundOff?: boolean; extra?: string; seenIds?: Set<string> } = {}): string {
  if (!flags.length) return "";
  const cards = [...flags].sort((a, b) => b.createdAt - a.createdAt).map((f) => flagCardHtml({
    id: f.id, type: flagLabel(f.type), urgent: f.urgent, room: roomLabel(f.room), note: f.note, by: f.byHandle ? `@${f.byHandle}` : "crew", ago: agoText(f.createdAt, now),
    state: f.seenAt || seenIds.has(f.id) ? "seen" : "new", extra: f.urgent ? extra : "",
  } as any)).join("");
  return flagsHtml(cards, { soundOff } as any);
}

/** Flag to Boomer: the dialog body (the header is modalHeader's). */
export function flagFormHtml({ rooms, room, type = "" }: { rooms: Room[]; room: Room | null; type?: string }): string {
  const urgent = FLAG_TYPES.find((t) => t.key === type)?.urgent;
  return `<div class="md-field"><span class="bt-label">What's happening</span><div class="md-flagtypes" role="radiogroup" aria-label="What's happening">${FLAG_TYPES.map((t) => `<button type="button" role="radio" class="${t.urgent ? "is-urgent" : ""}" aria-checked="${type === t.key}" data-ftype="${t.key}"><i>${t.icon}</i>${esc(t.label)}</button>`).join("")}</div></div>`
    + `<div class="md-field"><span class="bt-label">Where</span><div class="md-roomchips" role="radiogroup" aria-label="Where">${rooms.map((r) => `<button type="button" role="radio" class="bt-chip bt-chip--small${room === r ? " is-active" : ""}" aria-checked="${room === r}" data-froom="${esc(r)}">${esc(roomLabel(r))}</button>`).join("")}</div></div>`
    + `<div class="md-field"><span class="bt-label">Short note</span><textarea class="bt-input" maxlength="280" rows="3" data-fnote placeholder="What you saw and what you did. Describe personal info, don't paste it."></textarea><span class="md-count" data-fcount>0 / 280</span></div>`
    + `<p class="md-urgent-note" data-furgent${urgent ? "" : " hidden"}>Urgent: admins on duty see it too.</p>`
    + `<p class="bt-error" role="alert" hidden></p>`
    + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-act="send-flag" disabled>Send flag</button></div>`;
}
export const flagSubtitle = (urgent: boolean) => `Lands at the top of Boomer's controls with a chime.${urgent ? " Urgent: admins on duty see it too." : ""}`;

// ---------------------------------------------------------------------------------------------- the helm strip
export interface HelmInput {
  /** "captain": all four tools; "lead": the tools a Room Lead has (Unlock for the room, TikTok viewers for the TikTok Lead). */
  kind: "captain" | "lead"; open: Tool | null; lockedOut: LockedOut[]; done: { uid: string; handle: string | null; beat: string }[]; tiktok: number | null;
  people: { uid: string; entry: OnDutyEntry; me: boolean }[]; gaps: { room: Room; name: string }[]; owner: boolean; afterShow: boolean;
  formats: ChatFormat[]; runningFormat: string | null; haveChatGames: boolean; streamId: string; tiktokRoom: boolean; unlockCountLabel?: string;
}
const lockLine = (x: LockedOut) => `${esc(roomLabel(x.room))} · 5 wrong tries, ${esc(BEAT_LABEL[x.beat as Beat] || x.beat)}`;
function unlockPanel(i: HelmInput): string {
  const rows = i.lockedOut.map((x) => `<div class="md-locked-row">${av(x.handle || "?")}<span><b>@${esc(x.handle || "member")}</b><small>${lockLine(x)}</small></span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-unlock="${esc(x.uid)}|${esc(x.beat)}">Unlock</button></div>`).join("");
  const done = i.done.filter((d) => !i.lockedOut.some((x) => x.uid === d.uid && x.beat === d.beat)).map((d) => `<div class="md-locked-row is-done">${av(d.handle || "?")}<span><b>@${esc(d.handle || "member")}</b><small>Unlocked: one more try for this beat</small></span><span class="bt-badge bt-badge--lime">Done</span></div>`).join("");
  return `<div class="md-locked">${rows}${done}${!rows && !done ? `<p class="md-hint">Nobody is locked out right now. Members who run out of tries on a beat's check-in show up here.</p>` : `<span class="md-hint">Members who ran out of tries this beat. Unlocking gives one more try.</span>`}</div>`;
}
function tiktokPanel(i: HelmInput): string {
  return `<div class="md-tiktok"><input class="bt-input" type="number" inputmode="numeric" min="0" step="1" value="${i.tiktok ?? ""}" aria-label="TikTok viewers" data-tiktok-in><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-act="tiktok-save">Save</button><span class="md-hint">From the TikTok LIVE app.</span></div>`;
}
function reassignPanel(i: HelmInput): string {
  const rows = i.people.filter((p) => !p.me || true).map((p) => {
    const e = p.entry, role = e.roles.map((r) => (r.role === "captain" ? "Captain" : `${r.role === "lead" ? "Lead" : "Deckhand"}, ${roomLabel(r.room)}`)).join(" and ") || "On duty";
    return `<div class="md-ra-row"><span><b>@${esc(e.handle || "crew")}</b> · ${esc(role)}${e.away ? " · away" : ""}</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-move="${esc(p.uid)}">Move</button></div>`;
  }).join("");
  const gaps = i.gaps.map((g) => `<div class="md-ra-row is-gap"><span>${esc(g.name)} has no lead</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-fill="${esc(g.room)}">Fill it</button></div>`).join("");
  return `<div class="md-reassign">${rows || `<p class="md-hint">Nobody else is on duty yet.</p>`}${gaps}</div>`;
}
function launchPanel(i: HelmInput): string {
  const tiles: any[] = [{ id: "afterShow", icon: "🎬", title: "After-show", sub: i.owner ? "Ends the stream and opens Fan Club backstage" : "The owner and admins start the after-show", state: i.owner && !i.afterShow ? "idle" : "off" }];
  const cg = i.haveChatGames && i.formats.length ? i.formats.map((f) => ({ id: `cg:${f.id}`, icon: f.icon, title: f.title, sub: f.sub, state: i.runningFormat === f.id ? "running" : "idle", action: i.runningFormat ? "Swap" : "Start", statusText: "On stream · End" })) : [];
  return `<div class="md-launch">${launchHtml({ tiles: [...tiles, ...cg] as any })}</div>`;
}
export function helmHtml(i: HelmInput): string {
  const tools: Tool[] = i.kind === "captain" ? ["unlock", "tiktok", "reassign", "launch"] : (["unlock", ...(i.tiktokRoom ? ["tiktok"] : [])] as Tool[]);
  const n = i.lockedOut.length;
  const btn = (t: Tool) => `<button type="button" class="md-tool" data-tool="${t}" aria-expanded="${i.open === t}">${t === "unlock" ? `Unlock${n ? `<span class="md-tool-n">${n}</span>` : ""}` : t === "tiktok" ? `TikTok viewers${i.tiktok != null ? ` <span class="md-tool-v">${i.tiktok}</span>` : ""}` : TOOL_LABEL[t]}</button>`;
  const body = i.open === "unlock" ? unlockPanel(i) : i.open === "tiktok" ? tiktokPanel(i) : i.open === "reassign" ? reassignPanel(i) : i.open === "launch" ? launchPanel(i) : "";
  return `<div class="md-helm md-helm--${i.kind}" aria-label="${i.kind === "captain" ? "Captain tools" : "Room Lead tools"}"><div class="md-helm-row"><span class="md-helm-lab"><i aria-hidden="true">⎈</i> ${i.kind === "captain" ? "Captain" : "Room Lead"}</span>${tools.map(btn).join("")}<span class="md-helm-sp"></span>${i.kind === "captain" ? `<span class="md-helm-drop" data-helm-drop></span>` : ""}</div>${body ? `<div class="md-helm-panel" data-helm-panel>${body}</div>` : ""}</div>`;
}

// ---------------------------------------------------------------------------------------------- Reassign dialog
export interface MoveOption { key: string; chat: string; title: string; sub: string; gold?: boolean; here?: boolean }
export function moveOptions(entry: OnDutyEntry, rooms: { room: Room; name: string; lead: string | null; boost: string }[], isCaptain: boolean): MoveOption[] {
  const out: MoveOption[] = [];
  for (const r of rooms) {
    const here = entry.roles.some((x) => x.room === r.room);
    if (entry.grade >= 2 && !r.lead) out.push({ key: `lead:${r.room}`, chat: r.room, title: `Lead · ${r.name}`, sub: `Gold: nobody there${r.boost ? ` · ${r.boost} Gears` : ""} · they get an accept prompt`, gold: true });
  }
  for (const r of rooms) {
    const here = entry.roles.some((x) => x.role === "deckhand" && x.room === r.room);
    out.push({ key: `deckhand:${r.room}`, chat: r.room, title: `Deckhand · ${r.name}`, sub: here ? "Where they are now" : r.lead ? `With ${r.lead}` : "No lead there", here });
  }
  void isCaptain;
  return out;
}
export function moveListHtml(opts: MoveOption[], chosen: string): string {
  return `<div class="bt-pick-list">${opts.map((o) => `<button type="button" class="bt-pick${o.here ? " is-in" : ""}" ${o.here ? "disabled" : `aria-pressed="${o.key === chosen}"`} data-pick="${esc(o.key)}">${platformIconHtml(o.chat)}<span class="bt-pick-main"><b>${esc(o.title)}</b><small>${esc(o.sub)}</small></span>${o.here ? "" : `<span class="bt-pick-act">${o.key === chosen ? "Chosen" : "Pick"}</span>`}</button>`).join("")}</div>`;
}

// ---------------------------------------------------------------------------------------------- Confirm tonight's crew
export const nightRole = (lines: Record<string, number>): string => {
  const best = Object.entries(lines).sort((a, b) => b[1] - a[1]);
  if (!best.length) return "On duty";
  const parts = best.slice(0, 2).map(([k]) => { const [role, room] = k.split(":"); return role === "captain" ? "Captain" : `${role === "lead" ? "Lead" : "Deckhand"} · ${roomLabel(room)}`; });
  return parts.join(" + ");
};
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
export interface ConfirmInput { rows: NightRow[]; streamMinutes: number; added: Record<string, number>; confirmed: boolean; busy?: boolean; autoAt: number | null }
export function confirmNightHtml(i: ConfirmInput, { title = "Confirm tonight's crew" } = {}): string {
  const body = i.rows.length
    ? `<table class="md-confirm"><thead><tr><th>Crew</th><th class="md-hide-n">Role</th><th>Minutes</th></tr></thead><tbody>${i.rows.map((r) => {
      const add = i.added[r.uid] || 0, total = r.minutes + add, atMax = total >= i.streamMinutes;
      return `<tr><td><span class="md-who">${av(r.handle || "?")}<b>@${esc(r.handle || "crew")}</b></span></td><td class="md-hide-n">${esc(nightRole(r.lines))}</td><td>${i.confirmed ? `<b>${esc(hm(total))}</b>` : `<span class="md-step"><button type="button" data-step="${esc(r.uid)}|-15" aria-label="15 minutes less" ${add <= 0 ? "disabled" : ""}>−</button><b>${esc(hm(total))}</b><button type="button" data-step="${esc(r.uid)}|15" aria-label="15 minutes more" ${atMax ? "disabled" : ""}>+</button></span>`}${add ? `<span class="md-added">+${add} min added</span>` : ""}</td></tr>`;
    }).join("")}</tbody></table>`
    : `<p class="md-hint">Nobody clocked in tonight, so there's nothing to confirm.</p>`;
  const auto = i.autoAt ? `Not confirmed by ${new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).format(i.autoAt)}? The Deck's minutes stand and Gears pay then.` : "";
  const foot = `<div class="md-confirm-f"><span class="md-hint">Add minutes for anyone who modded without the Deck open, never past the stream's length (${esc(hm(i.streamMinutes))}). ${esc(auto)}</span>${i.confirmed ? `<span class="bt-badge bt-badge--lime">Confirmed · Gears paid</span>` : `<button type="button" class="bt-btn bt-btn--primary" data-act="confirm-night"${i.busy ? " disabled" : ""}>Confirm and pay Gears</button>`}</div>`;
  return crPanelHtml({ id: "md-confirm-panel", cls: "md-panel", title, icon: "crew", bodyHtml: body + foot, level: 3 });
}
export { av as avatarHtml };

// ---------------------------------------------------------------------------------------------- the chime and the tab title (no audio file: a short soft tone made with Web Audio)
/** One soft chime per new flag. Browsers keep sound off until the person has used the page, so it is "ready" only after a first tap or key; before that the card shows "Tap to turn on sound". */
export function makeChime() {
  let ctx: AudioContext | null = null, ready = false;
  const arm = () => {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return false;
      ctx = ctx || new AC();
      void ctx!.resume();
      ready = ctx!.state !== "suspended" || true;
      return true;
    } catch { return false; }
  };
  const onGesture = () => { if (arm()) { document.removeEventListener("pointerdown", onGesture); document.removeEventListener("keydown", onGesture); } };
  document.addEventListener("pointerdown", onGesture); document.addEventListener("keydown", onGesture);
  const play = () => {
    if (!ctx || !ready || ctx.state === "suspended") return false;
    const t = ctx.currentTime;
    [[659.25, 0], [880, 0.16]].forEach(([f, d]) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain();
      o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(ctx!.destination);
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.08, t + d + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.55);
      o.start(t + d); o.stop(t + d + 0.6);
    });
    return true;
  };
  return { arm, play, isReady: () => !!ctx && ready && ctx.state !== "suspended" };
}
/** The tab title: "⚑ Flag · Control Room" alternating with the page's own title until stop() (reduced motion: the flag title stays, nothing flashes). */
export function flagTitle(label: string) {
  const base = document.title, flag = `⚑ Flag · ${label}`;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let on = true, timer = 0;
  document.title = flag;
  if (!reduce) timer = window.setInterval(() => { on = !on; document.title = on ? flag : base; }, 1200);
  return () => { clearInterval(timer); document.title = base; };
}
