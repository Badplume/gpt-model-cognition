import {env} from 'cloudflare:workers';
import {mcp} from '@/lib/delegator.mjs';
export const dynamic='force-dynamic';
export const POST=(req:Request)=>mcp(req,env);
export const GET=(req:Request)=>mcp(req,env);
export const DELETE=(req:Request)=>mcp(req,env);
