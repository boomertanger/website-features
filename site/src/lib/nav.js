import site from "../data/site.json";

// Every page the site can have. Only modules enabled in site.json (the future
// sites/{siteId}.modules) appear in the navigation. `blurb` is the one-line description
// under the page in the header panels and the phone More sheet (docs/specs/header-nav.md).
const MODULE_PAGES = {
  live: { label: "Live", href: "/live", icon: "live", blurb: "Watch the stream right now, on any platform." },
  schedule: { label: "Schedule", href: "/schedule", icon: "cal", blurb: "When I'm on next, in your own time zone." },
  games: { label: "Games", href: "/games", icon: "game", blurb: "What I'm playing, and what's up next." },
  arcade: { label: "Arcade", href: "/arcade", icon: "joystick", blurb: "Quick horror games with leaderboards." },
  chatgames: { label: "Chat Games", href: "/live/chat-games", icon: "game", blurb: "Questions, Hot Seat and every live game" },
  factory: { label: "Night Shift", href: "/shift", icon: "shift", blurb: "Missions between streams. Keep your streak alive." },
  trophies: { label: "Trophy Room", href: "/trophies", icon: "trophy", blurb: "Every badge and trophy you've earned." },
  crew: { label: "Crew", href: "/crew", icon: "eye", blurb: "Meet the mods who keep the chats fun, or join them." },
  goals: { label: "Goals", href: "/goals", icon: "target", blurb: "What we're working toward together." },
  streams: { label: "Streams", href: "/streams", icon: "film", blurb: "Past streams, highlights and clips." },
  shop: { label: "Shop", href: "/shop", icon: "bag", blurb: "Merch and crew drops." },
  club: { label: "Club", href: "/club", icon: "club", blurb: "Fan Club is free. Sub Club adds the extras." },
  // Crew only (display only: the header and More sheet hide it with .bt-when-staff; /live/deck gates itself and the callables decide).
  deck: { label: "Mod Deck", href: "/live/deck", icon: "club", blurb: "Your seat, the chats and the tools", staff: true },
  // Later: not in site.json modules yet, so they stay out of the navigation until enabled.
  bugzapper: { label: "Bug Zapper", href: "/bug-zapper", icon: "wrench", blurb: "Report something broken." },
  featurelab: { label: "Feature Lab", href: "/feature-lab", icon: "bulb", blurb: "Suggest ideas and vote on them." },
  contact: { label: "Contact", href: "/contact", icon: "mail", blurb: "Questions, feedback, business, private notes" },
  techStack: { label: "Tech Stack", href: "/tech-stack", icon: "rig", blurb: "The setup behind every stream" },
  // TODO: Horror Monthly (boomertang.com) has no page yet; site.json domains has the same "#" placeholder.
  monthly: { label: "Horror Monthly", href: "#", icon: "news", blurb: "The monthly horror roundup." },
};

// Pages that are on without being a site.json module: /crew is public (docs/specs/mod-machina.md), /contact is
// Hotline Boom (docs/specs/hotline-boom.md), /live/chat-games is How Chat Games work (docs/specs/chat-games.md §14a).
const ALWAYS_ON = ["crew", "contact", "chatgames"];
const STAFF_ONLY = ["deck"];   // on for everyone in the data, shown to staff only
const enabled = new Set([...site.modules, ...ALWAYS_ON, ...STAFF_ONLY]);
const isOn = (id) => enabled.has(id) && !!MODULE_PAGES[id];
const page = (id) => ({ id, ...MODULE_PAGES[id] });

// Header groups (docs/specs/header-nav.md): three menus and Shop as a plain link.
const GROUPS = [
  { id: "watch", label: "Watch", pages: ["live", "schedule", "streams", "games", "deck"] },
  { id: "play", label: "Play", pages: ["arcade", "chatgames", "factory", "trophies"] },
  { id: "community", label: "Community", pages: ["club", "crew", "goals", "techStack", "bugzapper", "featurelab", "contact", "monthly"] },
];
const PLAIN = ["shop"];

/** Every group that has pages: { id, label, items[] }. Disabled modules and empty groups are left out. */
const built = GROUPS.map((g) => ({ id: g.id, label: g.label, items: g.pages.filter(isOn).map(page) })).filter((g) => g.items.length);

/**
 * The header's entries in order: { kind: "group", id, label, items[] } for a menu, or
 * { kind: "link", id, label, href, icon, blurb } for a plain link. A group left with one page is a plain link.
 */
export const headerNav = [
  ...built.map((g) => (g.items.length === 1 ? { kind: "link", ...g.items[0] } : { kind: "group", ...g })),
  ...PLAIN.filter(isOn).map((id) => ({ kind: "link", ...page(id) })),
];

export const navItems = [
  { id: "home", label: "Home", href: "/", icon: "home", blurb: "" },
  ...site.modules.filter((m) => MODULE_PAGES[m]).map(page),
];

export const hasModule = (id) => id === "home" || enabled.has(id);

// Phone tab bar: Home, Schedule, raised Live, Games, More. "More" holds the rest.
export const TAB_IDS = ["home", "schedule", "live", "games"];
// Crew is on in the header (Community), the phone More sheet, the account menu and the footer.
export const moreItems = [...navItems.filter((i) => !TAB_IDS.includes(i.id)), ...ALWAYS_ON.filter((id) => !site.modules.includes(id)).map(page)];

/**
 * The phone More sheet: the header's groups under Watch / Play / Community / Shop headings, leaving out the
 * pages already in the tab bar. Groups with nothing left are dropped.
 */
export const moreGroups = [
  ...built.map((g) => ({ id: g.id, label: g.label, items: g.items.filter((i) => !TAB_IDS.includes(i.id)) })),
  ...PLAIN.filter(isOn).map((id) => ({ id, label: MODULE_PAGES[id].label, items: [page(id)] })),
].filter((g) => g.items.length);

const clean = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
export const isCurrent = (href, pathname) => clean(href) === clean(pathname);
/** The nav item a page belongs to: its own, or the section it sits under (/arcade/...). */
export const isInSection = (href, pathname) => href !== "/" && clean(pathname).startsWith(clean(href) + "/");
/** True when pathname is one of the group's pages or sits under one. */
export const groupIsCurrent = (group, pathname) => group.items.some((i) => i.href !== "#" && (isCurrent(i.href, pathname) || isInSection(i.href, pathname)));
