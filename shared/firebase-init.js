// shared/firebase-init.js
// Shared Firebase initializer. Import this from any feature.
// Fill in your actual staging/production config values below —
// these are safe to commit; Firebase web config is not a secret,
// access control lives in your Firestore/Storage security rules.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

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

// Flip this manually per environment (or derive it from hostname/page).
const ENV = "staging"; // "staging" | "production"

export function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(configs[ENV]);
}
