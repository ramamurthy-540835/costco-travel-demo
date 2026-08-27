import Stripe from 'stripe';

let stripeAPI: Stripe | undefined;

function getStripe(): Stripe {
  if (stripeAPI) {
    return stripeAPI;
  }

  // Read and validate the key HERE, not at module scope — see lib/mongodb.ts
  // for why (next build's "Collecting page data" step imports every route module).
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

  if (!STRIPE_SECRET_KEY) {
    throw new Error('Please define the STRIPE_SECRET_KEY environment variable');
  }

  stripeAPI = new Stripe(STRIPE_SECRET_KEY);
  return stripeAPI;
}

export default getStripe;
