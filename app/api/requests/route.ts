import {env} from 'cloudflare:workers';
import {identity,checkOrigin,readJson,json,Fault} from '@/lib/delegator.mjs';
import {prepareRequest,listRequests,getRequest,decideRequest,executeRequest} from '@/lib/workload.mjs';
export const dynamic='force-dynamic';
const fail=(e:unknown)=>json({error:e instanceof Fault?e.message:'操作失败，请重试。'},e instanceof Fault?e.status:500);
export async function GET(req:Request){try{const user=identity(req),id=new URL(req.url).searchParams.get('id');return json(id?await getRequest(id,env,user,true):await listRequests(env,user));}catch(e){return fail(e)}}
export async function POST(req:Request){try{const user=identity(req);checkOrigin(req);const d=await readJson(req);if(d.action==='approve'||d.action==='reject')return json(await decideRequest(d.id,d.action==='approve',env,user));if(d.action==='execute')return json(await executeRequest(d.id,env,user));return json(await prepareRequest(d.mode,{task:d.task,context:d.context,model:d.model||undefined,models:d.models,request_source:'user',workload:d.workload},env,user));}catch(e){return fail(e)}}
