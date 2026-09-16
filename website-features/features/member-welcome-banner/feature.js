// features/member-welcome-banner/feature.js
import { isLoggedIn } from "../../shared/memberspace-helper.js";

const BANNER_ID = "member-welcome-banner";
const POLL_INTERVAL_MS = 200;
const POLL_TIMEOUT_MS = 3000;

const STATES = {
  loggedIn: {
    text: "Welcome back, member! 👋",
    background: "#e6f4ea",
    color: "#1e4620",
  },
  loggedOut: {
    text: "Log in to see member-only content",
    background: "#f0f0f0",
    color: "#333333",
  },
};

function render(banner, state) {
  banner.textContent = state.text;
  banner.style.background = state.background;
  banner.style.color = state.color;
  banner.style.padding = "12px 16px";
  banner.style.borderRadius = "6px";
}

// Memberspace's script can load after this one, so wait briefly for it
// before deciding the login state, rather than always rendering logged-out.
function waitForMemberspace(callback) {
  const start = Date.now();

  (function poll() {
    if (window.Memberspace || Date.now() - start >= POLL_TIMEOUT_MS) {
      callback();
      return;
    }
    setTimeout(poll, POLL_INTERVAL_MS);
  })();
}

function init() {
  const banner = document.getElementById(BANNER_ID);
  if (!banner) return;

  waitForMemberspace(() => {
    render(banner, isLoggedIn() ? STATES.loggedIn : STATES.loggedOut);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
