// Firebase for the new site (modular SDK from npm). Picks the staging or
// production project from PUBLIC_FIREBASE_ENV (lib/env.js). The two web configs
// are copied from shared/firebase-init.js, which stays as it is for the
// Squarespace features (it loads the SDK from the CDN and flips ENV by hand).
//
// Firestore Lite: the site only does one-off reads of the member's own docs
// (writes all go through Cloud Functions), so the much smaller Lite build is
// enough and there are no live listeners to clean up. It lives in lib/db.ts and
// callables in lib/call.ts, so a signed-out visitor loads only Auth.
//
// Auth is initialised with persistence only; the popup resolver is passed where a
// popup sign-in happens (signInWithPopup(auth, provider, browserPopupRedirectResolver)),
// which keeps it out of every page.
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, type Auth } from "firebase/auth";
import { firebaseEnv } from "./env.js";

const configs = {
  staging: {
    apiKey: "AIzaSyClJypz3Zilx0kiTU354ycmPvr2B3iQa7I",
    authDomain: "boomertanger-staging.firebaseapp.com",
    projectId: "boomertanger-staging",
    storageBucket: "boomertanger-staging.firebasestorage.app",
    messagingSenderId: "1046602786327",
    appId: "1:1046602786327:web:b9e864ceb4d864cf355e52",
  },
  production: {
    apiKey: "AIzaSyA2fumbLoU94Tt1x46xeUXpOFKCS14IEtM",
    authDomain: "boomertanger-prod.firebaseapp.com",
    projectId: "boomertanger-prod",
    storageBucket: "boomertanger-prod.firebasestorage.app",
    messagingSenderId: "738386876648",
    appId: "1:738386876648:web:131af951e6d2fbc985d15d",
  },
};

/** The site this build serves (the future multi-site key). */
export const SITE_ID = "boomertanger";

export const app: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseEnv === "production" ? configs.production : configs.staging);
export const auth: Auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
