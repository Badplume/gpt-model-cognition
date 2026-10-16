import {env} from 'cloudflare:workers';
import {identity,checkOrigin,readJson,json,Fault,unseal} from '@/lib/delegator.mjs';
import {providerStatus,saveProvider,deleteProvider,saveDirectModel,providerModels,checkProviderConnection} from '@/lib/providers.mjs';
export const dynamic='force-dynamic';
const fail=(e:unknown)=>json({error:e instanceof Fault?e.message:'操作失败，请重试。'},e instanceof Fault?e.status:500);
export async function GET(req:Request){try{const params=new URL(req.url).searchParams,p=params.get('provider');if(params.has('check'))return json(await checkProviderConnection(params.get('check')));const user=identity(req);if(p){const row=await env.DB.prepare('SELECT encrypted_key FROM provider_keys WHERE user_id=? AND provider=?').bind(user,p).first();if(!row)throw new Fault('尚未连接平台。');return json({models:await providerModels(p,await unseal(row.encrypted_key,user,env))});}return json(await providerStatus(env,user));}catch(e){return fail(e)}}
export async function POST(req:Request){try{const user=identity(req);checkOrigin(req);const d=await readJson(req);return json(d.action==='model'?await saveDirectModel(env,user,d):await saveProvider(env,user,d));}catch(e){return fail(e)}}
export async function DELETE(req:Request){try{const user=identity(req);checkOrigin(req);const d=await readJson(req);return json(await deleteProvider(env,user,d.provider));}catch(e){return fail(e)}}
