// features/site-nav-login/feature.js
// Site-wide infrastructure — loaded via Squarespace Footer Code Injection on
// every page, not a page-level code block. Adds a "LOG IN" link to both the
// desktop and mobile nav; MemberSpace hides it automatically for logged-in
// visitors via the data-ms-hide-when-logged-in attribute, so no manual
// isLoggedIn() check is needed here.

const LOGIN_URL = "https://boomertanger.com?msopen=/member/sign_in";
const LOGIN_TEXT = "LOG IN";
const LOGIN_CLASS = "boomertanger-login";

function buildLoginAnchor() {
  const link = document.createElement("a");
  link.href = LOGIN_URL;
  link.className = LOGIN_CLASS;
  link.setAttribute("data-ms-hide-when-logged-in", "");
  link.setAttribute("rel", "nofollow");
  return link;
}

function buildDesktopLink() {
  const link = buildLoginAnchor();
  link.textContent = LOGIN_TEXT;
  return link;
}

function buildMobileWrapper() {
  const wrapper = document.createElement("div");
  wrapper.className =
    "container header-menu-nav-item header-menu-nav-item--collection";

  const link = buildLoginAnchor();

  const content = document.createElement("div");
  content.className = "header-menu-nav-item-content";
  content.textContent = LOGIN_TEXT;

  link.appendChild(content);
  wrapper.appendChild(link);
  return wrapper;
}

function injectLoginLinks() {
  const desktopContainer = document.querySelector(".header-actions--right");
  if (desktopContainer && !desktopContainer.querySelector(`.${LOGIN_CLASS}`)) {
    desktopContainer.appendChild(buildDesktopLink());
  }

  const mobileContainer = document.querySelector(
    ".header-menu-nav-folder-content"
  );
  if (mobileContainer && !mobileContainer.querySelector(`.${LOGIN_CLASS}`)) {
    mobileContainer.insertBefore(
      buildMobileWrapper(),
      mobileContainer.firstChild
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectLoginLinks);
} else {
  injectLoginLinks();
}
