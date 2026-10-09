// Which Firebase environment this build targets. Cloudflare Pages sets
// PUBLIC_FIREBASE_ENV per environment: "production" for Production, "staging"
// for Preview (and local builds default to "staging"). Anything but
// "production" gets noindex and the ?as= / ?live= preview switches.
export const firebaseEnv = import.meta.env.PUBLIC_FIREBASE_ENV || "staging";
export const isProduction = firebaseEnv === "production";

/** The Firebase project id of this build (the same two projects as lib/firebase.ts). The stream view uses it to reach obsFeed without starting Firebase. */
export const projectId = isProduction ? "boomertanger-prod" : "boomertanger-staging";
