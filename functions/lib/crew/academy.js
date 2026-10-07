// Crew Academy quizzes (docs/specs/mod-machina.md section 12, docs/specs/crew-academy.md). Answers are checked
// on the server from functions/data/crew-academy.json (generated from the spec by scripts/build-crew-academy.js),
// so a browser never receives them. Pass mark 4 of 5; passing pays the Academy Gears once per module.
//
//   academySubmitQuiz({ moduleId, answers: [0-2 x 5] }) -> { passed, score, results: [{ correct, say }], paid }
// academyProgress/{uid}: { modules: { m1: { passedAt, score, attempts } }, attempts: { m1: 3 } }
const { onCall } = require("firebase-functions/v2/https");
const data = require("../../data/crew-academy.json");
const { paths } = require("./settings");
const { makeStore, fail } = require("./store");

const MODULES = new Map(data.modules.map((m) => [m.id, m]));

/** Grades one attempt. answers: an index per question. Pure; used by the callable and by check-crew.js. */
function grade(mod, answers) {
  if (!mod) throw new Error("grade: no module");
  const results = mod.quiz.map((q, i) => ({ correct: Number.isInteger(answers?.[i]) && answers[i] === q.answer, say: q.say }));
  const score = results.filter((r) => r.correct).length;
  return { score, passed: score >= data.passMark, results };
}

module.exports = function crewAcademy({ adminLogEntry, gears }) {
  const S = makeStore({ adminLogEntry });
  const { db, Timestamp } = S;

  const academySubmitQuiz = onCall(async (request) => {
    const uid = S.requireAuth(request);
    const { moduleId, answers } = request.data || {};
    const mod = MODULES.get(moduleId);
    if (!mod) throw fail("invalid-argument", "That module doesn't exist.", "noModule");
    if (!Array.isArray(answers) || answers.length !== mod.quiz.length || answers.some((a) => !Number.isInteger(a) || a < 0 || a > 2)) {
      throw fail("invalid-argument", `Answer all ${mod.quiz.length} questions.`, "answers");
    }
    if (mod.soon) throw fail("failed-precondition", "That module opens when Chat Games do.", "soon");
    const w = await S.who(uid);
    if (!w.roster || w.roster.status === "alumni") throw fail("permission-denied", "The Academy is for the crew.", "notCrew");
    const r = grade(mod, answers);
    const ref = db.doc(paths.academy(uid));
    const now = Date.now();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? snap.data() : {};
      const modules = { ...(cur.modules || {}) }, attempts = { ...(cur.attempts || {}) };
      attempts[moduleId] = (attempts[moduleId] || 0) + 1;
      if (r.passed && !modules[moduleId]) modules[moduleId] = { passedAt: Timestamp.fromMillis(now), score: r.score };
      else if (r.passed && r.score > (modules[moduleId].score || 0)) modules[moduleId] = { ...modules[moduleId], score: r.score };
      tx.set(ref, { modules, attempts, updatedAt: Timestamp.fromMillis(now) }, { merge: false });
    });
    let paid = false;
    if (r.passed) paid = (await gears.grantAcademy(uid, moduleId)).granted === true;
    return { ok: true, passed: r.passed, score: r.score, passMark: data.passMark, results: r.results, paid };
  });

  return { academySubmitQuiz };
};
module.exports.grade = grade;
module.exports.MODULES = MODULES;
