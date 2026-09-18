// shared/memberspace-helper.js
// Small wrapper around MemberSpace's client-side state.
// Assumes the MemberSpace script is already loaded on the page.

export function isMemberSpaceReady() {
  return !!(window.MemberSpace && window.MemberSpace.ready);
}

export function getCurrentMember() {
  if (!isMemberSpaceReady()) return null;
  return window.MemberSpace.getMemberInfo().memberInfo || null;
}

export function isLoggedIn() {
  if (!isMemberSpaceReady()) return false;
  return !!window.MemberSpace.getMemberInfo().isLoggedIn;
}

export const PLANS = {
  FAN_CLUB: "xsrv0ttp7c", // public, free
  SUB_CLUB: "vnmd6kotxk", // public, $7.99/month
  MODS: "posfxd0ers", // private, free (staff role)
  ADMIN: "beifws8aia", // private, free (staff role)
};

// e.g. hasActivePlan(PLANS.SUB_CLUB)
export function hasActivePlan(publicPlanId) {
  const member = getCurrentMember();
  if (!member || !member.memberships) return false;
  return member.memberships.some(
    (m) => m.publicPlanId === publicPlanId && m.status === "active"
  );
}

// MemberSpace's documented ready pattern: resolves immediately if
// window.MemberSpace.ready is already true, otherwise waits once for the
// MemberSpace.ready event instead of polling.
export function waitForReady() {
  if (isMemberSpaceReady()) return Promise.resolve();

  return new Promise((resolve) => {
    document.addEventListener("MemberSpace.ready", function onReady() {
      document.removeEventListener("MemberSpace.ready", onReady);
      resolve();
    });
  });
}
