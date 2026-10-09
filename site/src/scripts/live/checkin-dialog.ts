// The check-in dialog, opened from the site-wide banner on any page (docs/specs/control-room.md §4; mockup control-room-batch-3.html section 2).
// openModal (variant "sheet": a bottom sheet on phones), announced with bt:overlay-open. It holds the kit's .bt-checkin card in its dialog form: the
// countdown ring, the word field, "Where are you watching?" (the last room used, or a ?room= link), a shake with the tries left on a wrong word, and
// the locked note. A right word swaps in the success view: the stamp slams, the burst (none under reduced motion), +XP, the stream streak and beats so
// far as chips, and the four stamps. It sends the word through checkin-flow.ts, the same code the /live panel uses.
import { burst } from "../../../../shared/ui/burst.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { stampsHtml } from "../../../../shared/ui/checkin.js";
import { BEATS, BEAT_LABEL, type Beat, type PubLive } from "./model";
import type { Presence, PubApi } from "./pub-data";
import { beatOf, defaultRoom, isLocked, isOpenNow, roomsOf, submitCheckIn } from "./checkin-flow";
import { checkinHtml, esc, initCheckin, reduced } from "./pub-ui";
import { openLive, modalHeader } from "./ui";

export interface DialogDeps {
  api: PubApi;
  getPub: () => PubLive;
  getPresence: () => Presence | null;
  setPresence: (p: Presence | null) => void;
  /** Called after a successful check-in (the banner turns green). */
  onDone: (beat: Beat, xp: number) => void;
}

let openNow = false;

export function openCheckinDialog(d: DialogDeps) {
  if (openNow) return;
  const pub = d.getPub(), beat = beatOf(pub), name = BEAT_LABEL[beat];
  const rooms = roomsOf(pub), pr = d.getPresence();
  const locked = isLocked(pr, beat), open = isOpenNow(pub);
  const stamps = Object.fromEntries(BEATS.map((k) => [k, !!pr?.beats[k]]));
  const state = locked ? "locked" : open ? "entry" : "closed";
  const card = checkinHtml({
    dialog: true, state, beat, id: "bt-ci-dlg", closesAt: open ? pub.window.closesAt : 0, count: pub.counts.byBeat?.[beat] || 0, rooms: rooms.length ? rooms : undefined,
    room: defaultRoom(rooms), tries: 5 - (pr?.wrongTries[beat] || 0), stamps,
    title: state === "closed" ? "Check-in is closed" : undefined, text: state === "closed" ? "It opens at the next beat. Passive Twitch presence still counts toward your stream streak." : undefined,
  });
  openNow = true;
  const { modal } = openLive({
    title: `Check in · ${name}`, variant: "sheet", feature: "live-checkin",
    content: `<div class="bt-ci-win">${modalHeader(`Check in · ${esc(name)}`, "Type the word Boomer just said on stream. It's on screen too.")}<div data-ci-body>${card}</div></div>`,
    onClose: () => { openNow = false; },
  });
  const body = modal.querySelector<HTMLElement>("[data-ci-body]")!;

  const success = (b: Beat, xp: number) => {
    const got = Object.keys(d.getPresence()?.beats || {}).length;
    const held = BEATS.filter((k) => pub.beats[k]?.status && pub.beats[k]!.status !== "next").length || BEATS.length;
    const stampsNow = Object.fromEntries(BEATS.map((k) => [k, !!d.getPresence()?.beats[k]]));
    body.innerHTML = `<div class="bt-ci-done"><div class="bt-ci-stamp">${stampHtml({ kicker: BEAT_LABEL[b], label: "IN", tone: "lime" })}</div>
      <h2 class="bt-modal-title">You're checked in</h2><p>Keep the tab open or come back at the next beat.</p>
      <div class="bt-ci-chips">${xp ? `<span class="is-xp">+${xp} XP</span>` : ""}<span class="is-streak">Stream streak safe tonight</span><span class="is-beats">${got} of ${held} beats</span></div>
      ${stampsHtml(stampsNow)}<button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Back to the page</button></div>`;
    const sub = modal.querySelector<HTMLElement>(".bt-modal-subtitle"); if (sub) sub.textContent = "You're on the board for this beat.";
    const st = body.querySelector<HTMLElement>(".bt-ci-stamp");
    if (st && !reduced()) setTimeout(() => { burst(st, { n: 30 }); burst(st, { n: 18 }); }, 250);
  };

  initCheckin(body, {
    onSubmit: async (word, room) => {
      const r = await submitCheckIn(d.api, d.getPub(), d.getPresence(), word, room);
      d.setPresence(r.presence);
      if ("ok" in r.outcome && r.outcome.ok) { success(r.beat, r.xp); d.onDone(r.beat, r.xp); return { error: "" }; }
      return r.outcome;
    },
  });
  body.querySelector<HTMLInputElement>("input[name=word]")?.focus();
}
