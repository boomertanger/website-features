// shared/ui-kit/kit-hotseat.js — the ".bt-seance" and ".bt-wheel" section of the UI Kit page (/dev/ui-kit): Hot Seat's two pickers
// (docs/specs/chat-games.md §5, §14) in every state. "Draw" and "Spin" replay a sample draw (in the build the picks come from the server).
// ui-kit.js appends hotSeatKitHtml() to the page and calls initHotSeatKit(mount).
import { seanceHtml, seanceDraw } from "../ui/seance.js";
import { wheelHtml, wheelSpin } from "../ui/wheel.js";

const NAMES = ["gbo", "cryptkeeper", "lanternjaw", "mothgirl", "ravenhex", "sallow", "nyx", "deadbolt", "fogbank", "wickless"];
const PICKS = [{ handle: "lanternjaw", status: "picked" }, { handle: "gbo", status: "picked" }, { handle: "ravenhex", status: "picked" }];
const SWAPPED = [{ handle: "lanternjaw", status: "in" }, { handle: "gbo", status: "replaced" }, { handle: "ravenhex", status: "in" }, { handle: "nyx", status: "picked" }];

export function hotSeatKitHtml() {
  const cell = (label, html) => `<div class="kit-hs-cell"><p class="kit-sub">${label}</p>${html}</div>`;
  return `
  <section class="kit-section" id="kit-hotseat">
    <h2 class="kit-h">Hot Seat pickers (.bt-seance, .bt-wheel)</h2>
    <p class="kit-p">The draw on the stream view (<span class="kit-code">shared/ui/seance.js</span>: seanceHtml, seanceDraw; <span class="kit-code">shared/ui/wheel.js</span>: wheelHtml, wheelSpin). They only show the server's draw: the picks always come from the round. The séance board (W2) is the default; the Captain can switch a round to the wheel (W1). Both size by their own width. Reduced motion: they land at once, except on the stream view (<span class="kit-code">data-motion="always"</span>).</p>
    <div class="kit-hs-grid">
      ${cell("Séance board: idle", seanceHtml({ names: NAMES }))}
      ${cell("Séance board: landed (three picks)", seanceHtml({ names: NAMES, picks: PICKS, state: "landed" }))}
      ${cell("Séance board: replaced (@gbo didn't tap I'm in; @nyx was drawn)", seanceHtml({ names: NAMES, picks: SWAPPED, state: "replaced" }))}
      ${cell(`Séance board: drawing <button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-kit-draw>Draw</button>`, `<div data-kit-seance>${seanceHtml({ names: NAMES })}</div>`)}
    </div>
    <div class="kit-hs-grid kit-hs-grid--wheel">
      ${cell("Wheel: idle", wheelHtml({ names: NAMES }))}
      ${cell("Wheel: landed", wheelHtml({ names: NAMES, picks: PICKS, state: "landed" }))}
      ${cell(`Wheel: spinning <button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-kit-spin>Spin</button>`, `<div data-kit-wheel>${wheelHtml({ names: NAMES })}</div>`)}
    </div>
  </section>`;
}

export function initHotSeatKit(mount) {
  const box = mount.querySelector("#kit-hotseat");
  if (!box) return;
  let stop = () => {};
  box.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-kit-draw]")) {
      stop();
      const host = box.querySelector("[data-kit-seance]");
      host.innerHTML = seanceHtml({ names: NAMES });
      stop = seanceDraw(host, { picks: PICKS });
    } else if (t.closest("[data-kit-spin]")) {
      stop();
      const host = box.querySelector("[data-kit-wheel]");
      host.innerHTML = wheelHtml({ names: NAMES });
      stop = wheelSpin(host, { picks: PICKS });
    }
  });
}
