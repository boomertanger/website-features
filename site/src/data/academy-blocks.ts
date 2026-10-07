// The extras around each module's prose (docs/specs/crew-academy.md): placards, the seats flow, tiles, prompt
// chips, the Try it lede and Ask BOOMBOT questions. Markup strings use only kit classes (.bt-placard, .bt-tile,
// .bt-room) plus the page's cra-* classes (styles/crew-academy.css). Chapter keys are 1-based, in the order the
// module's headings appear. No quiz answers live here.
import { roomHtml } from "../../../shared/ui/crew.js";

const placard = (title: string, rules: [string, string, string][]) =>
  `<div class="bt-placard"><div class="bt-placard-head"><i aria-hidden="true"></i><b>${title}</b><i aria-hidden="true"></i></div><ol class="bt-placard-list">${rules.map(([t, ic, d], i) => `<li class="bt-placard-rule"><span class="bt-placard-n" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><b>${t} <span aria-hidden="true">${ic}</span></b><span>${d}</span></li>`).join("")}</ol></div>`;
const tiles = (items: [string, string][]) => `<div class="cra-why">${items.map(([t, d]) => `<div class="bt-tile"><b>${t}</b><p>${d}</p></div>`).join("")}</div>`;
const chips = (items: string[]) => `<ul class="cra-chips">${items.map((t) => `<li>${t}</li>`).join("")}</ul>`;
const say = (text: string, who = "Try saying") => `<figure class="cra-say"><figcaption>${who}</figcaption><blockquote>${text}</blockquote></figure>`;

const FLOW: [string, string, string, string, string][] = [
  ["dk", "⚓", "Deckhand", "Anyone on the crew. Helps in a chat and takes the lead when a lead steps away.", "Starts here"],
  ["rl", "💬", "Room Lead", "Looks after one chat for the stream. Watchers can lead a chat.", "Watcher+"],
  ["sc", "🧭", "Stream Captain", "Watches every chat so the leads can watch theirs. Wardens can Captain.", "Warden+"],
  ["bt", "", "Boomer", "Plays the game, and hears about anything serious through Flag in the Mod Deck.", "Final say"],
];
const flow = (mascot: string) => `<div class="cra-flow" role="list" aria-label="Seats, from Deckhand to Boomer">${FLOW.map(([k, ic, t, d, tag], i) => `${i ? `<div class="ai-arr" aria-hidden="true"><i><b></b></i></div>` : ""}<div class="bt-card ai-node cra-node cra-node--${k}" role="listitem"><div class="ai-node-top">${k === "bt" ? mascot : `<span class="bt-icon-tile--lg ai-node-ic" aria-hidden="true">${ic}</span>`}<span class="bt-badge bt-badge--${k === "dk" ? "teal" : k === "rl" ? "blue" : k === "sc" ? "gold" : "pink"}">${tag}</span></div><h3>${t}</h3><p>${d}</p></div>`).join("")}</div>`;

export const CODE: [string, string, string][] = [
  ["Life comes first", "⏳", "Duties flex around real life. Step away, hand off, or go dark whenever you need to."],
  ["Friendly before firm", "🤝", "Begin with the softest step that does the job. Most people just didn't know."],
  ["Personal info stays private", "🔒", "Never repeat, screenshot or share it, even to report it."],
  ["Mod powers aren't for grudges", "⚖️", "Not ours, and not a friend's. Every chat moment follows the same ladder."],
  ["Flag what matters", "🚩", "Anything serious goes to the Captain and to Boomer, through Flag in the Mod Deck."],
  ["We're one crew", "🛟", "Every chat and every viewer counts the same."],
];

/** Blocks shown after a chapter's prose. `mascot` is the rendered Mascot (for the flow's Boomer node). */
export function chapterBlocks(slug: string, n: number, mascot: string): string {
  switch (`${slug}:${n}`) {
    case "welcome:3": return placard("The Crew Code", CODE);
    case "house-rules:1": return tiles([["Most people just didn't know", "New viewers miss rules all the time. A friendly reminder fixes most problems."], ["Everyone is watching", "How you handle one person shows the whole chat what kind of place this is."], ["Boomer's playing", "He shouldn't have to stop the game to moderate. That's what the crew is for."]]);
    case "house-rules:2": return placard("Escalation ladder", [["Remind", "💬", "A light, public nudge about the rule."], ["Warn", "⚠️", "Name the rule and what happens next. Calm, short, never sarcastic."], ["Timeout", "⏳", "1 to 10 minutes. Note it in the Mod Deck so the next lead knows."], ["Ban", "🚫", "For people who won't stop, or for anything in the next chapter."]]);
    case "house-rules:3": return `<div class="cra-skip">${[["☣️", "Hate or slurs", "Against anyone, joking or not.", "red"], ["🎯", "Threats or doxxing", "Any threat, or anyone's personal info.", "red"], ["🤖", "Spam bots and scam links", "Follower sellers, scam links, raid bots.", "red"], ["🫂", "Someone in crisis", "Don't ban. Flag Boomer right away.", "teal"]].map(([ic, t, d, c]) => `<div class="bt-card cra-skip-card" style="--c:var(--bt-${c})"><span class="bt-icon-tile--lg" aria-hidden="true">${ic}</span><div><h3>${t}</h3><p>${d}</p></div></div>`).join("")}</div>`;
    case "house-rules:4": return `<ul class="cra-never"><li>Argue with someone in chat. Take it to a timeout or let it go.</li><li>Repeat or screenshot someone's personal info, even to report it.</li><li>Use mod powers on a friend's say-so.</li><li>DM a viewer who's under 18.</li></ul>`;
    case "house-rules:5": return placard("House rules for chat", [["Be kind", "💛", "Critique the game, not the people."], ["No spoilers", "🙊", "Not for games Boomer hasn't finished."], ["No backseating", "🎮", "Unless he asks."], ["No self-promo or links", "🔗", "A reminder is enough the first time."], ["English only", "💬", "So every mod can read it."], ["PG-13 in words", "🎃", "Horror in spirit, not in language."]]);
    case "platforms:4": return `<div class="bt-rooms cra-rooms">${roomHtml({ chat: "twitch", name: "Twitch", state: "covered", text: "same ladder" })}${roomHtml({ chat: "ytLandscape", name: "YT landscape", state: "covered", text: "same ladder" })}${roomHtml({ chat: "ytVertical", name: "YT vertical", state: "covered", text: "same ladder" })}${roomHtml({ chat: "tiktok", name: "TikTok", state: "covered", text: "same ladder" })}</div>`;
    case "stream-duty:1": return flow(mascot);
    case "engagement:1": return say("welcome in Rachel! he's on night 3, chat thinks the doctor is behind the curtain.");
    case "engagement:2": return chips(["Door or vent?", "First time watching Outlast?", "Emoji poll: scared or fine?", "Who remembers last stream's jump scare?"]);
    case "engagement:3": return chips(["Clue 3 just dropped in YouTube vertical", "TikTok is winning Scream Off per viewer, Twitch, you good?", "Your chat's check-in code"]);
    default: return "";
  }
}

