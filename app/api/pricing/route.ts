import {env} from 'cloudflare:workers';
import {json,identity,checkOrigin,Fault} from '@/lib/delegator.mjs';
import {pricingStatus,refreshPricing,providerPrices} from '@/lib/pricing.mjs';
import {savePricingPolicy} from '@/lib/pricing-policy.mjs';
import {readPricingAction} from '@/lib/pricing-request.mjs';
export const dynamic='force-dynamic';
// The owner-private Sites dispatch authenticates either the owner or Site service
// access. This writer only refreshes shared PUBLIC prices, never account data.
// It intentionally does not pretend a service request has a signed-in user.
export async function GET(req:Request){const provider=new URL(req.url).searchParams.get('provider');return json(provider?await providerPrices(env,provider):await pricingStatus(env));}
export async function POST(req:Request){try{const data=await readPricingAction(req);if(data.action==='settings'){identity(req);checkOrigin(req);await savePricingPolicy(env,data.settings);return json(await pricingStatus(env));}return json(await refreshPricing(env,{force:data.action==='refresh'}));}catch(e){return json({error:e instanceof Error?e.message:'定价更新失败'},e instanceof Fault?e.status:400);}}
