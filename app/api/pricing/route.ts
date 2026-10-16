import {env} from 'cloudflare:workers';
import {json} from '@/lib/delegator.mjs';
import {pricingStatus,refreshPricing,providerPrices} from '@/lib/pricing.mjs';
export const dynamic='force-dynamic';
// The owner-private Sites dispatch authenticates either the owner or Site service
// access. This writer only refreshes shared PUBLIC prices, never account data.
// It intentionally does not pretend a service request has a signed-in user.
export async function GET(req:Request){const provider=new URL(req.url).searchParams.get('provider');return json(provider?await providerPrices(env,provider):await pricingStatus(env));}
export async function POST(){return json(await refreshPricing(env,{force:true}));}
