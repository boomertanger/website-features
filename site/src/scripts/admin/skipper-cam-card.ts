// /admin: the Skipper Cam card (docs/specs/base-camp.md "Skipper Cam"; mockup docs/design/mockups/base-camp-skipper.html admin screen). The owner
// only: the status (live / off duty), the YouTube video id of the unlisted live stream (from skipperCam/control, which only the owner reads), the
// three privacy checks, Go live (disabled until all three are ticked and there's an id), Turn off, and when it was last on. Every change goes
// through skipperCamSet; the server checks the owner and the three checks again. It turns itself off after 12 hours (skipperCamSweep).
import { whenReady } from "../../lib/auth";
import { messageFor } from "../../lib/errors";
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { toast } from "../../../../shared/ui/toast.js";

const card = document.querySelector<HTMLElement>("[data-skipcam-card]");
const ms = (t: any): number | null => (t == null ? null : typeof t === "number" ? t : t.toMillis?.() ?? null);
const when = (t: number | null) => (t ? new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

whenReady().then(async (s) => {
  if (!card || !s.user) return;
  try {
    const site = await getDoc(doc(db, "sites", SITE_ID));
    if (site.get("ownerUid") !== s.user.uid) return;
    card.hidden = false;
    const chip = card.querySelector<HTMLElement>("[data-sc-chip]")!, last = card.querySelector<HTMLElement>("[data-sc-last]")!;
    const id = card.querySelector<HTMLInputElement>("[data-sc-id]")!, go = card.querySelector<HTMLButtonElement>("[data-sc-go]")!, off = card.querySelector<HTMLButtonElement>("[data-sc-off]")!;
    const checks = [...card.querySelectorAll<HTMLInputElement>("[data-sc-check]")];
    const sync = () => { go.disabled = !checks.every((c) => c.checked) || !id.value.trim(); };
    const paint = (pub: any) => {
      const live = !!pub?.live;
      chip.className = `bt-badge ${live ? "bt-badge--red" : "bt-badge--gray"}`;
      chip.textContent = live ? "● Live now" : "Off duty";
      last.textContent = live ? `Live since ${when(ms(pub.since))}. Turns off by itself after 12 hours.` : `Last on ${when(ms(pub?.lastOn))}. Turns off by itself after 12 hours.`;
      go.hidden = live; off.hidden = !live;
    };
    const [pub, ctl] = await Promise.all([getDoc(doc(db, "sites", SITE_ID, "public", "skipperCam")), getDoc(doc(db, "sites", SITE_ID, "skipperCam", "control"))]);
    if (ctl.exists() && ctl.get("videoId")) id.value = ctl.get("videoId");
    paint(pub.exists() ? pub.data() : null);
    checks.forEach((c) => c.addEventListener("change", sync)); id.addEventListener("input", sync); sync();
    const run = async (data: object, btn: HTMLButtonElement, done: string) => {
      btn.disabled = true;
      try {
        const { call } = await import("../../lib/call");
        await call("skipperCamSet", data);
        paint((await getDoc(doc(db, "sites", SITE_ID, "public", "skipperCam"))).data());
        checks.forEach((c) => (c.checked = false)); sync();
        toast(done);
      } catch (err) { toast(messageFor(err), { kind: "error" }); }
      finally { btn.disabled = false; sync(); }
    };
    go.addEventListener("click", () => run({ live: true, videoId: id.value.trim(), checks: { sound: checks[0].checked, privateDetails: checks[1].checked, window: checks[2].checked } }, go, "The Skipper Cam is live for the Fan Club."));
    off.addEventListener("click", () => run({ live: false }, off, "The Skipper Cam is off."));
  } catch (err) { console.warn("skipper cam card:", err); }
});
