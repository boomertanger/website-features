// Handle and display-name word lists (docs/specs/accounts.md). Reserved handles
// are refused exactly. PROFANITY stems are matched anywhere in the text with
// everything but letters stripped (so "f_u_c_k" and "shit99" are caught);
// PROFANITY_WORDS are words that also hide inside ordinary ones ("grape",
// "peacock", "torpedo"), so they only match as a whole token between
// underscores, digits or spaces. Keep both short and obvious; admins can rename
// anything that slips through (docs/specs/foundation.md, "Security and abuse
// protection").

const RESERVED = [
  "boomertanger", "boomer", "admin", "mod", "mods", "support", "staff",
  "official", "moderator", "system",
];

// Any handle containing one of these is reserved too (impersonating the channel).
const RESERVED_PARTS = ["boomertang"];

const PROFANITY = [
  "fuck", "shit", "cunt", "bitch", "whore", "slut", "nigg", "fagg", "retard",
  "pussy", "twat", "porn", "asshole", "bastard", "molest", "hitler",
  "nazi", "kkk",
];

const PROFANITY_WORDS = [
  "ass", "anal", "cum", "tit", "tits", "boob", "boobs", "dick", "cock",
  "penis", "vagina", "sex", "rape", "rapist", "pedo", "pedos", "wank",
  "wanker",
];

module.exports = { RESERVED, RESERVED_PARTS, PROFANITY, PROFANITY_WORDS };
