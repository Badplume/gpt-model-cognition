import {Fault,seal,unseal,account} from './delegator.mjs';
import {fetchOfficial,OfficialRedirectError} from './official-fetch.mjs';

export const PROVIDERS={
 anthropic:{name:'Claude · Anthropic',base:'https://api.anthropic.com/v1',keys:'https://platform.claude.com/settings/keys',kind:'anthropic'},
 gemini:{name:'Gemini · Google',base:'https://generativelanguage.googleapis.com/v1beta/openai',keys:'https://aistudio.google.com/apikey',kind:'compatible'},
 deepseek:{name:'DeepSeek',base:'https://api.deepseek.com',keys:'https://platform.deepseek.com/api_keys',kind:'compatible'},
 xai:{name:'Grok · xAI',base:'https://api.x.ai/v1',keys:'https://console.x.ai',kind:'compatible'}
};
export function authHeaders(provider,key){if(!PROVIDERS[provider])throw new Fault('不支持的模型平台。');if(typeof key!=='string'||!key||!/^[\x21-\x7e]+$/.test(key))throw new Fault('API Key 包含空格、换行或非标准字符，请仅粘贴密钥本身，不要附加 Bearer 前缀。');return provider==='anthropic'?{'x-api-key':key,'anthropic-version':'2023-06-01','Content-Type':'application/json'}:{Authorization:'Bearer '+key,'Content-Type':'application/json'};}
export async function providerStatus(env,user){const keys=await env.DB.prepare('SELECT provider FROM provider_keys WHERE user_id=?').bind(user).all();const models=await env.DB.prepare('SELECT * FROM direct_models WHERE user_id=? ORDER BY name').bind(user).all();return {providers:Object.entries(PROVIDERS).map(([id,p])=>({id,...p,configured:(keys.results||[]).some(k=>k.provider===id)})),models:models.results||[]};}
export async function providerModels(provider,key,fetcher=fetch){
 const p=PROVIDERS[provider];if(!p)throw new Fault('不支持的模型平台。');
 const headers=authHeaders(provider,key);
 let r;try{r=await fetchOfficial(p.base+'/models',{headers,signal:AbortSignal.timeout(15000)},fetcher);}catch(e){
  if(e instanceof OfficialRedirectError)throw new Fault('平台返回了意外的跳转，已停止连接以保护密钥。请使用官方 API Key，或点击「检查服务连接」。',502);
  if(e?.name==='TimeoutError'||e?.name==='AbortError')throw new Fault('连接 '+p.name+' 的官方 API 超时。密钥未保存，请稍后重试或点击「检查服务连接」。',504);
  throw new Fault('插件服务器暂时无法访问 '+p.name+' 的官方 API。密钥未保存，请点击「检查服务连接」定位问题；这不代表 API Key 无效。',502);
 }
 if(!r.ok){
  const message=r.status===401?'API Key 未通过验证（HTTP 401），请核对是否为该平台的官方密钥。':r.status===402?'平台 API 账户余额不足（HTTP 402），请检查 API 账户余额。':r.status===403?'平台拒绝访问（HTTP 403），请检查 API 权限、账户或地区限制。':r.status===429?'平台正在限流（HTTP 429），请稍后重试。':r.status>=500?'官方 API 服务暂时异常（HTTP '+r.status+'），请稍后重试；这不表示 API Key 无效。':'平台未接受请求（HTTP '+r.status+'），请核对 API 账户。';
  throw new Fault(message,r.status>=500?502:r.status===429?429:400);
 }
 let b;try{b=await r.json();}catch{throw new Fault('平台返回的模型目录格式无效，请稍后重试。',502);}
 if(!b||!Array.isArray(b.data))throw new Fault('平台返回的模型目录格式无效，请稍后重试。',502);
 return b.data.filter(m=>m&&typeof m.id==='string').map(m=>({id:m.id,name:m.display_name||m.name||m.id}));
}
export async function checkProviderConnection(provider,fetcher=fetch){
 const p=PROVIDERS[provider];if(!p)throw new Fault('不支持的模型平台。');
 const endpoint=p.base+'/models',start=Date.now();
 try{
  const r=await fetchOfficial(endpoint,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)},fetcher);
  await r.body?.cancel().catch(()=>{});
  const messages={401:'服务连接正常（HTTP 401：未携带密钥，符合预期）。现在可填写 API Key 并连接验证。',403:'已连接官方服务，但服务拒绝访问（HTTP 403）。请检查平台的地区或访问限制。',429:'官方服务正在限流（HTTP 429），请稍后再试。'};
  const ok=r.ok||r.status===401;
  return {provider,endpoint,reachable:true,ok,http_status:r.status,elapsed_ms:Date.now()-start,credentials_sent:false,inference_called:false,message:messages[r.status]||(r.ok?'服务连接正常。此检查未验证 API Key，请继续连接并验证。':r.status>=500?'官方服务暂时异常（HTTP '+r.status+'），请稍后重试。':'官方服务返回 HTTP '+r.status+'，请稍后重试。')};
 }catch(e){
  const reason=e instanceof OfficialRedirectError?'redirect_blocked':e?.name==='TimeoutError'||e?.name==='AbortError'?'timeout':'network_error';
  return {provider,endpoint,reachable:false,ok:false,reason,elapsed_ms:Date.now()-start,credentials_sent:false,inference_called:false,message:reason==='redirect_blocked'?'官方接口返回意外跳转，已阻止；检查未发送密钥。':reason==='timeout'?'插件服务器连接官方 API 超时；检查未发送密钥。':'插件服务器无法连接官方 API；检查未发送密钥，请稍后重试。'};
 }
}
export async function saveProvider(env,user,data,fetcher=fetch){const {provider,apiKey}=data;if(!PROVIDERS[provider]||typeof apiKey!=='string'||apiKey.trim().length<10||apiKey.length>512)throw new Fault('请选择平台并填写该平台的 API Key。');const list=await providerModels(provider,apiKey.trim(),fetcher);const cipher=await seal(apiKey.trim(),user,env);await env.DB.prepare('INSERT INTO provider_keys(user_id,provider,encrypted_key) VALUES(?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_key=excluded.encrypted_key').bind(user,provider,cipher).run();return {connected:true,models:list};}
export async function deleteProvider(env,user,provider){if(!PROVIDERS[provider])throw new Fault('平台无效。');await env.DB.prepare('DELETE FROM provider_keys WHERE user_id=? AND provider=?').bind(user,provider).run();return {deleted:true};}
export async function saveDirectModel(env,user,d,fetcher=fetch){
 if(!PROVIDERS[d.provider]||typeof d.modelId!=='string'||!d.modelId.trim()||d.modelId.length>120)throw new Fault('需要平台和准确的模型 ID。');
 for(const k of ['inputUsd','outputUsd'])if(typeof d[k]!=='number'||!Number.isFinite(d[k])||d[k]<0||d[k]>1000)throw new Fault('请填写美元/百万 tokens 的输入和输出单价（0–1000）。');
 if(!Number.isInteger(d.contextLength)||d.contextLength<4096||d.contextLength>2000000)throw new Fault('请设置合理的模型上下文上限。');
 const row=await env.DB.prepare('SELECT encrypted_key FROM provider_keys WHERE user_id=? AND provider=?').bind(user,d.provider).first();if(!row)throw new Fault('请先连接该平台。');
 const key=await unseal(row.encrypted_key,user,env),list=await providerModels(d.provider,key,fetcher);if(!list.some(m=>m.id===d.modelId.trim()))throw new Fault('该模型不在此 Key 的模型目录中。');
 const id=d.provider+':'+d.modelId.trim();await env.DB.prepare('INSERT INTO direct_models(id,user_id,provider,model_id,name,input_usd,output_usd,context_length) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,input_usd=excluded.input_usd,output_usd=excluded.output_usd,context_length=excluded.context_length').bind(id,user,d.provider,d.modelId.trim(),list.find(m=>m.id===d.modelId.trim()).name,d.inputUsd,d.outputUsd,d.contextLength).run();return {id,saved:true};
}
export async function directCatalog(env,user){const rows=await env.DB.prepare('SELECT * FROM direct_models WHERE user_id=?').bind(user).all();return (rows.results||[]).map(m=>({id:m.id,name:m.name+' · 直连',provider:m.provider,modelId:m.model_id,context:m.context_length,prompt:m.input_usd/1e6,completion:m.output_usd/1e6,request:0,reasoning:0,pricing_source:'user_configured'}));}
export async function credentialFor(env,user,model){if(!model.provider){const a=await account(env.DB,user);if(!a.key)throw new Fault('未连接 OpenRouter。',409);return unseal(a.key,user,env);}const row=await env.DB.prepare('SELECT encrypted_key FROM provider_keys WHERE user_id=? AND provider=?').bind(user,model.provider).first();if(!row)throw new Fault('请先连接 '+PROVIDERS[model.provider].name+'。',409);return unseal(row.encrypted_key,user,env);}
export async function directInference(m,key,system,prompt,settings,fetcher=fetch){const p=PROVIDERS[m.provider];if(!p)throw new Fault('不支持的平台。');const body=p.kind==='anthropic'?{model:m.modelId,system,max_tokens:settings.maxTokens,messages:[{role:'user',content:prompt}]}:{model:m.modelId,messages:[{role:'system',content:system},{role:'user',content:prompt}],max_tokens:settings.maxTokens,stream:false};const r=await fetchOfficial(p.base+(p.kind==='anthropic'?'/messages':'/chat/completions'),{method:'POST',headers:authHeaders(m.provider,key),signal:AbortSignal.timeout(settings.timeoutSec*1000),body:JSON.stringify(body)},fetcher);if(!r.ok)return r;const b=await r.json();if(p.kind==='anthropic')return Response.json({choices:[{message:{content:(b.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')},finish_reason:b.stop_reason}],usage:{prompt_tokens:b.usage?.input_tokens,completion_tokens:b.usage?.output_tokens}});return Response.json(b);}
