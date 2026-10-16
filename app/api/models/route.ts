import {env} from 'cloudflare:workers';
import {identity,accountModels,json,Fault} from '@/lib/delegator.mjs';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{return json({models:await accountModels(env,identity(req))});}catch(e){return json({error:e instanceof Fault?e.message:'无法加载模型目录。'},e instanceof Fault?e.status:500);}}

