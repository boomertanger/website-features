// A Crew Academy module page: the Try it widget loader (the contract C2a and C2b share), the quiz and the
// passed state. Nothing here holds a quiz answer: the server grades (callable academySubmitQuiz), and in the
// ?as= preview a stub answers every question neutrally.
import { initHowItWorks } from "../../../../../shared/ui/how-it-works.js";
import { initFlipCards } from "../../../../../shared/ui/flip-card.js";
import { initQuiz } from "../../../../../shared/ui/quiz.js";
import { crewCall } from "../api";
import { reasonOf } from "../../../lib/errors";
import { onAccess } from "../layout";
import { isPreview, loadPassed } from "./progress";

initHowItWorks(document);
initFlipCards();

const root = document.querySelector<HTMLElement>("[data-academy-module]");
const moduleId = root?.dataset.academyModule ?? "";

// Try it widgets: scripts/crew/academy/tryit/<slug>.ts, each `export default function init(root: HTMLElement): void`.
// The widget draws its own card into the container; the container stays hidden when there is no file.
const tryits = import.meta.glob("./tryit/*.ts");
document.querySelectorAll<HTMLElement>("[data-tryit]").forEach(async (box) => {
  const load = tryits[`./tryit/${box.dataset.tryit}.ts`];
  if (!load) return;
  try {
    const mod = (await load()) as { default: (root: HTMLElement) => void };
    mod.default(box);
    box.hidden = false;
  } catch (e) { console.error("tryit failed", e); }
});

let preview = false;
const markPassed = () => {
  document.querySelectorAll<HTMLElement>("[data-passed-only]").forEach((el) => { el.hidden = false; });
  document.querySelectorAll<HTMLElement>("[data-notpassed-only]").forEach((el) => { el.hidden = true; });
  document.querySelector<HTMLElement>(".bt-flip")?.classList.add("is-earned");
};

onAccess(async (s) => {
  preview = isPreview(s);
  if (!moduleId) return;
  if ((await loadPassed(s)).includes(moduleId)) markPassed();
});

/** A clear, specific message for every way the quiz call can fail (the quiz shows the Error's userMessage). */
function quizError(e: unknown) {
  const code = (e as { code?: string })?.code || "";
  const reason = reasonOf(e);
  const say =
    reason === "notCrew" ? "The Academy quiz is for crew members. If you've left the crew, ask Boomer about the fast-track back."
    : reason === "soon" ? "This module opens when Chat Games do, so there's no quiz yet."
    : reason === "answers" ? "Answer all five questions before you check."
    : reason === "noModule" ? "We couldn't find that module. Refresh the page and try again."
    : reason === "signedOut" || code === "functions/unauthenticated" ? "You're signed out. Sign in again, then check your answers."
    : code === "functions/unavailable" || code === "functions/deadline-exceeded" || /network|offline/i.test(String((e as Error)?.message || "")) ? "We couldn't reach the server. Check your connection and press Check answers again; your answers are still here."
    : code === "functions/resource-exhausted" ? "That's a lot of tries in a row. Wait a minute and try again."
    : "Something went wrong on our side while grading. Your answers are still here, so try again in a moment.";
  const err = new Error(say) as Error & { userMessage: string };
  err.userMessage = say;
  return err;
}

interface Submit { ok: boolean; passed: boolean; score: number; passMark: number; results: { correct: boolean; say: string }[]; paid?: boolean }
const quizBox = document.querySelector<HTMLElement>("[data-academy-quiz]");
if (quizBox && moduleId) {
  initQuiz(quizBox, {
    submit: async (answers: number[]) => {
      if (preview) {
        // Harmless stub: grading runs on the server, so the preview never has (or ships) the key.
        return { results: answers.map(() => ({ correct: false, say: "(preview: grading runs on the server)" })), passed: false, say: "Preview only: sign in with a crew account to take the quiz for real." };
      }
      let r: Submit;
      try { r = await crewCall<Submit>("academySubmitQuiz", { moduleId, answers }); }
      catch (e) { throw quizError(e); }
      const say = r.passed
        ? (r.paid ? "Passed! That's +5 Gears for finishing this module." : "Passed again. You already earned this module's Gears.")
        : `You need ${r.passMark} right to pass. Re-read the chapters and try again.`;
      return { results: r.results, passed: r.passed, say };
    },
    onResult: (o: { passed: boolean }) => { if (o.passed && !preview) markPassed(); },
  });
}
