// The swap board's page pieces (Mod Machina phase 3 part 1; docs/specs/mod-machina.md section 17a): the Swap board card on /crew/hq, the rows, "Take it" through confirmAction, and the
// drop dialog's two notices on /schedule. Display only: dutyDrop and dutySwapTake decide on the server (grade, lockout, first write wins). Reads come from plan-io (the real swaps, or the
// non-production ?as= preview copy); nothing here touches Firestore.
import { swapRowHtml, swapsHtml } from "../../../../shared/ui/swap.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import { dayParts } from "../../../../shared/ui/scream-planner.js";
import { burst } from "../../../../shared/ui/burst.js";
import { toast } from "../../../../shared/ui/toast.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { messageFor } from "../../lib/errors";
import { ROOM_SHORT, SITE_TZ, DAY_LONG, type Swap, type Room } from "../planner/plan-data";
import type { Io } from "../planner/plan-io";

const HOUR = 3600000;
const clock = (t: number, tz = SITE_TZ) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(t);
const dayLong = (t: number, tz = SITE_TZ) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(t);
void DAY_LONG;
export const roleName = (role: string) => (role === "captain" ? "Captain" : role === "lead" ? "Lead" : "Deckhand");
export const roomName = (room: string) => (room === "captain" ? "" : ROOM_SHORT[room as Room] || room);
/** "Friday at 7:00 PM". */
export const whenText = (t: number, tz = SITE_TZ) => `${dayLong(t, tz)} at ${clock(t, tz)}`;
const ahead = (t: number, now: number) => { const h = Math.max(0, Math.round((t - now) / HOUR)); return h < 48 ? `${h} h ahead` : `${Math.round(h / 24)} days ahead`; };

/** What the board shows: open swaps for streams that haven't started (soonest first), then the last 3 taken in the past 24 hours. */
export function boardOf(swaps: Swap[], now = Date.now()): { open: Swap[]; taken: Swap[] } {
  const open = swaps.filter((s) => s.status === "open" && s.startsAt > now).sort((a, b) => a.startsAt - b.startsAt);
  const taken = swaps.filter((s) => s.status === "taken" && s.takenAt != null && now - s.takenAt < 24 * HOUR).sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0)).slice(0, 3);
  return { open, taken };
}

export function rowHtml(sw: Swap, meUid: string, now = Date.now()): string {
  const t = dayParts(sw.startsAt, SITE_TZ);
  const state = sw.status === "taken" ? (sw.takenBy === meUid ? "mine" : "taken") : "open";
  const note = state === "mine" ? "Yours now · confirmed · the Captain can see it"
    : state === "taken" ? `Taken by @${sw.takenByHandle || "a crew member"}`
      : `Dropped by @${sw.fromHandle || "someone"} · ${ahead(sw.startsAt, now)} · ${clock(sw.startsAt)}${sw.notice === "late" ? " · late drop, costs them nothing if taken" : ""}`;
  return swapRowHtml({ id: sw.id, dow: t.dow.toUpperCase(), day: String(t.num), chat: sw.role === "captain" ? "captain" : sw.room, role: roleName(sw.role), roomName: roomName(sw.room), note, state });
}

/** The Swap board card for /crew/hq. */
export function boardCardHtml(swaps: Swap[], meUid: string, mascot: string, now = Date.now()): string {
  const { open, taken } = boardOf(swaps, now);
  const head = `<div class="bt-card-head"><span class="bt-card-title">Swap board</span>${open.length ? `<span class="bt-badge bt-badge--gold"><span class="bt-badge-dot"></span>${open.length} up for grabs</span>` : ""}</div>`;
  if (!open.length && !taken.length) return `<div class="bt-card hq-card hq-swaps">${head}<div class="bt-empty bt-empty--compact hq-swaps-empty"><span class="hq-swaps-m" aria-hidden="true">${mascot}</span><p class="bt-empty-title">Nothing up for grabs</p><p>Every seat has its crew. When someone drops a seat, it shows here and you get a notice.</p></div></div>`;
  return `<div class="bt-card hq-card hq-swaps">${head}${swapsHtml([...open, ...taken].map((s) => rowHtml(s, meUid, now)).join(""))}${open.length ? `<p class="hq-note">Take it with one tap. First come, first served, and your grade has to cover the seat.</p>` : ""}</div>`;
}

