import site from "../data/site.json";

// Every page the site can have. Only modules enabled in site.json (the future
// sites/{siteId}.modules) appear in the navigation.
const MODULE_PAGES = {
  live: { label: "Live", href: "/live", icon: "live" },
  schedule: { label: "Schedule", href: "/schedule", icon: "cal" },
  games: { label: "Games", href: "/games", icon: "game" },
  arcade: { label: "Arcade", href: "/arcade", icon: "joystick" },
  factory: { label: "Fun Factory", href: "/factory", icon: "factory" },
  trophies: { label: "Trophy Room", href: "/trophies", icon: "trophy" },
  goals: { label: "Goals", href: "/goals", icon: "target" },
  streams: { label: "Streams", href: "/streams", icon: "film" },
  shop: { label: "Shop", href: "/shop", icon: "bag" },
  club: { label: "Club", href: "/club", icon: "club" },
};

const enabled = new Set(site.modules);

export const navItems = [
  { id: "home", label: "Home", href: "/", icon: "home" },
  ...site.modules.filter((m) => MODULE_PAGES[m]).map((m) => ({ id: m, ...MODULE_PAGES[m] })),
];

export const hasModule = (id) => id === "home" || enabled.has(id);

// Phone tab bar: Home, Schedule, raised Live, Games, More. "More" holds the rest.
export const TAB_IDS = ["home", "schedule", "live", "games"];
export const moreItems = navItems.filter((i) => !TAB_IDS.includes(i.id));

const clean = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
export const isCurrent = (href, pathname) => clean(href) === clean(pathname);
/** The nav item a page belongs to: its own, or the section it sits under (/arcade/...). */
export const isInSection = (href, pathname) => href !== "/" && clean(pathname).startsWith(clean(href) + "/");
