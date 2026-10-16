import {Fault,seal,unseal,account} from './delegator.mjs';
import {fetchOfficial,OfficialRedirectError} from './official-fetch.mjs';
import {officialPrice,refreshPricing,PRICE_SOURCES} from './pricing.mjs';

import {PROVIDERS} from './provider-registry.mjs';
export {PROVIDERS,isDirectId} from './provider-registry.mjs';
export function catalogEndpoint(provider,page=1){const p=PROVIDERS[provider];if(!p)throw new Fault('不支持的模型平台。');return provider==='qwen'?'https://dashscope.aliyuncs.com/api/v1/models?page_no='+page+'&page_size=100':p.base+(provider==='glm'?'/files?purpose=batch&limit=1':'/models');}
export function authHeaders(provider,key){if(!PROVIDERS[provider])throw new Fault('不支持的模型平台。');if(typeof key!=='string'||!key||!/^[\x21-\x7e]+$/.test(key))throw new Fault('API Key 包含空格、换行或非标准字符，请仅粘贴密钥本身，不要附加 Bearer 前缀。');return provider==='anthropic'?{'x-api-key':key,'anthropic-version':'2023-06-01','Content-Type':'application/json'}:{Authorization:'Bearer '+key,'Content-Type':'application/json'};}
export async function providerStatus(env,user){const keys=await env.DB.prepare('SELECT provider FROM provider_keys WHERE user_id=?').bind(user).all();const models=await env.DB.prepare('SELECT * FROM direct_models WHERE user_id=? ORDER BY name').bind(user).all();return {providers:Object.entries(PROVIDERS).map(([id,p])=>({id,...p,configured:(keys.results||[]).some(k=>k.provider===id)})),models:models.results||[]};}
export async function providerModels(provider,key,fetcher=fetch){
 const p=PROVIDERS[provider];if(!p)throw new Fault('不支持的模型平台。');
 const headers=authHeaders(provider,key);
 let r;try{r=await fetchOfficial(catalogEndpoint(provider),{headers,signal:AbortSignal.timeout(15000)},fetcher);}catch(e){
  if(e instanceof OfficialRedirectError)throw new Fault('平台返回了意外的跳转，已停止连接以保护密钥。请使用官方 API Key，或点击「检查服务连接」。',502);
  if(e?.name==='TimeoutError'||e?.name==='AbortError')throw new Fault('连接 '+p.name+' 的官方 API 超时。密钥未保存，请稍后重试或点击「检查服务连接」。',504);
  throw new Fault('插件服务器暂时无法访问 '+p.name+' 的官方 API。密钥未保存，请点击「检查服务连接」定位问题；这不代表 API Key 无效。',502);
 }
 if(!r.ok){
  const message=r.status===401?'API Key 未通过验证（HTTP 401），请核对是否为该平台的官方密钥。':r.status===402?'平台 API 账户余额不足（HTTP 402），请检查 API 账户余额。':r.status===403?'平台拒绝访问（HTTP 403），请检查 API 权限、账户或地区限制。':r.status===429?'平台正在限流（HTTP 429），请稍后重试。':r.status>=500?'官方 API 服务暂时异常（HTTP '+r.status+'），请稍后重试；这不表示 API Key 无效。':'平台未接受请求（HTTP '+r.status+'），请核对 API 账户。';
  throw new Fault(message,r.status>=500?502:r.status===429?429:400);
 }
 if(provider==='glm'){await r.body?.cancel();const s=PRICE_SOURCES.find(x=>x.provider==='glm'),r2=await fetchOfficial(s.url,{signal:AbortSignal.timeout(15000)},fetcher);if(!r2.ok)throw new Fault('GLM 官方模型目录暂时不可用。',502);return s.parse(await r2.text()).map(m=>({id:m.modelId,name:m.name||m.modelId,context:m.context,directorySource:'official_pricing',accessVerified:false}));}
 let b;try{b=await r.json();}catch{throw new Fault('平台返回的模型目录格式无效，请稍后重试。',502);}
 if(provider==='qwen'){
  if(b.success!==true||!Array.isArray(b.output?.models)||!Number.isFinite(b.output?.total))throw new Fault('百炼模型目录格式无效。',502);
  const all=[...b.output.models],pages=Math.ceil(b.output.total/100);if(pages>20)throw new Fault('百炼目录过大。',502);
  for(let page=2;page<=pages;page++){const next=await fetchOfficial(catalogEndpoint(provider,page),{headers,signal:AbortSignal.timeout(15000)},fetcher);if(!next.ok)throw new Fault('百炼模型目录分页失败。',502);const item=await next.json();if(item.success!==true||!Array.isArray(item.output?.models))throw new Fault('百炼模型目录分页异常。',502);all.push(...item.output.models);}
  return all.filter(m=>typeof m.model==='string'&&!/^(wan|text-embedding|paraformer|cosyvoice|qwen-vl|qwen-omni|qwen-audio|qwen-image)/i.test(m.model)).map(m=>({id:m.model,name:m.name||m.model,context:m.model_info?.context_window}));
 }
 if(!b||!Array.isArray(b.data))throw new Fault('平台返回的模型目录格式无效，请稍后重试。',502);
 return b.data.filter(m=>m&&typeof m.id==='string').map(m=>({id:m.id,name:m.display_name||m.name||m.id}));
}
export async function checkProviderConnection(provider,fetcher=fetch){
 const p=PROVIDERS[provider];if(!p)throw new Fault('不支持的模型平台。');
 const endpoint=catalogEndpoint(provider),start=Date.now();
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
 const price=await officialPrice(env,d.provider,d.modelId.trim(),{fetcher});if(!price?.available)throw new Fault('尚未取得该模型的有效官方价格与汇率，请先同步价格或选择已收录模型。',409);
 d={...d,contextLength:d.contextLength??Math.min(price.context||32768,32768)};
 if(!Number.isInteger(d.contextLength)||d.contextLength<4096||d.contextLength>2000000)throw new Fault('请设置合理的模型上下文上限。');
 const row=await env.DB.prepare('SELECT encrypted_key FROM provider_keys WHERE user_id=? AND provider=?').bind(user,d.provider).first();if(!row)throw new Fault('请先连接该平台。');
 const key=await unseal(row.encrypted_key,user,env),list=await providerModels(d.provider,key,fetcher);if(!list.some(m=>m.id===d.modelId.trim()))throw new Fault('该模型不在此 Key 的模型目录中。');
 if(price.context&&d.contextLength>price.context)throw new Fault('上下文上限不能超过官方支持的 '+price.context+' tokens。');
 const id=d.provider+':'+d.modelId.trim();await env.DB.prepare('INSERT INTO direct_models(id,user_id,provider,model_id,name,input_usd,output_usd,context_length) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,input_usd=excluded.input_usd,output_usd=excluded.output_usd,context_length=excluded.context_length').bind(id,user,d.provider,d.modelId.trim(),list.find(m=>m.id===d.modelId.trim()).name,price.inputUsd,price.outputUsd,d.contextLength).run();return {id,saved:true,price};
}
export async function directCatalog(env,user,fetcher=fetch){
 const rows=(await env.DB.prepare('SELECT * FROM direct_models WHERE user_id=?').bind(user).all()).results||[];
 await Promise.all([...new Set(rows.map(x=>x.provider))].map(provider=>refreshPricing(env,{provider,fetcher})));
 return Promise.all(rows.map(async m=>{const price=await officialPrice(env,m.provider,m.model_id,{refresh:false}),available=!!price?.available;return {id:m.id,name:m.name+' · 直连',provider:m.provider,modelId:m.model_id,context:Math.min(m.context_length,price?.context||m.context_length),prompt:available?price.inputUsd/1e6:null,completion:available?price.outputUsd/1e6:null,request:0,reasoning:0,pricing_source:'official',pricing_available:available,pricing_error:available?null:'未取得有效官方价格或汇率，请同步价格',price};}));
}
export async function credentialFor(env,user,model){if(!model.provider){const a=await account(env.DB,user);if(!a.key)throw new Fault('未连接 OpenRouter。',409);return unseal(a.key,user,env);}const row=await env.DB.prepare('SELECT encrypted_key FROM provider_keys WHERE user_id=? AND provider=?').bind(user,model.provider).first();if(!row)throw new Fault('请先连接 '+PROVIDERS[model.provider].name+'。',409);return unseal(row.encrypted_key,user,env);}
export async function directInference(m,key,system,prompt,settings,fetcher=fetch){const p=PROVIDERS[m.provider];if(!p)throw new Fault('不支持的平台。');const body=p.kind==='anthropic'?{model:m.modelId,system,max_tokens:settings.maxTokens,messages:[{role:'user',content:prompt}]}:{model:m.modelId,messages:[{role:'system',content:system},{role:'user',content:prompt}],max_tokens:settings.maxTokens,stream:false};if(m.provider==='qwen')body.enable_thinking=false;if((m.provider==='glm'&&/^glm-5\.3/.test(m.modelId))||(['kimi','kimi_intl'].includes(m.provider)&&m.modelId==='kimi-k3'))body.reasoning_effort='low';const r=await fetchOfficial(p.base+(p.kind==='anthropic'?'/messages':'/chat/completions'),{method:'POST',headers:authHeaders(m.provider,key),signal:AbortSignal.timeout(settings.timeoutSec*1000),body:JSON.stringify(body)},fetcher);if(!r.ok)return r;const b=await r.json();if(p.kind==='anthropic')return Response.json({choices:[{message:{content:(b.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')},finish_reason:b.stop_reason}],usage:{prompt_tokens:b.usage?.input_tokens,completion_tokens:b.usage?.output_tokens}});return Response.json(b);}
