// Round 9: catch the blood. The links dim; one at a time lights blood red. Hit it
// before it moves (the window shrinks from 1.4 s to 0.6 s). Catches register on
// pointer down. Missing one or hitting the wrong link = lose. 10 catches.

const CATCHES = 10;

export function nextHot(G) {
  const { S } = G, cards = G.cards();
  cards.forEach((c) => c.classList.remove("is-hot"));
  let i;
  do { i = Math.floor(Math.random() * cards.length); } while (i === S.hot);
  S.hot = i; cards[i].classList.add("is-hot");
  const win = Math.max(600, 1400 - S.catches * 85);
  G.later(() => {
    if (S.phase === "chase" && S.hot === i) G.end("missed");
  }, win);
}

export function onChase(G, c) {
  const { S, SFX } = G;
  if (G.idx(c) !== S.hot) return G.end("wrong");
  G.clearTimers();
  c.classList.remove("is-hot"); c.classList.add("is-caught");
  setTimeout(() => c.classList.remove("is-caught"), 360);
  SFX.blip(S.catches); S.catches++;
  G.progress(85 + S.catches * 1.4);
  if (S.catches >= CATCHES) {
    // Round 10: the splat pulses; tap it to finish.
    S.hot = null; G.phase("finish"); G.setA("finish", "1"); SFX.sting();
  } else G.later(() => nextHot(G), 170);
}
