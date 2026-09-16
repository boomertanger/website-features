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

// NOTE: verified against the free "Fan Club" membership shape only —
// matching a paid-tier publicPlanId hasn't been confirmed yet.
export function hasActivePlan(publicPlanId) {
  const member = getCurrentMember();
  if (!member || !member.memberships) return false;
  return member.memberships.some((m) => m.publicPlanId === publicPlanId);
}
