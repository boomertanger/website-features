// Try it for module 7 "Recruiting": a link builder. Pick where you'll share your link and get a ready-made line for
// that place, or a kind "Not here" where it isn't welcome. Local only (docs/specs/crew-academy.md §7).
import { mountShell, esc, copyText } from "../tryit-kit";
import { toast } from "../../../../../../shared/ui/toast.js";

const LINK = "https://boomertanger.com/join/@you";

interface Place { id: string; name: string; sub: string; line?: string; why?: string; instead?: string }

const PLACES: Place[] = [
  { id: "socials", name: "Your own socials", sub: "Your posts, bio or stories",
    line: `I help moderate the chat for Boomertanger's horror streams, and it's honestly the friendliest crew. If you like scary games with people who are kind, come hang out: ${LINK}` },
  { id: "discord", name: "A Discord that allows it", sub: "A server with a place for invites",
    line: `Hey all! If anyone here likes horror games and a chat that's actually nice, Boomertanger's is a good one. Mods are friendly and it stays PG-13. Hope it's OK to share it here: ${LINK}` },
  { id: "friend", name: "A friend, in a DM", sub: "Someone who'd really enjoy it",
    line: `Hey! Thought of you. Boomertanger streams horror games and the chat is lovely. No pressure at all, but here's my invite link in case it sounds fun: ${LINK}` },
  { id: "ours", name: "Our own chat", sub: "Once, with your last post over an hour ago",
    line: `Loving the scares? Members get extra perks and the crew is always friendly. If you'd like to join in, my link is ${LINK} (I only post it now and then!)` },
  { id: "strangers", name: "A DM to someone you don't know", sub: "A cold message",
    why: "A message out of nowhere feels like spam, even when you mean well, and it can make the person uncomfortable. Crew also never DM viewers who might be under 18.",
    instead: "Say hi in chat, get to know people, and share your link where people have chosen to hear from you." },
  { id: "other", name: "Another streamer's chat", sub: "Someone else's community",
    why: "Dropping a link in another streamer's chat is a rude surprise for them, and it can get you banned there. It reflects on Boomer too.",
    instead: "Cheer them on, be a good guest, and share your link on your own socials or with friends." },
  { id: "again", name: "Our chat, 20 minutes after your last post", sub: "Posting it again soon",
    why: "More than once an hour in our chats starts to feel like spam and pushes the chat's own conversation out of view.",
    instead: "Wait until it's been an hour, or let your last post do its work. During Recruit Rush, hype the shared goal instead of your link." },
];

export default function init(root: HTMLElement): void {
  const { body, done } = mountShell(root, "a link builder", "Pick where you'll share your link and get a ready-made line written for that place.");
  let picked = "";
  let copied = false;

  body.innerHTML = `<div class="ta2-places" role="group" aria-label="Where will you share it?">`
    + PLACES.map((p) => `<button type="button" class="ta2-place" data-id="${p.id}" aria-pressed="false">${esc(p.name)}<small>${esc(p.sub)}</small></button>`).join("")
    + `</div><div class="ta2-out" data-s="idle" aria-live="polite"><p class="ta2-why">Your line shows up here. Your sample link is <span class="bt-code">${esc(LINK.replace("https://", ""))}</span>, and yours will have your own handle.</p></div>`;
  const out = body.querySelector<HTMLElement>(".ta2-out")!;

  function show() {
    const p = PLACES.find((x) => x.id === picked)!;
    body.querySelectorAll<HTMLElement>(".ta2-place").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === picked)));
    if (p.line) {
      out.dataset.s = "ok";
      out.innerHTML = `<h4 class="ta2-h">A line for ${esc(p.name.toLowerCase())}</h4><p class="ta2-line">${esc(p.line)}</p>`
        + `<div class="ta2-row"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-copy>Copy line</button></div>`;
    } else {
      out.dataset.s = "no";
      out.innerHTML = `<h4 class="ta2-h">Not here</h4><p><b>${esc(p.name)}.</b> ${esc(p.why)}</p><p class="ta2-why">${esc(p.instead)}</p>`;
    }
  }

  body.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const place = t.closest<HTMLElement>(".ta2-place");
    if (place) { picked = place.dataset.id!; show(); return; }
    if (t.closest("[data-copy]")) {
      const p = PLACES.find((x) => x.id === picked);
      if (!p?.line) return;
      const ok = await copyText(p.line);
      toast(ok ? "Line copied" : "Couldn't copy here. Select the line and copy it yourself.", { kind: ok ? "ok" : "info" });
      if (!copied) {
        copied = true;
        done.hidden = false;
        done.innerHTML = `<b>Done</b><p>Nice. Paste it where it's welcome, in your own words if you like. Try the places that say "Not here" too, so you know why.</p>`;
      }
    }
  });
}
