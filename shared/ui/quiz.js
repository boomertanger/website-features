// shared/ui/quiz.js — .bt-quiz, a multiple-choice quiz that never knows the answers (docs/design-system.md §5
// "Quiz"; Mod Machina Academy, docs/specs/crew-academy.md). The page renders the questions it was given, collects
// one choice each, and hands the picks to an async submit(answers); the server grades and answers with a result
// per question. Nothing here (or in the browser) holds a key.
//
//   quizHtml({ questions, passMark, title, label })
//     questions: [{ text, options: [string, ...] }]; passMark: right answers needed (shown, and used when submit
//     returns no `passed`); title: the card head left of the pass mark (default "Question 1 of N", live)
//   initQuiz(root, { submit, onResult })  wires every .bt-quiz under root -> [{ reset }]
//     submit(answers): async; answers is an array of chosen option indexes, one per question. Returns either
//       an array of { correct, say } (one per question), or { results: [{ correct, say }], passed, say }
//       where passed (boolean) and say (BOOMBOT's overall reply) are optional. A throw shows an error line (the Error's userMessage when it has one) and
//       lets the person try again.
//     onResult(outcome): called after the results are drawn ({ results, passed, score, total, say })
//   showQuizResults(quizEl, answers, outcome)  draws results onto a quiz (initQuiz calls it; the UI Kit page uses
//       it to show the states without a server). Right picks go .is-right, wrong picks .is-wrong, the rest stay
//       neutral; each question shows BOOMBOT's `say`; the result card shows a ring, the score, pass or "Not quite".
import { escapeHtml as esc } from "./dom.js";
import { boombotIcon } from "./arcade.js";
import { ringHtml } from "./crew.js";
import { initRadioGroup } from "./pref.js";

let uid = 0;
const LETTERS = "ABCDEFGH";

function bubbleHtml(text, cls = "") {
  const id = `bt-quiz-bb-${++uid}`;
  return `<div class="bt-chat-a bt-quiz-say${cls ? ` ${cls}` : ""}"><span class="bt-chat-av">${boombotIcon(id)}</span><div class="bt-chat-bub"><small>BOOMBOT</small><span class="bt-chat-text">${esc(text)}</span></div></div>`;
}

export function quizHtml({ questions = [], passMark = 0, title = "", label = "Quiz" } = {}) {
  const n = questions.length;
  const qs = questions.map((q, i) => `<div class="bt-quiz-q" data-q="${i}"${i ? " hidden" : ""}>`
    + `<b class="bt-quiz-text" id="bt-quiz-${uid + 1}-q${i}">${esc(q.text)}</b>`
    + `<div class="bt-quiz-opts" role="radiogroup" aria-labelledby="bt-quiz-${uid + 1}-q${i}">${(q.options || []).map((o, k) => `<button type="button" role="radio" aria-checked="false" tabindex="${k ? -1 : 0}" class="bt-quiz-opt" data-value="${k}"><i aria-hidden="true">${LETTERS[k] || k + 1}</i><span>${esc(o)}</span></button>`).join("")}</div>`
    + `<div class="bt-quiz-slot"></div></div>`).join("");
  uid += 1;
  return `<div class="bt-quiz" data-quiz data-total="${n}" data-pass="${passMark || 0}" role="group" aria-label="${esc(label)}">`
    + `<div class="bt-card-head bt-quiz-head"><span class="bt-card-title" data-quiz-title aria-live="polite">${esc(title || `Question 1 of ${n}`)}</span>${passMark ? `<span class="bt-card-meta">Pass mark ${passMark} of ${n}</span>` : ""}</div>`
    + `<div class="bt-steps" aria-hidden="true">${questions.map((_, i) => `<i class="${i === 0 ? "is-on" : ""}"></i>`).join("")}</div>`
    + `<div class="bt-quiz-result" role="status" hidden></div>`
    + `<div class="bt-quiz-review">${qs}</div>`
    + `<p class="bt-field-state bt-field-state--bad bt-quiz-error" role="alert" hidden></p>`
    + `<div class="bt-quiz-acts"><button type="button" class="bt-btn bt-btn--secondary" data-quiz-back hidden>Back</button><button type="button" class="bt-btn bt-btn--primary" data-quiz-next disabled>${n > 1 ? "Next question" : "Check answers"}</button></div></div>`;
}

function normalise(outcome, box, total) {
  const results = (Array.isArray(outcome) ? outcome : outcome?.results) || [];
  const score = results.filter((r) => r?.correct).length;
  const pass = Number(box.dataset.pass) || total;
  const passed = typeof outcome?.passed === "boolean" ? outcome.passed : score >= pass;
  return { results, passed, score, total, say: Array.isArray(outcome) ? "" : outcome?.say || "" };
}

