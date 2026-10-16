// What My pass shows on its Twitch card (docs/specs/club-pass.md §11, §12). Plain JS so functions/scripts/check-club.js tests the
// same rule the page uses.
//   link        users/{uid}.linked.twitch: { id, login } or null. The ONLY source for "linked or not" (Linked accounts reads it too).
//   clubTwitch  sites/boomertanger/members/{uid}.club.twitch (server-written; missing for members who linked before Twitch counting).
//               Its sub result is used only while it describes a linked account.
//   channel     the channel's Twitch login (site.json twitchChannel): linking that account is the channel's own, never a sub.
// -> { linked, login, own, sub (true | false | null = not checked), tier, gifted, checkedAt }
export function twitchView(link, clubTwitch, channel = "boomertanger") {
  if (!link || !link.id) return { linked: false, login: "", own: false, sub: null, tier: "", gifted: false, checkedAt: null };
  const t = clubTwitch && clubTwitch.linked === true ? clubTwitch : null;
  const own = !!(t && t.own) || String(link.login || "").toLowerCase() === String(channel || "").toLowerCase();
  return {
    linked: true,
    login: link.login || (t && t.login) || "",
    own,
    sub: own || !t || typeof t.sub !== "boolean" ? null : t.sub,
    tier: !own && t && t.sub && t.tier ? String(t.tier) : "",
    gifted: !own && !!(t && t.sub && t.gifted),
    checkedAt: (t && t.checkedAt) || null,
  };
}
