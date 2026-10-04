// The Fun Factory builder's stage checks for the site (docs/specs/fun-factory.md §7): a copy of
// functions/lib/factory/checks.js (CommonJS, so the browser bundle can't import it). The server runs
// the same checks on submit and publish; functions/scripts/check-factory.js compares the two on the
// same seasons, so they can't drift. Edit both together.
const DAY = 86400000;
const TZ = "America/Chicago";
const BUDGET = { min: 3000, max: 4000 };
const STAGES = [
  ["theme", "🎨", "Theme"], ["chapters", "📖", "Chapters"], ["campaigns", "🗂", "Campaigns"], ["activities", "⚙️", "Activities"],
  ["rewards", "🏅", "Rewards"], ["schedule", "📅", "Schedule"], ["review", "🔍", "Review"], ["live", "🚀", "Live"],
];
const CADENCE_NAMES = { daily: "Daily", weekly: "Weekly", story: "Story", milestone: "Milestone", event: "Event" };
const LIMITS = { chaptersMin: 2, chaptersMax: 5, campaignsPerChapter: 6, activitiesPerCampaign: 20 };

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
function dayKey(t) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(t));
  const g = (k) => p.find((x) => x.type === k).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
// Season ends are exclusive (midnight starting the next day), so ranges show end - 1: the last day.
const fmt = (t) => new Date(t).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listMore = (names, max = 3) => (names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} and ${names.length - max} more`);

/** Chapters in unlock order with their [start, end) windows (the next chapter's unlock, or the season's end). */
function chapterWindows(season, chapters) {
  const list = [...(chapters || [])].sort((a, b) => (num(a.unlockAt) ?? Infinity) - (num(b.unlockAt) ?? Infinity) || (a.order || 0) - (b.order || 0));
  return list.map((c, i) => ({ ...c, start: num(c.unlockAt), end: num(list[i + 1]?.unlockAt) ?? num(season?.endsAt) }));
}
/** A campaign's window: its own dates, else its chapter's (Daily and Weekly) or to the season's end. */
function campaignWindow(c, chapter, season) {
  const start = num(c.opensAt) ?? chapter?.start ?? num(season?.startsAt);
  const end = num(c.closesAt) ?? (c.cadence === "daily" || c.cadence === "weekly" ? chapter?.end : num(season?.endsAt)) ?? num(season?.endsAt);
  return { start, end };
}
const repeatOf = (a, c) => a.repeat || (c?.cadence === "daily" ? "daily" : c?.cadence === "weekly" ? "weekly" : "none");

/** XP one member who does everything (Everyone campaigns) would earn, by cadence. */
function xpBudget(tree) {
  const { season, chapters = [], campaigns = [], activities = [] } = tree || {};
  const wins = chapterWindows(season, chapters);
  const byId = new Map(wins.map((c) => [c.id, c]));
  const byCadence = { daily: 0, weekly: 0, story: 0, milestone: 0, event: 0 };
  for (const c of campaigns) {
    if ((c.audience || "all") !== "all" || c.enabled === false) continue;
    const w = campaignWindow(c, byId.get(c.chapterId), season);
    const days = w.start != null && w.end != null && w.end > w.start ? Math.ceil((w.end - w.start) / DAY) : 0;
    const weeks = Math.ceil(days / 7);
    let xp = 0;
    for (const a of activities.filter((x) => x.campaignId === c.id && x.enabled !== false)) {
      const r = repeatOf(a, c), each = Math.max(0, Number(a.xp) || 0);
      xp += r === "daily" ? each * days : r === "weekly" ? each * weeks : each;
    }
    const bonus = Math.max(0, Number(c.bonus?.xp) || 0);
    xp += c.cadence === "daily" ? bonus * days : c.cadence === "weekly" ? bonus * weeks : bonus;
    if (byCadence[c.cadence] != null) byCadence[c.cadence] += xp;
  }
  return { byCadence, total: Object.values(byCadence).reduce((a, b) => a + b, 0) };
}

const ok = (text) => ({ state: "ok", text });
const warn = (text) => ({ state: "warn", text });
const optional = (done, text) => ({ state: done ? "ok" : "", text });

function stageChecks(tree, ctx = {}) {
  const { season = {}, chapters = [], campaigns = [], activities = [] } = tree || {};
  const types = ctx.types || {};
  const others = (ctx.others || []).filter((s) => s.id !== season.id);
  const now = ctx.now ?? Date.now();
  const wins = chapterWindows(season, chapters);
  const chapterOf = new Map(wins.map((c) => [c.id, c]));
  const start = num(season.startsAt), end = num(season.endsAt);
  const out = {};

  // 1 Theme
  const name = String(season.name || "").trim(), lower = name.toLowerCase();
  const clash = name && others.find((s) => String(s.name || "").trim().toLowerCase() === lower);
  out.theme = [
    name && String(season.pitch || "").trim() ? ok("Name and pitch filled in") : warn("Give the season a name and a one-line pitch"),
    season.art?.url ? ok("Art uploaded") : warn("Upload the season art"),
    !name ? warn("Name not checked yet") : clash ? warn(`"${name}" was already used by ${clash.name ? `another season` : clash.id}`) : ok("Name not used by another season"),
  ];

  // 2 Chapters
  const n = chapters.length;
  const unlocks = wins.map((c) => c.start);
  const datesOk = start != null && end != null && end > start && n > 0 && unlocks.every((u) => u != null)
    && dayKey(unlocks[0]) === dayKey(start) && unlocks.every((u, i) => u < end && (i === 0 || u > unlocks[i - 1]));
  const unnamed = chapters.filter((c) => !String(c.name || "").trim()).length;
  out.chapters = [
    n >= LIMITS.chaptersMin && n <= LIMITS.chaptersMax ? ok(`${plural(n, "chapter")} (2 to 5 allowed)`) : warn(`${plural(n, "chapter")}: a season has 2 to 5`),
    datesOk ? ok(`Unlock dates cover ${fmt(start)} to ${fmt(end - 1)}`) : warn(start == null || end == null ? "Set the season's start and end dates" : "The first chapter unlocks on the season's start, and each later one after it, before the end"),
    n && !unnamed ? ok("Every chapter has a name") : warn(n ? `${plural(unnamed, "chapter")} still need a name` : "Add chapters"),
  ];

  // 3 Campaigns
  const inCh = (cid) => campaigns.filter((c) => c.chapterId === cid);
  const noRhythm = wins.filter((c) => !inCh(c.id).some((x) => x.cadence === "daily" || x.cadence === "weekly"));
  const noStory = wins.filter((c) => !inCh(c.id).some((x) => x.cadence === "story"));
  const tooMany = wins.filter((c) => inCh(c.id).length > LIMITS.campaignsPerChapter);
  const chName = (c) => c.name || `Chapter ${wins.indexOf(c) + 1}`;
  out.campaigns = [
    n && !noRhythm.length ? ok("Every chapter has a Daily or Weekly campaign") : warn(n ? `Needs a Daily or Weekly campaign: ${listMore(noRhythm.map(chName))}` : "Add chapters first"),
    n && !noStory.length ? ok("Every chapter has a Story campaign") : warn(n ? `Needs a Story campaign: ${listMore(noStory.map(chName))}` : "Add chapters first"),
    !tooMany.length ? ok(`${plural(campaigns.length, "campaign")} (no more than 6 per chapter)`) : warn(`More than 6 campaigns in ${listMore(tooMany.map(chName))}`),
  ];

  // 4 Activities
  const actsOf = (cid) => activities.filter((a) => a.campaignId === cid);
  const empty = campaigns.filter((c) => !actsOf(c.id).length);
  const offTypes = [...new Set(activities.map((a) => a.typeId).filter((t) => types[t] !== true))];
  const dupes = [];
  for (const ch of wins) {
    // A duplicate: the same title, or the same rule (type, parameters, target and repeat), twice in a chapter.
    const titles = new Set(), rules = new Set();
    for (const c of inCh(ch.id)) for (const a of actsOf(c.id)) {
      const title = String(a.title || "").trim().toLowerCase();
      const rule = `${a.typeId}|${JSON.stringify(Object.entries(a.params || {}).sort())}|${a.target}|${repeatOf(a, c)}`;
      if ((title && titles.has(title)) || rules.has(rule)) dupes.push(a.title || a.id);
      titles.add(title); rules.add(rule);
    }
  }
  const filled = campaigns.length - empty.length;
  out.activities = [
    campaigns.length && !empty.length ? ok(`Every campaign has an activity (${plural(activities.length, "activity", "activities")})`) : warn(campaigns.length ? `${filled} of ${campaigns.length} campaigns have activities. Still empty: ${listMore(empty.map((c) => c.name || "Untitled"))}` : "Add campaigns first"),
    !offTypes.length ? ok("Every activity type used is live") : warn(`Not switched on: ${offTypes.join(", ")}`),
    !dupes.length ? ok("No duplicate activities in a chapter") : warn(`Duplicates in a chapter: ${listMore([...new Set(dupes)])}`),
  ];

  // 5 Rewards
  const budget = xpBudget(tree);
  const inRange = budget.total >= BUDGET.min && budget.total <= BUDGET.max;
  const hasBadge = !!(season.badgeId || season.badge?.name);
  out.rewards = [
    { state: inRange ? "ok" : "warn", text: inRange ? `${budget.total.toLocaleString("en-US")} XP for an all-in member (3,000 to 4,000)` : `${budget.total.toLocaleString("en-US")} XP is ${budget.total < BUDGET.min ? "below" : "above"} the 3,000 to 4,000 guide. ${budget.total < BUDGET.min ? "Add activities or raise XP." : "Trim weekly XP or drop a weekly activity."}`, soft: true },
    hasBadge ? ok("Season badge chosen") : warn("Choose the season badge"),
    optional(campaigns.some((c) => c.bonus?.badgeId), "Campaign bonus badges (optional)"),
  ];

  // 6 Schedule
  const overlap = start != null && end != null ? others.find((s) => !["draft", "archived"].includes(s.status) && num(s.startsAt) != null && num(s.endsAt) != null && start < s.endsAt && s.startsAt < end) : null;
  const events = campaigns.filter((c) => c.cadence === "event");
  const strayEvents = events.filter((c) => {
    const ch = chapterOf.get(c.chapterId);
    const o = num(c.opensAt), cl = num(c.closesAt);
    return !ch || o == null || cl == null || cl <= o || o < ch.start || (ch.end != null && cl > ch.end);
  });
  out.schedule = [
    datesOk ? ok(`Chapters cover ${fmt(start)} to ${fmt(end - 1)} with no gaps`) : warn("Fix the chapter dates (stage 2)"),
    start == null || end == null ? warn("Set the season's dates") : overlap ? warn(`Overlaps ${overlap.name || overlap.id} (${fmt(overlap.startsAt)} to ${fmt(overlap.endsAt - 1)})`) : ok("No overlap with another season"),
    !events.length ? optional(false, "Events sit inside their chapter (no events yet)") : !strayEvents.length ? ok("Every event sits inside its chapter") : warn(`Event dates outside their chapter: ${listMore(strayEvents.map((c) => c.name || "Untitled"))}`),
  ];

  const stageOk = (k) => out[k].every((c) => c.state !== "warn" || c.soft);
  const firstSix = ["theme", "chapters", "campaigns", "activities", "rewards", "schedule"];
  const readyToSubmit = firstSix.every(stageOk);
  const status = season.status || "draft";
  out.review = [
    ...firstSix.map((k) => (stageOk(k) ? ok(`${STAGES.find((s) => s[0] === k)[2]}: complete`) : warn(`${STAGES.find((s) => s[0] === k)[2]}: needs attention`))),
  ];
  out.live = [
    status === "live" ? ok("Live") : status === "ended" ? ok("Ended") : status === "scheduled" ? ok(`Scheduled for ${start != null ? fmt(start) : "its start date"}`) : optional(false, start != null ? `Goes live on ${fmt(start)} once approved` : "Goes live on its start date once approved"),
  ];

  // States: done when ok (Review when submitted or later; Live when live or ended); the first not done is "now".
  const after = ["review", "scheduled", "live", "ended", "archived"].includes(status);
  const done = {
    ...Object.fromEntries(firstSix.map((k) => [k, stageOk(k)])),
    review: readyToSubmit && ["scheduled", "live", "ended", "archived"].includes(status),
    live: ["live", "ended", "archived"].includes(status),
  };
  let nowSet = false;
  const stages = STAGES.map(([key, icon, label]) => {
    const checks = out[key];
    const good = checks.filter((c) => c.state === "ok").length;
    const warns = checks.filter((c) => c.state === "warn" && !c.soft).length + checks.filter((c) => c.state === "warn" && c.soft).length;
    let state = done[key] ? "done" : "todo";
    if (state === "todo" && !nowSet) { state = "now"; nowSet = true; }
    const line = key === "chapters" && n ? plural(n, "chapter")
      : key === "campaigns" && campaigns.length ? plural(campaigns.length, "campaign")
      : key === "activities" && campaigns.length ? (empty.length ? `${filled} of ${campaigns.length} filled` : plural(activities.length, "activity", "activities"))
      : key === "review" ? (done.review ? "Approved" : status === "review" || after ? "In review" : "After 1 to 6")
      : key === "live" ? (start != null ? fmt(start) : "Not dated")
      : done[key] && !warns ? "Done" : warns ? plural(warns, "warning") : `${good} of ${checks.length} checks`;
    return { key, icon, label, ok: !!done[key], state, status: line, pct: Math.round((good / Math.max(1, checks.length)) * 100), checks: checks.map(({ state: s, text }) => ({ state: s, text })) };
  });
  return { stages, budget, readyToSubmit };
}

export { STAGES, BUDGET, LIMITS, CADENCE_NAMES, chapterWindows, campaignWindow, xpBudget, stageChecks, dayKey };
