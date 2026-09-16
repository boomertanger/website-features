// shared/firebase-init.js
// Shared Firebase initializer. Import this from any feature.
// Fill in your actual staging/production config values below —
// these are safe to commit; Firebase web config is not a secret,
// access control lives in your Firestore/Storage security rules.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

const configs = {
  staging: {
    apiKey: "STAGING_API_KEY",
    authDomain: "STAGING_PROJECT.firebaseapp.com",
    projectId: "STAGING_PROJECT",
    storageBucket: "STAGING_PROJECT.appspot.com",
    messagingSenderId: "STAGING_SENDER_ID",
    appId: "STAGING_APP_ID",
  },
  production: {
    apiKey: "PROD_API_KEY",
    authDomain: "PROD_PROJECT.firebaseapp.com",
    projectId: "PROD_PROJECT",
    storageBucket: "PROD_PROJECT.appspot.com",
    messagingSenderId: "PROD_SENDER_ID",
    appId: "PROD_APP_ID",
  },
};

// Flip this manually per environment (or derive it from hostname/page).
const ENV = "staging"; // "staging" | "production"

export function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(configs[ENV]);
}