export function showQuizResults(box, answers, outcome) {
  const qEls = [...box.querySelectorAll(".bt-quiz-q")];
  const o = outcome.score != null && outcome.total != null ? outcome : normalise(outcome, box, qEls.length);
  box.classList.add("is-checked");
  qEls.forEach((q, i) => {
    q.hidden = false;
    const r = o.results[i] || {};
    q.querySelectorAll(".bt-quiz-opt").forEach((b) => {
      const picked = Number(b.dataset.value) === answers[i];
      b.disabled = true;
      b.setAttribute("aria-checked", String(picked));
      b.classList.toggle("is-right", picked && !!r.correct);
      b.classList.toggle("is-wrong", picked && !r.correct);
      const mark = b.querySelector("i");
      if (picked) mark.textContent = r.correct ? "✓" : "✕";
    });
    const slot = q.querySelector(".bt-quiz-slot");
    slot.innerHTML = r.say ? bubbleHtml(r.say) : "";
  });
  const pct = o.total ? (o.score / o.total) * 100 : 0;
  const res = box.querySelector(".bt-quiz-result");
  res.hidden = false;
  res.dataset.state = o.passed ? "pass" : "fail";
  res.innerHTML = ringHtml({ value: pct, centre: `${o.score}/${o.total}`, caption: "Right", label: `${o.score} of ${o.total} right`, size: "sm", done: o.passed })
    + `<div class="bt-quiz-result-txt"><h3>${o.passed ? "Passed" : "Not quite"}</h3>`
    + `<p>${o.score} of ${o.total} right${box.dataset.pass > 0 ? ` · Pass mark ${box.dataset.pass}` : ""}</p>${o.say ? bubbleHtml(o.say) : ""}<div class="bt-quiz-result-acts"></div></div>`;
  box.querySelector(".bt-steps").hidden = true;
  box.querySelector("[data-quiz-title]").textContent = o.passed ? "Quiz passed" : "Quiz checked";
  box.querySelector(".bt-quiz-acts").hidden = true;
  return o;
}

export function initQuiz(root = document, { submit, onResult } = {}) {
  return [...root.querySelectorAll(".bt-quiz:not([data-quiz-ready])")].map((box) => {
    box.dataset.quizReady = "";
    const qEls = [...box.querySelectorAll(".bt-quiz-q")];
    const total = qEls.length;
    const next = box.querySelector("[data-quiz-next]");
    const back = box.querySelector("[data-quiz-back]");
    const err = box.querySelector(".bt-quiz-error");
    const title = box.querySelector("[data-quiz-title]");
    const fixedTitle = title.textContent !== `Question 1 of ${total}`;
    let at = 0;
    let busy = false;
    const answers = Array(total).fill(null);

    const paint = () => {
      qEls.forEach((q, i) => { q.hidden = i !== at; });
      box.querySelectorAll(".bt-steps i").forEach((s, i) => s.classList.toggle("is-on", i <= at));
      if (!fixedTitle) title.textContent = `Question ${at + 1} of ${total}`;
      back.hidden = at === 0;
      next.disabled = busy || answers[at] == null;
      next.textContent = at === total - 1 ? "Check answers" : "Next question";
    };
    qEls.forEach((q, i) => initRadioGroup(q.querySelector(".bt-quiz-opts"), {
      onChange: (v) => { answers[i] = Number(v); err.hidden = true; paint(); },
    }));
    back.addEventListener("click", () => { if (at > 0 && !busy) { at -= 1; paint(); } });
    next.addEventListener("click", async () => {
      if (busy || answers[at] == null) return;
      if (at < total - 1) { at += 1; paint(); box.querySelector(`.bt-quiz-q[data-q="${at}"] [role=radio][tabindex="0"]`)?.focus(); return; }
      if (!submit) return;
      busy = true; err.hidden = true; next.disabled = true; next.textContent = "Checking…";
      try {
        const raw = await submit(answers.slice());
        const o = showQuizResults(box, answers, normalise(raw, box, total));
        const acts = box.querySelector(".bt-quiz-result-acts");
        if (!o.passed && acts) {
          acts.innerHTML = `<button type="button" class="bt-btn bt-btn--secondary" data-quiz-retry>Try again</button>`;
          acts.querySelector("[data-quiz-retry]").addEventListener("click", reset);
        }
        onResult?.(o);
      } catch (e) {
        // A submit that throws an Error with a userMessage (written for people) shows that; anything else gets the general line.
        err.textContent = (e && typeof e.userMessage === "string" && e.userMessage) || "Couldn't check your answers. Try again.";
        err.hidden = false;
      } finally { busy = false; if (!box.classList.contains("is-checked")) paint(); }
    });

    function reset() {
      box.classList.remove("is-checked");
      answers.fill(null);
      at = 0;
      box.querySelector(".bt-quiz-result").hidden = true;
      box.querySelector(".bt-steps").hidden = false;
      box.querySelector(".bt-quiz-acts").hidden = false;
      box.querySelectorAll(".bt-quiz-opt").forEach((b) => {
        b.disabled = false;
        b.classList.remove("is-right", "is-wrong");
        b.setAttribute("aria-checked", "false");
        b.tabIndex = Number(b.dataset.value) === 0 ? 0 : -1;
        b.querySelector("i").textContent = LETTERS[Number(b.dataset.value)] || String(Number(b.dataset.value) + 1);
      });
      box.querySelectorAll(".bt-quiz-slot").forEach((s) => { s.innerHTML = ""; });
      paint();
      box.querySelector(".bt-quiz-opt")?.focus();
    }
    paint();
    return { reset };
  });
}
