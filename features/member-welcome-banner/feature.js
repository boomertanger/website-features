// features/member-welcome-banner/feature.js
import { isLoggedIn, waitForReady } from "../../shared/memberspace-helper.js";

const BANNER_ID = "member-welcome-banner";

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

function init() {
  const banner = document.getElementById(BANNER_ID);
  if (!banner) return;

  waitForReady().then(() => {
    render(banner, isLoggedIn() ? STATES.loggedIn : STATES.loggedOut);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
