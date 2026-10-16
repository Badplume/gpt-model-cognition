import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {DEFAULTS,seal,unseal,validateSettings,consult,mcp,checkOrigin,selectModels,readSettings,updateSettings,status,applyStarterLimits} from '../lib/delegator.mjs';
import {SETTINGS_HTML,SETTINGS_URI} from '../lib/settings-ui.mjs';
import {Script} from 'node:vm';
import {prepareRequest,decideRequest,executeRequest,getRequest} from '../lib/workload.mjs';
import {providerModels,directInference,saveProvider,checkProviderConnection,authHeaders} from '../lib/providers.mjs';
import {completeResult} from '../lib/mcp-protocol.mjs';
import {FULL_UI_HTML} from '../lib/console-ui.mjs';
function database(){const sql=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')))sql.exec(readFileSync('drizzle/'+file,'utf8'));return {sql,prepare(query){return {bind(...args){return {async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return sql.prepare(query).run(...args)}}}}},async batch(stmts){return Promise.all(stmts.map(s=>s.run()))}};}
const catalog=[{id:'test/a',name:'A',architecture:{input_modalities:['text'],output_modalities:['text']},context_length:100000,pricing:{prompt:'0.000001',completion:'0.000002'}},{id:'test/b',name:'B',architecture:{input_modalities:['text'],output_modalities:['text']},context_length:100000,pricing:{prompt:'0.0000001',completion:'0.0000002'}}];
async function setup(overrides={}){const env={DB:database(),DELEGATOR_VAULT_KEY:randomBytes(32).toString('base64')};const now=new Date().toISOString(),date=now.slice(0,10);await env.DB.prepare('INSERT INTO official_pricing(id,payload,fetched_at,attempted_at) VALUES(?,?,?,?)').bind('fx',JSON.stringify({date,cnyPerUsd:1,usdPerUnit:{USD:1,CNY:1},sourceUrl:'test://fx'}),now,now).run();const secret=await seal('test-secret','alice',env);await env.DB.prepare('INSERT INTO accounts VALUES(?,?,?)').bind('alice',secret,JSON.stringify({...DEFAULTS,enabled:true,models:['test/a','test/b'],...overrides})).run();return env;}
function upstream(fn){return async(url,init)=>url.endsWith('/models')?Response.json({data:catalog}):fn(JSON.parse(init.body));}
const req=(body,auth=true)=>new Request('https://example.test/mcp',{method:'POST',headers:auth?{'oai-authenticated-user-id':'alice'}:{},body:JSON.stringify(body)});
test('encrypted key is bound to its owner',async()=>{const env=await setup();const x=await seal('never-expose','alice',env);assert(!x.includes('never-expose'));assert.equal(await unseal(x,'alice',env),'never-expose');await assert.rejects(unseal(x,'bob',env));});
test('invalid budgets are blocked and permission can be saved before setup',()=>{assert.throws(()=>validateSettings({...DEFAULTS,callCny:2,dailyCny:1}));assert.equal(validateSettings({...DEFAULTS,enabled:true}).enabled,true);assert.throws(()=>validateSettings({...DEFAULTS,models:['a','a']}));});
test('cross-origin settings are rejected',()=>{assert.throws(()=>checkOrigin(new Request('https://example.test/api/config',{headers:{origin:'https://evil.test'}})));});
test('discovery contains no private data; tool calls require user identity',async()=>{const env=await setup();const list=await (await mcp(req({jsonrpc:'2.0',id:1,method:'tools/list'},false),env)).json();assert(list.result.tools.some(t=>t.name==="open_settings"));assert(!JSON.stringify(list).includes("test-secret"));const result=await mcp(req({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_status'}},false),env);assert.equal(result.status,401);});
test('status never exposes encrypted or plaintext keys',async()=>{const env=await setup();const r=await mcp(req({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_status'}}),env);const s=await r.text();assert(!s.includes('encrypted_key'));assert(!s.includes('test-secret'));});
test('disabled account never contacts upstream',async()=>{const env=await setup({enabled:false});let called=false;await assert.rejects(consult('consult_model',{task:'x'},env,'alice',()=>{called=true;}));assert(!called);});
test('approved models only and cheapest delegation',()=>{const c=catalog.map(m=>({id:m.id,prompt:Number(m.pricing.prompt),completion:Number(m.pricing.completion)}));assert.equal(selectModels('delegate_task',{},['test/a','test/b'],c)[0].id,'test/b');assert.throws(()=>selectModels('consult_model',{model:'forbidden'},['test/a'],c));assert.throws(()=>selectModels('multi_model_review',{models:['test/a','test/a']},['test/a'],c));});
test('independent review uses identical evidence and reconciles costs',async()=>{const env=await setup({approvalModels:3});const prompts=[];const result=await consult('multi_model_review',{task:'Check evidence',context:'Only clue A'},env,'alice',upstream(b=>{prompts.push(b.messages);assert.equal(b.provider.zdr,true);assert.equal(b.provider.data_collection,'deny');assert.equal(b.max_completion_tokens,2048);assert.deepEqual(b.plugins,[]);return Response.json({choices:[{message:{content:'Possible gap'},finish_reason:'stop'}],usage:{cost:.001}});}));assert.equal(result.results.length,2);assert.deepEqual(prompts[0],prompts[1]);const row=env.DB.sql.prepare('SELECT used_cny AS used FROM budgets').get();assert.equal(row.used,2000);});
test('atomic budget reservation blocks overlapping requests',async()=>{const env=await setup({dailyCny:.01,callCny:.01});let resolve;const held=new Promise(r=>resolve=r);let count=0;const fetcher=upstream(async()=>{count++;await held;return Response.json({choices:[{message:{content:'ok'}}],usage:{cost:.001}});});const first=consult('consult_model',{task:'x'},env,'alice',fetcher);await new Promise(r=>setTimeout(r,20));await assert.rejects(consult('consult_model',{task:'x'},env,'alice',fetcher),/今日.*预算不足/);resolve();await first;assert.equal(count,1);});
test('unknown network charges remain reserved and requests are not retried',async()=>{const env=await setup();let count=0;const r=await consult('consult_model',{task:'x'},env,'alice',upstream(()=>{count++;throw Error('disconnect');}));assert.equal(count,1);assert.equal(r.results[0].accounting,'unknown');assert(env.DB.sql.prepare('SELECT used_cny AS used FROM budgets').get().used>0);});
test('definite upstream rejection releases reservation without fallback',async()=>{const env=await setup();let count=0;await consult('consult_model',{task:'x'},env,'alice',upstream(()=>{count++;return new Response('',{status:402});}));assert.equal(count,1);assert.equal(env.DB.sql.prepare('SELECT used_cny AS used FROM budgets').get().used,0);});
test('oversized tasks and per-call excess never run inference',async()=>{const env=await setup({callCny:.001});let count=0;const f=upstream(()=>{count++;return Response.json({});});await assert.rejects(consult('consult_model',{task:'x'},env,'alice',f),/单次上限/);await assert.rejects(consult('consult_model',{task:'x'.repeat(60001)},env,'alice',f),/60 KB/);assert.equal(count,0);});

test('manual mode requires an explicit user request before paid inference',async()=>{const env=await setup({policy:'manual'});let calls=0;const f=upstream(()=>{calls++;return Response.json({choices:[{message:{content:'ok'}}],usage:{cost:0}})});await assert.rejects(consult('consult_model',{task:'check'},env,'alice',f),/手动模式/);assert.equal(calls,0);await consult('consult_model',{task:'check',request_source:'user'},env,'alice',f);assert.equal(calls,1)});
test('disabled scenarios and user context cap stop inference before upstream access',async()=>{const env=await setup({allowDelegate:false,allowCreativity:false,maxContextKb:1});let calls=0;const f=()=>{calls++;throw Error('unexpected')};await assert.rejects(consult('delegate_task',{task:'x'},env,'alice',f),/委派/);await assert.rejects(consult('consult_model',{task:'x',trigger:'creativity'},env,'alice',f),/场景已关闭/);await assert.rejects(consult('consult_model',{task:'字'.repeat(400)},env,'alice',f),/1 KB/);assert.equal(calls,0)});
test('role preferences and independent review limits are honored',()=>{const cat=catalog.map(m=>({id:m.id,prompt:Number(m.pricing.prompt),completion:Number(m.pricing.completion)})),s={...DEFAULTS,advisorModel:'test/b',reviewModel:'test/b',delegateModel:'test/a'};assert.equal(selectModels('consult_model',{},['test/a','test/b'],cat,s)[0].id,'test/b');assert.equal(selectModels('delegate_task',{},['test/a','test/b'],cat,s)[0].id,'test/a');assert.equal(selectModels('multi_model_review',{},['test/a','test/b'],cat,s)[0].id,'test/b');assert.throws(()=>selectModels('multi_model_review',{},['test/a','test/b'],cat,{...s,allowReview:false}),/关闭/);assert.throws(()=>validateSettings({...DEFAULTS,advisorModel:'unknown'}));});
test('settings updates preserve keys and reject unknown fields and owner crossover',async()=>{const env=await setup();const before=env.DB.sql.prepare('SELECT encrypted_key FROM accounts WHERE user_id=?').get('alice');const saved=await updateSettings(env,'alice',{policy:'conservative',timeoutSec:30});assert.equal(saved.values.policy,'conservative');assert.equal(saved.values.timeoutSec,30);assert.deepEqual(before,env.DB.sql.prepare('SELECT encrypted_key FROM accounts WHERE user_id=?').get('alice'));assert.equal((await readSettings(env,'bob')).values.enabled,false);assert.equal((await updateSettings(env,'bob',{enabled:true})).values.enabled,true);assert.equal((await readSettings(env,'alice')).values.policy,'conservative');await assert.rejects(updateSettings(env,'alice',{apiKey:'secret'}),/设置项/);assert(!JSON.stringify(saved).includes('test-secret'));});
test('desktop settings resource is discoverable and its bridge script parses',async()=>{new Script(SETTINGS_HTML.match(/<script>([\s\S]*?)<\/script>/)[1]);const env=await setup();const r=await (await mcp(req({jsonrpc:'2.0',id:1,method:'resources/read',params:{uri:SETTINGS_URI}},false),env)).json();assert.equal(r.result.contents[0].mimeType,'text/html;profile=mcp-app');assert(!JSON.stringify(r).includes('test-secret'));const init=await(await mcp(req({jsonrpc:'2.0',id:2,method:'initialize',params:{protocolVersion:'2025-11-25'}},false),env)).json();assert.equal(init.result.capabilities.extensions['openai/settings'].readTool,'read_settings');});

test('large requests do not infer before approval and execute only once',async()=>{const env=await setup({approvalCny:.001});let calls=0;const f=upstream(()=>{calls++;return Response.json({choices:[{message:{content:'answer'}}],usage:{cost:.001}})});const p=await prepareRequest('consult_model',{task:'large case'},env,'alice',f);assert.equal(p.approval_required,true);assert.equal(calls,0);assert.equal((await executeRequest(p.request_id,env,'alice',f)).status,'pending');assert.equal(calls,0);await assert.rejects(decideRequest(p.request_id,true,env,'bob'));await decideRequest(p.request_id,true,env,'alice');await executeRequest(p.request_id,env,'alice',f);await executeRequest(p.request_id,env,'alice',f);assert.equal(calls,1);assert(!env.DB.sql.prepare('SELECT payload FROM requests').get().payload.includes('large case'));});
test('rejection, expiry, changed settings and rising price block approved execution',async()=>{const env=await setup({approvalMode:'always'});const f=upstream(()=>{throw Error('must not run')});const p=await prepareRequest('consult_model',{task:'check'},env,'alice',f);await decideRequest(p.request_id,false,env,'alice');assert.equal((await executeRequest(p.request_id,env,'alice',f)).status,'rejected');const q=await prepareRequest('consult_model',{task:'other'},env,'alice',f);await decideRequest(q.request_id,true,env,'alice');await updateSettings(env,'alice',{timeoutSec:20});await assert.rejects(executeRequest(q.request_id,env,'alice',f),/设置已改变/);env.DB.sql.prepare('UPDATE requests SET expires_at=? WHERE id=?').run('2000-01-01',q.request_id);await assert.rejects(getRequest(q.request_id,env,'alice'),/过期/);});
test('direct provider calls run with no OpenRouter key or endpoint access',async()=>{const env=await setup({models:['anthropic:test-claude']});await env.DB.prepare('UPDATE accounts SET encrypted_key=NULL WHERE user_id=?').bind('alice').run();await env.DB.prepare('INSERT INTO provider_keys VALUES(?,?,?)').bind('alice','anthropic',await seal('direct-secret','alice',env)).run();await env.DB.prepare('INSERT INTO direct_models VALUES(?,?,?,?,?,?,?,?)').bind('anthropic:test-claude','alice','anthropic','test-claude','Claude test',1,2,100000).run();const now=new Date().toISOString();await env.DB.prepare('INSERT INTO official_pricing(id,payload,fetched_at,attempted_at) VALUES(?,?,?,?)').bind('anthropic',JSON.stringify([{modelId:'test-claude',currency:'USD',input:1,output:2,note:'test official'}]),now,now).run();const urls=[];const f=async(url,init)=>{urls.push(url);assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(init.headers['x-api-key'],'direct-secret');const body=JSON.parse(init.body);assert.equal(body.model,'test-claude');return Response.json({content:[{type:'text',text:'direct answer'}],usage:{input_tokens:10,output_tokens:20}})};const r=await consult('consult_model',{task:'check'},env,'alice',f);assert.equal(r.results[0].answer,'direct answer');assert.equal(r.results[0].accounting,'estimated');assert.equal(urls.length,1);});
test('Gemini and compatible provider authentication uses their own official URLs',async()=>{let seen;const out=await directInference({provider:'gemini',modelId:'test-gemini'},'gemini-secret','system','task',{maxTokens:512,timeoutSec:15},async(url,init)=>{seen={url,init};return Response.json({choices:[{message:{content:'ok'}}],usage:{prompt_tokens:1,completion_tokens:1}})});assert.equal(seen.url,'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');assert.equal(seen.init.headers.Authorization,'Bearer gemini-secret');assert.equal((await out.json()).choices[0].message.content,'ok');await assert.rejects(providerModels('unsupported','key'));});
test('no model-facing approval tool is advertised',async()=>{const env=await setup();const r=await(await mcp(req({jsonrpc:'2.0',id:1,method:'tools/list'},false),env)).json();assert(r.result.tools.some(t=>t.name==='prepare_request'));assert(r.result.tools.some(t=>t.name==='open_console'));assert(!r.result.tools.some(t=>/approve|decide/.test(t.name)));});
test('rising estimate after approval is blocked before any inference',async()=>{const env=await setup({approvalMode:'always'}),f=upstream(()=>{throw Error('must not infer')});const p=await prepareRequest('consult_model',{task:'check'},env,'alice',f);await decideRequest(p.request_id,true,env,'alice');let inferred=false;const expensive=async(url)=>{if(!url.endsWith('/models')){inferred=true;throw Error('unexpected')}return Response.json({data:catalog.map(m=>({...m,pricing:{prompt:String(Number(m.pricing.prompt)*2),completion:String(Number(m.pricing.completion)*2)}}))})};await assert.rejects(executeRequest(p.request_id,env,'alice',expensive),/估算已上升/);assert.equal(inferred,false);});
test('concurrent execution claims one request only once',async()=>{const env=await setup();let calls=0,release;const gate=new Promise(r=>release=r),f=upstream(async()=>{calls++;await gate;return Response.json({choices:[{message:{content:'ok'}}],usage:{cost:0}})});const p=await prepareRequest('consult_model',{task:'check'},env,'alice',f);const first=executeRequest(p.request_id,env,'alice',f);await new Promise(r=>setTimeout(r,15));assert.equal((await executeRequest(p.request_id,env,'alice',f)).status,'running');release();await first;assert.equal(calls,1);});
test('full native desktop resource is self-contained and parses without external scripts',()=>{new Script(FULL_UI_HTML.match(/<script>([\s\S]*?)<\/script>/)[1]);assert(FULL_UI_HTML.includes('ui/initialize'));assert(!/<script[^>]+src=/.test(FULL_UI_HTML));assert(!FULL_UI_HTML.includes('direct-secret'));});
test('2026 MCP resource and tool results declare completion while legacy results stay compatible',async()=>{
 const env=await setup();
 for(const body of [{method:'resources/read',params:{uri:SETTINGS_URI}},{method:'tools/list'},{method:'tools/call',params:{name:'open_console'}}]){
  const modern=req({jsonrpc:'2.0',id:1,...body});modern.headers.set('mcp-protocol-version','2026-07-28');
  const result=await(await mcp(modern,env)).json();assert.equal(result.result.resultType,'complete');assert(!result.error);
  const legacy=await(await mcp(req({jsonrpc:'2.0',id:2,...body}),env)).json();assert.equal(legacy.result.resultType,undefined);
 }
 const meta=await(await mcp(req({jsonrpc:'2.0',id:3,method:'tools/list',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}}),env)).json();assert.equal(meta.result.resultType,'complete');
});

test('master permission saves with no key or models but inference remains blocked without upstream calls',async()=>{
 const env=await setup();await env.DB.prepare('DELETE FROM accounts WHERE user_id=?').bind('alice').run();
 const saved=await updateSettings(env,'alice',{enabled:true});assert.equal(saved.values.enabled,true);
 const state=await status(env,'alice');assert.equal(state.readiness.state,'needs_key');assert.equal(state.readiness.ready,false);
 let calls=0;await assert.rejects(consult('consult_model',{task:'x'},env,'alice',()=>{calls++;throw Error('unexpected')}),/尚未配置允许模型/);assert.equal(calls,0);
 const off=await updateSettings(env,'alice',{enabled:false});assert.equal(off.values.enabled,false);
});
test('starter limits preserve credentials, permission, model choices and policy',async()=>{
 const env=await setup({dailyCny:5,maxCallsPerTask:8,maxTokens:2050,policy:'manual',approvalMode:'always'});
 const before=env.DB.sql.prepare('SELECT encrypted_key FROM accounts WHERE user_id=?').get('alice');
 const result=await applyStarterLimits(env,'alice');assert.deepEqual(before,env.DB.sql.prepare('SELECT encrypted_key FROM accounts WHERE user_id=?').get('alice'));
 assert.equal(result.settings.enabled,true);assert.deepEqual(result.settings.models,['test/a','test/b']);assert.equal(result.settings.policy,'manual');assert.equal(result.settings.approvalMode,'always');
 assert.equal(result.settings.dailyCny,7);assert.equal(result.settings.callCny,1);assert.equal(result.settings.maxTokens,2048);assert.equal(result.settings.approvalModels,2);assert.equal(result.settings.maxCallsPerTask,3);
 assert.equal((await status(env,'bob')).settings.enabled,false);
});
test('desktop settings include connection entry, clear master permission and all approval controls',async()=>{
 const env=await setup(),s=await readSettings(env,'alice');assert(s.layout.some(g=>g.items.some(i=>i.tool==='open_provider_setup')));assert(s.layout.some(g=>g.items.some(i=>i.tool==='apply_starter_limits')));
 const properties=s.layout.flatMap(g=>g.items.map(i=>i.property));for(const k of ['approvalMode','approvalCny','approvalTokens','approvalModels'])assert(properties.includes(k));
 assert(s.schema.properties.enabled.description.includes('不会更换主模型或立即消费'));assert(SETTINGS_HTML.includes('连接模型 / 填写 API Key'));assert(!SETTINGS_HTML.includes('请更新桌面端'));
});

test('desktop resource loading includes required MCP 2026 cache hints via metadata and HTTP header',async()=>{
 const env=await setup();
 const uris=[SETTINGS_URI,'ui://model-delegator/settings-v3-1.html','ui://model-delegator/settings-v2.html','ui://model-delegator/console-v3-1.html','ui://model-delegator/console-v3.html'];
 for(const method of ['server/discover','tools/list','resources/list','resources/read'])for(const transport of ['metadata','header']){
  for(const uri of method==='resources/read'?uris:[undefined]){
   const params={...(uri?{uri}:{}),...(transport==='metadata'?{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}:{})};
   const request=req({jsonrpc:'2.0',id:1,method,params},false);if(transport==='header')request.headers.set('mcp-protocol-version','2026-07-28');
   const body=await(await mcp(request,env)).json();assert(!body.error);
   const r=body.result;assert.equal(r.resultType,'complete');assert.equal(r.ttlMs,0);assert.equal(r.cacheScope,'private');
   if(uri){assert.equal(r.contents[0].uri,uri);assert.equal(r.contents[0].mimeType,'text/html;profile=mcp-app');assert(r.contents[0].text.startsWith('<!doctype html>'));}
  }
 }
 for(const method of ['resources/read','resources/list','tools/list']){
  const r=(await(await mcp(req({jsonrpc:'2.0',id:2,method,params:{uri:SETTINGS_URI}},false),env)).json()).result;
  for(const field of ['resultType','ttlMs','cacheScope'])assert.equal(r[field],undefined);
 }
 const r=(await(await mcp(req({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_status',_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}}),env)).json()).result;
 assert.equal(r.resultType,'complete');assert.equal(r.ttlMs,undefined);assert.equal(r.cacheScope,undefined);
});

test('all protocol cacheable operations have mandatory hints without caching mutable tool results',()=>{
 for(const method of ['server/discover','tools/list','prompts/list','resources/list','resources/templates/list','resources/read']){
  assert.deepEqual(completeResult(method,'2026-07-28',{}),{resultType:'complete',ttlMs:0,cacheScope:'private'});
 }
 assert.deepEqual(completeResult('tools/call','2026-07-28',{isError:true}),{isError:true,resultType:'complete'});
 assert.deepEqual(completeResult('initialize','2026-07-28',{protocolVersion:'2026-07-28'}),{protocolVersion:'2026-07-28'});
});

test('failed provider verification does not store a key or leak upstream errors',async()=>{
 const env=await setup();let requests=0;
 await assert.rejects(saveProvider(env,'alice',{provider:'anthropic',apiKey:'test-private-key'},async()=>{requests++;throw Error('test-private-key upstream network failure')}),e=>e.status===502&&!e.message.includes('test-private-key')&&e.message.includes('密钥未保存'));
 assert.equal(requests,1);assert.equal(env.DB.sql.prepare('SELECT COUNT(*) AS n FROM provider_keys').get().n,0);
 for(const payload of [{error:{message:'private upstream'}},{data:{invalid:true}}])await assert.rejects(providerModels('deepseek','test-private-key',async()=>Response.json(payload)),/目录格式无效/);
 await assert.rejects(providerModels('deepseek','test-private-key',async()=>new Response('',{status:401})),/HTTP 401/);
});

test('network diagnostics use only fixed official endpoints and never send credentials or infer',async()=>{
 let calls=0;const result=await checkProviderConnection('deepseek',async(url,init)=>{calls++;assert.equal(url,'https://api.deepseek.com/models');assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,undefined);assert.equal(init.headers['x-api-key'],undefined);assert.equal(init.body,undefined);return new Response('',{status:401})});
 assert.equal(result.ok,true);assert.equal(result.http_status,401);assert.equal(result.credentials_sent,false);assert.equal(result.inference_called,false);assert.equal(calls,1);
 await assert.rejects(checkProviderConnection('https://example.invalid',()=>{throw Error('must not run')}),/不支持/);
 const failure=await checkProviderConnection('deepseek',async()=>{throw Error('private upstream details')});assert.equal(failure.reason,'network_error');assert(!JSON.stringify(failure).includes('private upstream details'));
});

test('provider redirects are never followed, retried, saved or reported as bad API keys',async()=>{
 const env=await setup();let calls=0;const redirected=async()=>{calls++;return new Response('',{status:307,headers:{location:'https://example.invalid/?private=never-expose'}})};
 await assert.rejects(saveProvider(env,'alice',{provider:'deepseek',apiKey:'test-private-key'},redirected),e=>e.status===502&&e.message.includes('跳转')&&!e.message.includes('never-expose'));
 assert.equal(calls,1);assert.equal(env.DB.sql.prepare('SELECT COUNT(*) AS n FROM provider_keys').get().n,0);
 const state=await checkProviderConnection('deepseek',redirected);assert.equal(state.reason,'redirect_blocked');assert.equal(calls,2);
 await assert.rejects(directInference({provider:'deepseek',modelId:'test-model'},'test-private-key','system','task',{maxTokens:256,timeoutSec:15},redirected),e=>e.name==='OfficialRedirectError');assert.equal(calls,3);
});

test('malformed keys fail before any network request and do not expose their value',async()=>{
 for(const key of ['Bearer private-key','private\nkey','private\u200bkey','私有密钥']){
  let calls=0;await assert.rejects(providerModels('deepseek',key,()=>{calls++;throw Error('unexpected')}),e=>e.status===400&&!e.message.includes(key));assert.equal(calls,0);
 }
 assert.equal(authHeaders('deepseek','test-key').Authorization,'Bearer test-key');
});

test('timeout and service denial stay distinct from credential verification',async()=>{
 await assert.rejects(providerModels('deepseek','test-key',async()=>{throw new DOMException('hidden','TimeoutError')}),e=>e.status===504&&e.message.includes('超时'));
 for(const status of [403,429,503]){const s=await checkProviderConnection('deepseek',async()=>new Response('',{status}));assert.equal(s.reachable,true);assert.equal(s.ok,false);assert.equal(s.http_status,status);}
});

test('connection diagnostic is an app-only read-only tool with no credential argument',async()=>{
 const env=await setup(),r=await(await mcp(req({jsonrpc:'2.0',id:1,method:'tools/list'},false),env)).json();
 const tool=r.result.tools.find(t=>t.name==='check_provider_connection');assert.deepEqual(tool._meta.ui.visibility,['app']);assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.inputSchema.properties.apiKey,undefined);
});
