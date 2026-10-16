import {Fault,planConsult,performConsult,seal,unseal,account,dayBudget} from './delegator.mjs';
const encoder=new TextEncoder();
const modes=['consult_model','delegate_task','auto_route','multi_model_review'];
const home='https://model-delegator-pleia.tangyvole32.chatgpt.site/?view=requests';
async function signature(value){const hash=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(value)));return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');}
export async function cleanupRequests(env,user){await env.DB.prepare('DELETE FROM requests WHERE user_id=? AND expires_at<?').bind(user,new Date().toISOString()).run();}
export async function prepareRequest(mode,args,env,user,fetcher=fetch){
 if(!modes.includes(mode))throw new Fault('调用用途无效。');
 const p=await planConsult(mode,args,env,user,fetcher),s=p.acc.settings;
 const bytes=encoder.encode(p.prompt).length,roughInput=Math.ceil(bytes/3),work=p.selected.length*(roughInput+s.maxTokens);
 const reasons=[];if(s.approvalMode==='always')reasons.push('你设置了每次审批');if(p.reserved/1e6>=s.approvalCny)reasons.push('达到费用审批阈值');if(work>=s.approvalTokens)reasons.push('达到工作量审批阈值');if(p.selected.length>=s.approvalModels)reasons.push('达到模型数量审批阈值');if(args.workload==='large')reasons.push('主助手标记为复杂或多阶段任务');
 const used=await dayBudget(env,user,p.fx);if(used+p.reserved>Math.floor(s.dailyCny*1e6))throw new Fault('今日剩余预算不足，无法创建可执行请求。',409);
 const id=crypto.randomUUID(),expires=new Date(Date.now()+30*60*1000).toISOString();
 const estimate={budget_currency:'CNY',fx:{date:p.fx.date,cny_per_usd:p.fx.cnyPerUsd,source:p.fx.sourceUrl},models:p.selected.map(m=>m.id),model_count:p.selected.length,material_bytes:bytes,rough_input_tokens:roughInput,output_cap_per_model:s.maxTokens,rough_work_tokens:work,conservative_reserved_cny:p.reserved/1e6,remaining_daily_cny:Math.max(0,s.dailyCny-used/1e6),max_wait_seconds:s.timeoutSec,pricing:p.selected.map(m=>({model:m.id,source:m.pricing_source||'OpenRouter live catalog',official:m.price||null})),approval_reasons:reasons,disclaimer:'工作量为粗估，金额为保守预留，不是最终账单。审批不突破每日或单次预算。'};
 const normalized={...args,...(mode==='multi_model_review'?{models:p.selected.map(m=>m.id)}:{model:p.selected[0].id})};
 const payload=await seal(JSON.stringify({mode,args:normalized,settings_signature:await signature(s)}),user,env);
 await cleanupRequests(env,user);await env.DB.prepare('INSERT INTO requests(id,user_id,status,payload,estimate,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,user,reasons.length?'pending':'ready',payload,JSON.stringify(estimate),new Date().toISOString(),expires).run();
 return {request_id:id,status:reasons.length?'pending':'ready',approval_required:!!reasons.length,estimate,expires_at:expires,approval_url:home+'&request='+encodeURIComponent(id),next_action:reasons.length?'Ask the human to approve this immutable request in the approval page; no inference has run. After approval, use execute_request with this ID.':'Call execute_request with this ID.'};
}
async function owned(env,user,id){if(typeof id!=='string'||id.length>100)throw new Fault('请求编号无效。');const row=await env.DB.prepare('SELECT * FROM requests WHERE id=? AND user_id=?').bind(id,user).first();if(!row)throw new Fault('请求不存在或不属于当前账号。',404);if(row.expires_at<=new Date().toISOString())throw new Fault('请求已过期，请重新估算。',409);return row;}
export async function getRequest(id,env,user,detail=false){const row=await owned(env,user,id),out={request_id:row.id,status:row.status,estimate:JSON.parse(row.estimate),expires_at:row.expires_at};if(row.result)out.result=JSON.parse(await unseal(row.result,user,env));if(detail){const p=JSON.parse(await unseal(row.payload,user,env));out.task=p.args.task;out.context=p.args.context||'';out.mode=p.mode;}return out;}
export async function listRequests(env,user){await cleanupRequests(env,user);const rows=await env.DB.prepare('SELECT id,status,estimate,created_at,expires_at FROM requests WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(user).all();return {requests:(rows.results||[]).map(r=>({request_id:r.id,status:r.status,estimate:JSON.parse(r.estimate),created_at:r.created_at,expires_at:r.expires_at})),approval_url:home};}
// This function is exposed ONLY through the authenticated same-origin website,
// never as an MCP tool. A model cannot grant its own approval using tool arguments.
export async function decideRequest(id,approve,env,user){await owned(env,user,id);const row=await env.DB.prepare('UPDATE requests SET status=? WHERE id=? AND user_id=? AND status=? AND expires_at>? RETURNING id').bind(approve?'approved':'rejected',id,user,'pending',new Date().toISOString()).first();if(!row)throw new Fault('请求已被处理，不能重复审批。',409);return getRequest(id,env,user,true);}
export async function executeRequest(id,env,user,fetcher=fetch){
 const row=await owned(env,user,id);if(row.status==='completed'||row.status==='failed'||row.status==='running')return getRequest(id,env,user);
 if(!['ready','approved'].includes(row.status))return {...await getRequest(id,env,user),approval_required:row.status==='pending',approval_url:home+'&request='+encodeURIComponent(id)};
 const payload=JSON.parse(await unseal(row.payload,user,env)),a=await account(env.DB,user),estimate=JSON.parse(row.estimate);
 if(estimate.budget_currency!=='CNY')throw new Fault('此计划使用旧预算币种，请重新估算和审批。',409);
 if(await signature(a.settings)!==payload.settings_signature)throw new Fault('设置已改变，请重新估算和审批。',409);
 const p=await planConsult(payload.mode,payload.args,env,user,fetcher);if(p.reserved>Math.round(estimate.conservative_reserved_cny*1e6))throw new Fault('价格或费用估算已上升，请重新估算和审批。',409);
 const claim=await env.DB.prepare('UPDATE requests SET status=? WHERE id=? AND user_id=? AND status IN (?,?) AND expires_at>? RETURNING id').bind('running',id,user,'ready','approved',new Date().toISOString()).first();if(!claim)return getRequest(id,env,user);
 try{const result=await performConsult(payload.mode,payload.args,env,user,fetcher,Math.round(estimate.conservative_reserved_cny*1e6),JSON.stringify(a.settings));const cipher=await seal(JSON.stringify(result),user,env);await env.DB.prepare('UPDATE requests SET status=?,result=?,expires_at=? WHERE id=? AND user_id=?').bind('completed',cipher,new Date(Date.now()+24*60*60*1000).toISOString(),id,user).run();return {request_id:id,status:'completed',estimate,...result};}
 catch(e){await env.DB.prepare('UPDATE requests SET status=? WHERE id=? AND user_id=?').bind('failed',id,user).run();throw e;}
}
