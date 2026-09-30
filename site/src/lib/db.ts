// Firestore Lite for the site's one-off reads (see lib/firebase.ts).
import { getFirestore } from "firebase/firestore/lite";
import { app } from "./firebase";

export const db = getFirestore(app);
export { doc, getDoc } from "firebase/firestore/lite";
export { SITE_ID } from "./firebase";
