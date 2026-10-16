import {env} from 'cloudflare:workers';
import {identity,checkOrigin,readJson,json,account,status,seal,validateSettings,accountModels,Fault} from '@/lib/delegator.mjs';
export const dynamic='force-dynamic';
function failure(e:unknown){return json({error:e instanceof Fault?e.message:'操作失败，请稍后重试。'},e instanceof Fault?e.status:500);}
export async function GET(req:Request){try{return json(await status(env,identity(req)));}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 const user=identity(req);checkOrigin(req);const data=await readJson(req),settings=validateSettings(data.settings),a=await account(env.DB,user);let encrypted=a.key;
 if(data.apiKey){if(typeof data.apiKey!=='string'||data.apiKey.length>512||!data.apiKey.startsWith('sk-or-'))throw new Fault('请输入有效的 OpenRouter API Key。');const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:'Bearer '+data.apiKey},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Fault('OpenRouter 未接受此密钥（HTTP '+r.status+'）。');encrypted=await seal(data.apiKey,user,env);}
 if(settings.enabled&&!encrypted&&!(await status(env,user)).configured)throw new Fault('开启前请先连接至少一个模型平台。');
 if(settings.models.length){const cat=await accountModels(env,user);if(settings.models.some((id:string)=>!cat.some((m:{id:string;reasoning:number})=>m.id===id&&m.reasoning===0)))throw new Fault('所选模型不可用，请重新选择。');}
 await env.DB.prepare('INSERT INTO accounts(user_id,encrypted_key,settings) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted_key=excluded.encrypted_key,settings=excluded.settings').bind(user,encrypted,JSON.stringify(settings)).run();return json(await status(env,user));
 }catch(e){return failure(e);}}
export async function DELETE(req:Request){try{const user=identity(req);checkOrigin(req);const a=await account(env.DB,user);a.settings.enabled=false;await env.DB.prepare('UPDATE accounts SET encrypted_key=NULL,settings=? WHERE user_id=?').bind(JSON.stringify(a.settings),user).run();return json(await status(env,user));}catch(e){return failure(e);}}
