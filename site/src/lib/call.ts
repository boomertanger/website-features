// Callable Cloud Functions (kept apart from lib/firebase.ts so the functions SDK
// only loads where something calls one: the dialog, account page, callbacks).
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

export const functions = getFunctions(app);

/** Calls a callable Cloud Function and returns its data. */
export async function call<T = any>(name: string, data: unknown = {}): Promise<T> {
  const res = await httpsCallable(functions, name)(data);
  return res.data as T;
}
