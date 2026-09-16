// shared/memberspace-helper.js
// Small wrapper around Memberspace's client-side state.
// Assumes the Memberspace script is already loaded on the page.

export function getCurrentMember() {
  return (window.Memberspace && window.Memberspace.member) || null;
}

export function isLoggedIn() {
  return !!getCurrentMember();
}

export function hasActivePlan(planId) {
  const member = getCurrentMember();
  if (!member || !member.plans) return false;
  return member.plans.some((p) => p.id === planId && p.status === "active");
}