/** Take it: confirm, call dutySwapTake, then the toast "Yours. See you Friday at 7:00 PM." Resolves true when the seat is yours. */
export async function takeSwap(io: Io, sw: Swap, rowEl?: Element | null): Promise<boolean> {
  const ok = await confirmAction({
    title: "Take this seat?",
    message: `${roleName(sw.role)}${sw.role === "captain" ? "" : ` in ${roomName(sw.room)}`}, ${whenText(sw.startsAt)}. It's yours straight away, and the Captain and owner will see you took it.`,
    confirmLabel: "Take it", busyLabel: "Taking…", danger: false, feature: "crew",
    onConfirm: async () => { try { await io.call("dutySwapTake", { swapId: sw.id }); } catch (err) { throw new Error(messageFor(err, "Couldn't take that seat. Try again.")); } },
  });
  if (ok) { if (rowEl) burst(rowEl as HTMLElement, { n: 14 }); toast(`Yours. See you ${whenText(sw.startsAt)}.`); }
  return ok;
}

/** Wires a container's Take it buttons. `reload` runs after a successful take (and after a refusal, so a stale row disappears). */
export function wireBoard(el: HTMLElement, io: Io, find: (id: string) => Swap | undefined, reload: () => Promise<void> | void) {
  el.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-swap-take]");
    if (!b) return;
    const row = b.closest<HTMLElement>("[data-swap]"), sw = row ? find(row.dataset.swap!) : undefined;
    if (!sw) return;
    void takeSwap(io, sw, row).then((ok) => { if (ok) setTimeout(() => void reload(), 650); else void reload(); });
  });
}

/** The drop dialog on /schedule for a confirmed seat on a published stream: which kind of drop it is, word for word from the approved mockup. Resolves true when they chose to put it on the board. */
export function dropDialog(opts: { chat: string; role: string; room: string; start: number; tz: string; onDrop: () => Promise<void> }): void {
  const early = opts.start - Date.now() >= 24 * HOUR;
  const away = early ? `${Math.max(1, Math.round((opts.start - Date.now()) / (24 * HOUR)))} days away` : `in ${Math.max(1, Math.round((opts.start - Date.now()) / HOUR))} hours`;
  const sub = `${opts.role === "captain" ? "" : platformIconHtml(opts.chat)} ${esc(roleName(opts.role))}${opts.role === "captain" ? "" : ` · ${esc(roomName(opts.room))}`} · ${esc(whenText(opts.start, opts.tz).replace(" at ", ", "))} (${esc(away)})`;
  const m = openModal({
    title: "Drop your seat?", feature: "planner",
    content: modalHeader("Drop your seat?", sub)
      + `<div class="bt-notice${early ? " bt-notice--ok" : ""}">${early ? "More than 24 hours’ notice: no effect on your record. The seat goes on the swap board for the crew." : "Less than 24 hours: no effect if someone takes it before the stream starts. If nobody does, it counts as a no-show."}</div>`
      + `<p class="bt-error" role="alert" hidden></p>`
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Keep my seat</button><button type="button" class="bt-btn bt-btn--primary" data-go>Put it on the swap board</button></div>`,
  });
  m.modal.querySelector<HTMLButtonElement>("[data-go]")!.addEventListener("click", async (e) => {
    const b = e.currentTarget as HTMLButtonElement, er = m.modal.querySelector<HTMLElement>(".bt-error")!;
    b.disabled = true; b.innerHTML = '<span class="bt-spinner" aria-hidden="true"></span>Putting it up…'; er.hidden = true; m.setDismissible(false);
    try { await opts.onDrop(); m.setDismissible(true); m.close(); }
    catch (err) { m.setDismissible(true); er.textContent = messageFor(err, "Couldn't drop the seat. Try again."); er.hidden = false; b.disabled = false; b.textContent = "Put it on the swap board"; }
  });
}
