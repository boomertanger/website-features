// site/src/scripts/base-camp/skipper-cam.ts — the Skipper Cam on /base-camp/skipper (docs/specs/base-camp.md "Skipper Cam"). Reads the public status
// sites/boomertanger/public/skipperCam { live, since, lastOn } (again every 60 seconds while the tab is visible, never faster) and shows:
//   visitors / mid-signup     the cam-off room, blurred, with the lock card ("The Skipper Cam is for the Fan Club")
//   members, live             the muted youtube-nocookie embed (no controls, so no audio control) and a Live badge; the video id comes from the
//                             skipperCamWatch callable, which hands it out to signed-in members only while the cam is live (never stored here)
//   members, off              the painted sleeping Skipper in her bed and "Last on <date>"
// The hero chip and the side chip follow the status for everyone. Preview (not production): ?cam=live|off fakes the status, and live shows the
// hero poster with a Sample badge instead of an embed; ?as=member previews a member.
import { onAuth, type AuthState } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";
import { messageFor } from "../../lib/errors";
import { lockCard, esc } from "./ui";
import { posterUrl } from "./skipper-art";
import data from "../../data/base-camp/skipper.json";

interface CamStatus { live: boolean; since: number | null; lastOn: number | null }
type Who = "loading" | "visitor" | "signup" | "member";
const PREVIEW_HOSTS = ["localhost", "127.0.0.1", "staging.boomertanger.com"];
const preview = () => !isProduction && PREVIEW_HOSTS.includes(location.hostname);
const ms = (t: any): number | null => (t == null ? null : typeof t === "number" ? t : typeof t.toMillis === "function" ? t.toMillis() : null);
const when = (t: number) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)).replace(" AM", " am").replace(" PM", " pm");

export function mountSkipperCam(root: HTMLElement) {
  const cam = root.querySelector<HTMLElement>("[data-sk-cam]");
  if (!cam) return;
  const screen = cam.querySelector<HTMLElement>("[data-sk-cam-screen]")!;
  const hud = cam.querySelector<HTMLElement>("[data-sk-cam-hud]")!;
  const lock = cam.querySelector<HTMLElement>("[data-sk-cam-lock]")!;
  const text = cam.querySelector<HTMLElement>("[data-sk-cam-text]")!;
  const chips = [...root.querySelectorAll<HTMLElement>("[data-sk-camchip]")];
  const camPreview = preview() ? new URLSearchParams(location.search).get("cam") : null;
  let status: CamStatus = { live: camPreview === "live", since: null, lastOn: camPreview === "off" ? Date.now() - 2 * 86400000 : null };
  let who: Who = "loading";
  let shownId: string | null = null, asking = false;

  const offScene = () => screen.querySelector("svg.sk-cam-off");
  function setScreen(kind: "off" | "embed" | "poster", videoId = "") {
    screen.querySelectorAll("iframe, img.sk-cam-poster").forEach((el) => el.remove());
    offScene()?.removeAttribute("hidden");
    shownId = null;
    if (kind === "embed") {
      const f = document.createElement("iframe");
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1`;
      f.title = "Skipper Cam (live, muted)";
      f.allow = "autoplay; encrypted-media; picture-in-picture";
      f.referrerPolicy = "strict-origin-when-cross-origin";
      screen.insertBefore(f, hud);
      offScene()?.setAttribute("hidden", "");
      shownId = videoId;
    } else if (kind === "poster") {
      const img = document.createElement("img");
      img.className = "sk-cam-poster"; img.alt = "Sample: Skipper on her pool float"; img.src = posterUrl("hero", 900);
      screen.insertBefore(img, hud);
      offScene()?.setAttribute("hidden", "");
    }
  }

  function render() {
    const live = status.live;
    chips.forEach((c, i) => {
      c.classList.toggle("is-live", live);
      c.querySelector("span")!.textContent = i === 0 ? `Skipper Cam: ${live ? "live now" : "off duty"}` : live ? "Live now" : "Off duty";
    });
    text.textContent = live ? data.cam.liveText : data.cam.offText;
    const member = who === "member";
    screen.classList.toggle("is-locked", !member);
    lock.innerHTML = member ? "" : lockCard({ status: who === "loading" ? "loading" : who === "signup" ? "signup" : "visitor" }, data.cam.lock.title, data.cam.lock.text, "#sk-ch2", "Join free to watch the Skipper Cam");
    if (!member || !live) {
      setScreen("off");
      hud.innerHTML = `<span>Off duty</span>${member && !live && status.lastOn ? `<span>Last on ${esc(when(status.lastOn))}</span>` : ""}`;
      return;
    }
    if (camPreview === "live") { setScreen("poster"); hud.innerHTML = `<span class="is-live">● Live</span><span>🔇 Muted · sample</span>`; return; }
    hud.innerHTML = `<span class="is-live">● Live</span><span>🔇 Muted</span>`;
    if (shownId || asking) return;
    asking = true;
    import("../../lib/call").then(({ call }) => call<{ videoId: string }>("skipperCamWatch"))
      .then((r) => { if (status.live && who === "member" && r?.videoId) setScreen("embed", r.videoId); })
      .catch((err) => { setScreen("off"); hud.innerHTML = `<span>${esc(messageFor(err, "The cam isn't ready yet. Try again in a minute."))}</span>`; })
      .finally(() => { asking = false; });
  }

  async function readStatus() {
    if (camPreview) return;
    try {
      const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
      const s = await getDoc(doc(db, "sites", SITE_ID, "public", "skipperCam"));
      const d = s.exists() ? s.data() : {};
      const next = { live: d.live === true, since: ms(d.since), lastOn: ms(d.lastOn) };
      const changed = next.live !== status.live || next.lastOn !== status.lastOn;
      status = next;
      if (changed || who === "member") render();
    } catch (err) { console.warn("skipper cam: couldn't read the status", err); }
  }

  onAuth((s: AuthState) => {
    if (s.status === "loading") return;
    const prev = who;
    if (!s.user) who = preview() && ["member", "admin"].includes(new URLSearchParams(location.search).get("as") || "") ? "member" : "visitor";
    else who = s.status === "needsSignup" ? "signup" : "member";
    if (prev !== who) render();
  });
  render();
  void readStatus();
  setInterval(() => { if (document.visibilityState === "visible") void readStatus(); }, 60000);
}
