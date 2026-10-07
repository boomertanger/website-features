// Browser storage keys shared by the sign-in dialog, the auth return pages and the
// account UI (all reads and writes are wrapped in try/catch where they're used).
export const UNDER13_KEY = "bt-under13";                // localStorage: this browser hit the under-13 block
export const EMAIL_FOR_LINK_KEY = "bt-email-for-link";  // localStorage: the address an email sign-in link went to
export const RETURN_KEY = "bt-auth-return";             // localStorage: page to return to after an email link
export const CONTINUE_KEY = "bt-auth-continue";         // sessionStorage: resume the signup steps after a redirect sign-in
export const REF_KEY = "bt-ref";                        // localStorage: { handle, until } from a /join/@handle link (30 days, first link wins)
