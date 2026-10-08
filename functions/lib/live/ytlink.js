// Control Room: which YouTube broadcasts belong to a stream that just went live (docs/specs/control-room.md §3.3, §11).
// Pure: the caller lists the ACTIVE broadcasts (liveBroadcasts, broadcastStatus=active) and passes what the watch doc knows.
//
// A platform stream has the event the site made (landscape) and, with Streamlabs Dual Output, a vertical broadcast Streamlabs
// created itself: any other active broadcast. A backstage stream has just its own event. Until the live pieces are found the
// controls show "Waiting for YouTube…" and liveTick asks again every 15 seconds.

/**
 * { stream, known: { landscapeId, backstageId, verticalId }, active: [{ id }] } ->
 *   { landscapeId, backstageId, verticalId, ready, waiting: ["landscape" | "vertical" | "event"] }
 * A hand-made event (nothing known) is adopted: the first active broadcast becomes the landscape (or backstage) one.
 */
function pickYoutubeIds({ stream, known = {}, active = [] }) {
  const ids = (active || []).map((b) => b && b.id).filter(Boolean);
  const backstage = stream && stream.type === "backstage";
  const own = backstage ? known.backstageId : known.landscapeId;
  const waiting = [];
  let main = own && ids.includes(own) ? own : null;
  if (!main && !own) main = ids.find((i) => i !== known.verticalId) || null;       // a hand-made event
  if (!main) waiting.push(backstage ? "event" : "landscape");
  let vertical = known.verticalId && ids.includes(known.verticalId) ? known.verticalId : null;
  const wantsVertical = !backstage && (!stream || !Array.isArray(stream.rooms) || stream.rooms.includes("ytVertical"));
  if (!vertical && wantsVertical) {
    vertical = ids.find((i) => i !== main && i !== known.landscapeId && i !== known.backstageId) || null;
    if (!vertical) waiting.push("vertical");
  }
  return {
    landscapeId: backstage ? null : main, backstageId: backstage ? main : null, verticalId: backstage ? null : vertical,
    ready: waiting.length === 0, waiting,
  };
}

module.exports = { pickYoutubeIds };
