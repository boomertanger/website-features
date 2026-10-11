// site/src/scripts/base-camp/newfoundland-data.ts — the lists on /base-camp/newfoundland (docs/specs/base-camp.md "Page 2"; every word as in the
// approved mockup docs/design/mockups/base-camp-newfoundland.html, round 5, which already carries the fact corrections): the ten things and their
// map pins, the words, the war and Famous Newfoundlands stamps, the timeline, Ask BOOMBOT, the iceberg season, and the time helpers for the live
// clocks (real America/St_Johns time). Used at build time (newfoundland.astro) and in the browser (newfoundland.ts).

export const THINGS = [
  { n: 1, id: "rock", t: "Older than the Atlantic", where: "Gros Morne" },
  { n: 2, id: "light", t: "First light, half an hour ahead", where: "Cape Spear" },
  { n: 3, id: "ice", t: "Iceberg Alley", where: "The northeast coast" },
  { n: 4, id: "norse", t: "The Vikings got here first", where: "L'Anse aux Meadows" },
  { n: 5, id: "cod", t: "White gold", where: "The Grand Banks" },
  { n: 6, id: "city", t: "One of the oldest cities on the continent", where: "St. John's" },
  { n: 7, id: "war", t: "A dominion at war", where: "Argentia" },
  { n: 8, id: "gander", t: "Seven thousand strangers", where: "Gander" },
  { n: 9, id: "talk", t: "The way we talk", where: "Island-wide" },
  { n: 10, id: "breeds", t: "Two breeds named for the island", where: "Island-wide" },
];
/** Map pins: the true point (x, y) and the pin head (hx, hy), in the chart's 640 × 690 space. 9 and 10 are everywhere, so they have none. */
export const PINS: Record<number, [number, number, number, number]> = { 1: [109, 253, 64, 205], 2: [461, 448, 530, 470], 3: [482, 240, 545, 205], 4: [269, 40, 330, 34], 5: [568, 640, 612, 596], 6: [455, 444, 505, 392], 7: [371, 470, 330, 590], 8: [330, 305, 392, 272] };

export const WORDS: [string, string][] = [
  ["b'y", "Boy, but for anyone at all. \"How's she going, b'y?\""],
  ["scoff", "A big feed. A hearty meal."],
  ["mauzy", "Damp, foggy and mild. A mauzy day."],
  ["streel", "An untidy, scruffy person."],
  ["sleveen", "A rascal. Someone sly."],
  ["What are ya at?", "What are you up to? Also just: how are you?"],
  ["Stay where you're to", "Stay where you are. (Till I comes where you're at.)"],
  ["I'm after telling ya", "I just told you."],
];
/** The word of the day: one per calendar day (UTC), the same for everyone, round the list in order. */
export const wordOfDay = (ms = Date.now()) => WORDS[Math.floor(ms / 86400000) % WORDS.length];

export const ASK: [string, string][] = [
  ["Why is it called the Rock?", "It's the island's nickname, for its rugged, rocky ground. You'll hear it everywhere."],
  ["How do you say Newfoundland?", "New-fun-LAND, with the weight at the end. It rhymes with understand."],
  ["Is it really half an hour ahead?", "Yes. Newfoundland Time is UTC−3:30, or UTC−2:30 in summer. That puts it half an hour ahead of the Maritimes."],
  ["When can I see icebergs?", "April to June is peak season. Late March and early July are the edges of it."],
  ["Can a Newfoundland dog really swim?", "It's built for it: webbed feet, a water-resistant double coat and a lot of muscle. Newfoundlands have a long history in water rescue."],
];

/** [icon, name, sub, back, year] */
export const WAR_STAMPS: [string, string, string, string, string][] = [
  ["🌲", "Forestry Unit", "Overseas", "The Newfoundland Overseas Forestry Unit cut timber in Scotland for the war effort.", "1939"],
  ["💥", "166th Field Regiment", "Royal Artillery", "Newfoundland's own artillery regiment, part of the British Army, in North Africa and Italy.", "1940"],
  ["✈", "125 Squadron", "Royal Air Force", "A night-fighter squadron that carried Newfoundland's name.", "1941"],
  ["⚓", "At sea", "Navy and merchant navy", "Thousands of Newfoundlanders served in the Royal Navy and the merchant navy.", "1939"],
];
export const FAMOUS: [string, string, string, string, string][] = [
  ["🧭", "Seaman", "Lewis and Clark", "Crossed the continent with Lewis and Clark's expedition, 1804 to 1806.", "1804"],
  ["📜", "Boatswain", "Lord Byron's dog", "Byron wrote him an epitaph and built him a monument at Newstead Abbey.", "1808"],
  ["🧸", "Nana", "Peter Pan", "In J. M. Barrie's original story, the Darling family's nursemaid is a Newfoundland.", "1904"],
  ["🐕", "Gander", "Hong Kong, 1941", "Served with Canadian soldiers and carried a live grenade away from wounded men. Awarded the Dickin Medal in 2000. He started life in Gander, Newfoundland.", "1941"],
];
export const TIMELINE: [string, string][] = [
  ["c. 1000", "Norse settle at L'Anse aux Meadows"], ["Early 1500s", "St. John's grows around its harbour"], ["1696", "French forces burn St. John's"],
  ["1804", "Seaman, a Newfoundland dog, heads west with Lewis and Clark"], ["1901", "Marconi's signal reaches Signal Hill"], ["1912", "Cape Race hears the Titanic"],
  ["1939", "Newfoundland goes to war"], ["1941", "The Atlantic Charter, Placentia Bay"], ["1949", "Newfoundland joins Canada"], ["2001", "Gander takes in 38 planes"],
];

// ---- the iceberg season: 2 = peak (April to June), 1 = the edges (March, July), 0 = out of season ----
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const SEASON = [0, 0, 1, 2, 2, 2, 1, 0, 0, 0, 0, 0];
export const seasonLine = (mo: number) => SEASON[mo] === 2 ? `<b>${MONTHS_FULL[mo]}: peak iceberg season.</b> Get to the coast.`
  : SEASON[mo] === 1 ? `<b>${MONTHS_FULL[mo]}: on the edge of the season.</b> Bergs are possible.`
  : `<b>${MONTHS_FULL[mo]}: out of season.</b> Peak runs April to June.`;

// ---- time (real Newfoundland time) ----
export const TZ = "America/St_Johns";
export const fmtTime = (tz: string, d = new Date()) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
export const tzAbbr = (tz: string, d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value || "";
/** Minutes ahead of UTC for a zone right now (DST included). */
export const offsetMin = (tz: string, d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(d).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
};
export const fmtOff = (m: number) => { const s = m < 0 ? "−" : "+"; const a = Math.abs(m); return `UTC${s}${Math.floor(a / 60)}${a % 60 ? ":" + String(a % 60).padStart(2, "0") : ""}`; };
export const diffText = (m: number) => {
  if (m === 0) return "the same time as you";
  const a = Math.abs(m), h = Math.floor(a / 60), mm = a % 60;
  return `${[h ? `${h} h` : "", mm ? `${mm} min` : ""].filter(Boolean).join(" ")} ${m > 0 ? "ahead of" : "behind"} you`;
};
