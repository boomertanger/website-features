// features/_template/feature.js
// Copy this file into a new /features/<name>/ folder to start a feature.

import { getFirebaseApp } from "../../shared/firebase-init.js";
import { isLoggedIn, hasActivePlan } from "../../shared/memberspace-helper.js";

(function () {
  if (!isLoggedIn()) {
    // handle logged-out state
    return;
  }

  // const app = getFirebaseApp();
  // ...feature logic here...
})();
