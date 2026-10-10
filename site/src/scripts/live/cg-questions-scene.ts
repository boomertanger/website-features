// Questions on the stream view (docs/specs/chat-games.md §4, §14; mockup control-room-batch-3.html "questions" scene): Chat Games' scene for formatId
// "questions", registered with shared/ui/chatgames.js. The camera window beside (wide) or above (tall) a panel with the question in big type, the asker,
// the votes, "is here", the session timer and "Next up". It only uses obsFeed's chatGameDisplay (this page never starts Firebase). Canvas pixels; every
// text is at least 32 px. It is video, so motion stays on.
import { registerFormat } from "../../../../shared/ui/chatgames.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";

interface Display { questionId: string | null; text: string | null; handle: string | null; votes: number; here: boolean; lane: string | null; next: { text: string; votes: number } | null; ending: boolean; closesAt?: number | null }

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

function panelHtml(d: Display) {
  const lane = d.lane === "standing" ? "from the Standing lane" : "from the Tonight lane";
  if (!d.text) return `<div class="bt-sv-h"><i></i>Questions</div><div class="obs-cg-q">The next question is on its way</div><div class="obs-sub">Ask yours at <b class="obs-w">boomertanger.com/live</b></div>`;
  return `<div class="bt-sv-h"><i></i>Questions · ${lane}</div>
    <div class="obs-cg-q">${esc(d.text)}</div>
    <div class="obs-cg-by">${d.handle ? `<span>@${esc(d.handle)}</span>` : ""}<span class="obs-cg-votes">▲ ${d.votes || 0}</span>${d.here ? `<span class="obs-cg-here">● is here</span>` : ""}</div>
    <div class="obs-cg-timer" data-cg-timer ${d.closesAt ? "" : "hidden"}><i></i></div>
    <div class="obs-sub" data-cg-left>${d.ending ? "Last question" : ""}</div>
    ${d.next ? `<div class="obs-sub">Next up: "${esc(d.next.text)}" ▲ ${d.next.votes || 0}</div>` : ""}`;
}

function scene(el: HTMLElement, { display }: { display?: Display | null } = {}) {
  const host = el as HTMLElement & { _cgTick?: number; _cgTotal?: number; _cgClose?: number };
  if (host._cgTick) { clearInterval(host._cgTick); host._cgTick = 0; }
  if (!display) { el.innerHTML = ""; return; }
  const wide = (el.closest("[data-shape]") as HTMLElement | null)?.dataset.shape !== "tall";
  el.innerHTML = wide
    ? `<div class="obs-view obs-cg"><div class="bt-sv-cam" style="left:90px;top:120px;width:880px;height:760px">Your camera</div><div class="bt-sv-panel obs-on obs-stack" style="left:1040px;top:60px;width:800px;height:960px;padding:50px 60px">${panelHtml(display)}</div></div>`
    : `<div class="obs-view obs-cg"><div class="bt-sv-cam" style="left:70px;top:190px;width:780px;height:460px">Your camera</div><div class="bt-sv-panel obs-on obs-stack" style="left:70px;top:700px;width:940px;padding:48px 52px">${panelHtml(display)}</div></div>`;
  const close = display.closesAt || 0;
  if (!close) return;
  if (host._cgClose !== close) { host._cgClose = close; host._cgTotal = Math.max(60000, close - Date.now()); }
  const tick = () => {
    const left = Math.max(0, close - Date.now());
    const bar = el.querySelector<HTMLElement>("[data-cg-timer] i"), txt = el.querySelector<HTMLElement>("[data-cg-left]");
    if (bar) bar.style.width = `${Math.round((left / (host._cgTotal || 1)) * 100)}%`;
    if (txt && !display.ending) txt.textContent = left > 0 ? `${fmt(left)} left in this session` : "Last question";
  };
  tick();
  host._cgTick = window.setInterval(() => { if (!el.isConnected) { clearInterval(host._cgTick); return; } tick(); }, 1000);
}

registerFormat("questions", { scene });
export {};
