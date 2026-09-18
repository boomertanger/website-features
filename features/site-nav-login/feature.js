// features/site-nav-login/feature.js
// Site-wide infrastructure — loaded via Squarespace Footer Code Injection on
// every page, not a page-level code block. Adds a "LOG IN" link to both the
// desktop and mobile nav; MemberSpace hides it automatically for logged-in
// visitors via the data-ms-hide-when-logged-in attribute, so no manual
// isLoggedIn() check is needed here.

const LOGIN_URL = "https://boomertanger.com?msopen=/member/sign_in";
const LOGIN_TEXT = "LOG IN";
const LOGIN_CLASS = "site-nav-login-link";

const TARGET_SELECTORS = [
  ".header-actions--right",
  ".header-menu-nav-folder-content",
];

function buildLoginLink() {
  const link = document.createElement("a");
  link.href = LOGIN_URL;
  link.textContent = LOGIN_TEXT;
  link.className = LOGIN_CLASS;
  link.setAttribute("data-ms-hide-when-logged-in", "");
  return link;
}

function injectLoginLinks() {
  TARGET_SELECTORS.forEach((selector) => {
    const container = document.querySelector(selector);
    if (!container || container.querySelector(`.${LOGIN_CLASS}`)) return;
    container.appendChild(buildLoginLink());
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectLoginLinks);
} else {
  injectLoginLinks();
}