export const TRYIT: Record<string, { title: string; lede: string }> = {
  welcome: { title: "Which rule is this?", lede: "Three short chat moments. Tap the Crew Code rule each one tests." },
  "house-rules": { title: "The quiz is your Try it", lede: "There's no separate example here. Pick an answer in the quiz below, and BOOMBOT replies." },
  platforms: { title: "Where's the button?", lede: "Pick an app and an action, and see where to tap in a drawn mini chat." },
  "stream-duty": { title: "Pass the lantern", lede: "Step away for a while and watch the handoff, the same one you'll use on a real stream." },
  engagement: { title: "Revive this chat", lede: "A quiet example chat and three prompts. Pick one and see how chat answers." },
  tools: { title: "A mini Mod Deck", lede: "Clock in, step away, post a cue and copy the code. Each step lights up when done." },
  recruiting: { title: "Link builder", lede: "Pick where you'll share your link and get a ready-made line written for that place." },
  safety: { title: "Flag or handle?", lede: "Eight short chat moments. Sort each one: handle with the ladder, ban and flag, or flag Boomer now." },
  captain: { title: "Coverage drill", lede: "Four chats, and leads who step away on a timer. Keep every tile green." },
};

export const FAQ: Record<string, [string, string][]> = {
  welcome: [["Do I have to be on every stream?", "No. You're a volunteer. Two duties a month keeps you Active, and you can step away or plan a break whenever you need to."], ["Who do I ask when I'm not sure?", "Your Room Lead on a stream. The Captain for anything touching more than one chat. Boomer, through Flag in the Mod Deck, for anything serious."]],
  "house-rules": [["Can I ban straight away?", "Only for hate, threats or doxxing, and spam bots or scam links. Everything else goes up the ladder one step at a time."], ["What if someone is struggling?", "Never ban. Flag Boomer right away, and the Safety module covers what to say."]],
  platforms: [["Do I have to learn all three apps?", "Learn the one you'll lead, then the basics of the others. The ladder is the same everywhere, even where the buttons differ."], ["Why is TikTok different?", "TikTok has no chat feed the site can show, so the Deck links out. Boomer adds TikTok LIVE moderators in the app."]],
  "stream-duty": [["What if nobody can take over my chat?", "The Captain is pinged, so someone always watches every chat."], ["Can I help on a stream I didn't sign up for?", "Yes. Drop in from the Mod Deck any time we're live."]],
  engagement: [["How often should I post a prompt?", "One every 10 to 15 quiet minutes. A stream of them is too many."], ["Can I copy a clue into another chat?", "No. Point people to where it dropped instead."]],
  tools: [["Where do my Gears show up?", "On your time card and in Crew HQ."], ["Who can award badges?", "Watchers up to Uncommon, Wardens up to Rare, always with a written reason and never to yourself."]],
  recruiting: [["When does a recruit count?", "When they sign up through your link and are still active after 7 days."], ["Where can I share my link?", "Your own socials, Discord servers that allow it, and friends who'd enjoy it. Not DMs to strangers or other streamers' chats."]],
  "chat-games": [["When does this module open?", "With Chat Games. Until then you can read the chapters, but there's no quiz."]],
  safety: [["Should I ever repeat personal info to report it?", "No. Remove it, then flag the Captain and Boomer without repeating it."], ["What do I say to someone in crisis?", "Reply once, kindly, in chat, then flag Boomer right away. Chapter 4 has the wording."]],
  captain: [["What does a gold tile mean?", "A chat needs someone. Cover it, move a seat, or ask a Deckhand to step up."], ["How do I flag Boomer mid-stream?", "With one clear sentence. He reads it between moments, not mid-scare."]],
};
