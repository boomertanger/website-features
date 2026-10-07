// The public crew roster (docs/specs/mod-machina.md section 12, /crew "Meet the crew"): one document,
// sites/boomertanger/public/crew, readable by everyone (public/{docId} is open in firestore.rules).
// It carries ONLY what the spec lets the public see: handle, track, grade, status, and the chats marked
// Favourite, plus the optional one-line quote the member wrote for themselves (plain text, up to 90 characters, only when
// set). "Happy", "If needed" and "No" are never published. Reserve, Alumni and Paused aren't listed.
// Rebuilt after each roster change (mirrorCrewRoster) and every night (crewNightly); never throws.
const admin = require("firebase-admin");
const { SITE_ID, paths } = require("./settings");

const LISTED = ["active", "checkIn", "goingDark"];
const CHATS = ["twitch", "ytLandscape", "ytVertical", "tiktok"];

/** One listed member (pure). roster: the roster doc data; handle: the profile's current handle. */
function publicMember(uid, roster, handle) {
  if (!roster || !LISTED.includes(roster.status) || !Number.isInteger(roster.grade)) return null;
  const favourites = CHATS.filter((k) => roster.platforms?.[k] === "favourite");
  const quote = typeof roster.quote === "string" ? roster.quote.trim().slice(0, 90) : "";
  return { uid, handle: handle || roster.handle || null, track: roster.track === "admin" ? "admin" : "mod", grade: roster.grade, status: roster.status, favourites, ...(quote ? { quote } : {}) };
}

/** Admins first (A3 down), then mods (M4 down), then by handle. */
function sortMembers(list) {
  return [...list].sort((a, b) => (a.track === b.track ? 0 : a.track === "admin" ? -1 : 1) || b.grade - a.grade || String(a.handle).localeCompare(String(b.handle)));
}

async function rebuildPublicCrew(db = admin.firestore()) {
  try {
    const snap = await db.collection(`${paths.settings()}/roster`).get();
    const ids = snap.docs.map((d) => d.id);
    const profiles = ids.length ? await db.getAll(...ids.map((u) => db.doc(`sites/${SITE_ID}/profiles/${u}`))) : [];
    const handleOf = new Map(profiles.map((p, i) => [ids[i], p.exists ? p.get("handle") || null : null]));
    const members = sortMembers(snap.docs.map((d) => publicMember(d.id, d.data(), handleOf.get(d.id))).filter(Boolean));
    await db.doc(`sites/${SITE_ID}/public/crew`).set({ members, updatedAt: admin.firestore.Timestamp.now() });
    return members.length;
  } catch (err) {
    console.error("crew: public roster rebuild failed", err);
    return null;
  }
}

module.exports = { rebuildPublicCrew, publicMember, sortMembers, LISTED };
