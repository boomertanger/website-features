// /admin: the Hotline Boom card (docs/specs/hotline-boom.md §2): how many New messages wait in the lanes this viewer may read (the owner: both; an inbox admin: the team lane only,
// never a hint of the owner lane) and a door to /admin/inbox. Shown to the owner and to admins whose crewGrade is in hotline/main.inboxGrades; display only (the rules decide).
import { whenReady } from "../../lib/auth";
import { auth } from "../../lib/firebase";
import { db, doc, getDoc, collection, query, where, getCount, SITE_ID } from "../../lib/db";

const card = document.querySelector<HTMLElement>("[data-hotline-card]");

whenReady().then(async (s) => {
  if (!card || !s.user || s.status === "needsSignup") return;
  try {
    const [site, main, tok] = await Promise.all([getDoc(doc(db, "sites", SITE_ID)), getDoc(doc(db, "sites", SITE_ID, "hotline", "main")), auth.currentUser!.getIdTokenResult()]);
    const owner = site.get("ownerUid") === s.user.uid;
    const grades = main.exists() && Array.isArray(main.get("inboxGrades")) ? (main.get("inboxGrades") as string[]) : ["A2", "A3"];
    const grade = tok.claims.crewGrade;
    if (!owner && !(typeof grade === "string" && grades.includes(grade))) return;
    const lanes = owner ? ["teamMessages", "ownerMessages"] : ["teamMessages"];
    const counts = await Promise.all(lanes.map(async (l) => (await getCount(query(collection(db, "sites", SITE_ID, "hotline", "main", l), where("status", "==", "new")))).data().count));
    const n = counts.reduce((a, b) => a + b, 0);
    card.querySelector<HTMLElement>("[data-hb-n]")!.textContent = String(n);
    card.querySelector<HTMLElement>("[data-hb-what]")!.textContent = n === 1 ? "new message waiting" : "new messages waiting";
    card.querySelector<HTMLElement>("[data-hb-lead]")!.textContent = owner ? "Every line, the gold ones too." : "The team lines: Say hi, Feedback and Account help.";
    card.hidden = false;
  } catch (err) { console.warn("hotline card: couldn't count", err); }
});
