// Is Sub Club for sale on this build? (docs/specs/club-pass.md §5, §13). site.json clubPass.payments is the real switch (production
// turns it on at launch). clubPass.paymentsStaging turns payments on for every build that isn't production (PUBLIC_FIREBASE_ENV),
// so staging can take Stripe TEST MODE payments while production keeps "Opening soon". Gifts and tips stay off either way (later part).
import { isProduction } from "./env.js";

export const paymentsOn = (cp) => !!cp.payments || (!!cp.paymentsStaging && !isProduction);
