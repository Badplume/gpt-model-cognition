import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {randomBytes} from 'node:crypto';
import {parseFx,PRICE_SOURCES,refreshPricing,officialPrice,budgetFx,validatePrices} from '../lib/pricing.mjs';
import {account,dayBudget,DEFAULTS,seal,planConsult} from '../lib/delegator.mjs';
import {prepareRequest,decideRequest,executeRequest} from '../lib/workload.mjs';
import {readPricingPolicy,savePricingPolicy,nextPricingCheck} from '../lib/pricing-policy.mjs';
import {readPricingAction} from '../lib/pricing-request.mjs';
function environment(){const sql=new DatabaseSync(':memory:');for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+file,'utf8'));const DB={sql,prepare(q){const make=(args=[])=>({bind:(...a)=>make(a),async run(){return sql.prepare(q).run(...args)},async first(){return sql.prepare(q).get(...args)||null},async all(){return {results:sql.prepare(q).all(...args)}}});return make()},async batch(items){return Promise.all(items.map(x=>x.run()))}};return {DB,DELEGATOR_VAULT_KEY:randomBytes(32).toString('base64')}}
const date=new Date().toISOString().slice(0,10),now=Date.now(),at=new Date(now).toISOString();
const xml=`<Cube time='${date}'><Cube currency='USD' rate='1'/><Cube currency='CNY' rate='7'/></Cube>`;
async function cache(env,id,data,when=at){await env.DB.prepare('INSERT OR REPLACE INTO official_pricing(id,payload,fetched_at,attempted_at) VALUES(?,?,?,?)').bind(id,JSON.stringify(data),when,when).run()}
test('empty readable request body selects automatic maintenance but malformed actions fail',async()=>{
 const empty=new Request('https://test/api/pricing',{method:'POST',body:''});assert(empty.body);assert.deepEqual(await readPricingAction(empty),{});
 assert.deepEqual(await readPricingAction(new Request('https://test/api/pricing',{method:'POST',body:'{"action":"refresh"}'})),{action:'refresh'});
 for(const body of ['null','[]','{','{"action":"infer"}','{"unexpected":true}'])await assert.rejects(readPricingAction(new Request('https://test/api/pricing',{method:'POST',body})));
});
test('automatic refresh can be paused while manual refresh remains available without keys',async()=>{
 const env=environment();await savePricingPolicy(env,{autoUpdate:false,refreshHours:72});let calls=0;
 const f=async url=>{calls++;return new Response(url.includes('ecb.europa.eu')?xml:readFileSync('tests/fixtures/public-pricing/deepseek-current.html','utf8'))};
 const paused=await refreshPricing(env,{provider:'deepseek',fetcher:f,now});assert.equal(paused.automaticPaused,true);assert.equal(calls,0);assert.equal(paused.nextCheckAt,null);
 const manual=await refreshPricing(env,{provider:'deepseek',force:true,fetcher:f,now});assert(manual.results.every(x=>x.ok));assert.equal(calls,2);assert.equal((await readPricingPolicy(env)).autoUpdate,false);
 await budgetFx(env,async()=>{throw Error('paused FX must not fetch')});
});
test('09:00 checks tolerate scheduler jitter and preserve saved three-day policy',async()=>{
 assert.equal(nextPricingCheck('2026-10-16T01:00:20Z',24),'2026-10-17T01:00:00.000Z');assert.equal(nextPricingCheck('2026-10-16T12:00:00Z',72),'2026-10-19T01:00:00.000Z');
 const env=environment();assert.deepEqual(await readPricingPolicy(env),{autoUpdate:true,refreshHours:24});await savePricingPolicy(env,{refreshHours:72});await assert.rejects(savePricingPolicy(env,{refreshHours:12}));assert.equal((await readPricingPolicy(env)).refreshHours,72);
});
test('ECB reference rates cross into CNY and reject invalid or stale dates',()=>{assert.equal(parseFx(xml).cnyPerUsd,7);assert.equal(parseFx(xml).usdPerUnit.CNY,1/7);assert.throws(()=>parseFx(xml.replace(date,'2000-01-01')));assert.throws(()=>parseFx(xml.replace("rate='7'","rate='0'")));});
test('official fixture parsers retain currency and include peak/tier/cache ceilings',()=>{
 const files={deepseek:'deepseek-current.html',qwen:'qwen-beijing.html','glm-official-cny':'glm-official-cny.md','kimi-official-cny':'kimi-official-cny.md','kimi-official-usd':'kimi-official-usd.md'};
 for(const s of PRICE_SOURCES.filter(s=>files[s.id])){const rows=validatePrices(s.parse(readFileSync('tests/fixtures/public-pricing/'+files[s.id],'utf8')));assert(rows.length>=2);if(s.provider==='deepseek'){const flash=rows.find(x=>x.modelId==='deepseek-flash');assert.equal(flash.currency,'USD');assert.equal(flash.input,.3);assert.equal(flash.output,1.2);}if(s.provider==='glm')assert.equal(rows.find(x=>x.modelId==='glm-5.1').output,28);if(s.provider==='kimi')assert.equal(rows.find(x=>x.modelId==='kimi-k3').safeInputRate,60);}
 assert.throws(()=>validatePrices([{modelId:'x',currency:'CNY',input:NaN,output:1,note:'x'}]));
});
test('refresh fetches public sources with no credentials, keeps last good data, expires safely',async()=>{
 const env=environment(),fixture=readFileSync('tests/fixtures/public-pricing/deepseek-current.html','utf8');let calls=0;
 const fetcher=async(url,init)=>{calls++;assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,undefined);assert.equal(init.headers['x-api-key'],undefined);assert(!init.body);return new Response(url.includes('ecb.europa.eu')?xml:fixture)};
 const result=await refreshPricing(env,{provider:'deepseek',fetcher,now});assert(result.results.every(x=>x.ok));assert.equal(calls,2);
 const p=await officialPrice(env,'deepseek','deepseek-flash',{refresh:false,now});assert.equal(p.inputUsd,.3);assert(p.available);
 await refreshPricing(env,{provider:'deepseek',force:true,now:now+360000,fetcher:async()=>new Response('malformed price')});
 const kept=await officialPrice(env,'deepseek','deepseek-flash',{refresh:false,now:now+360000});assert(kept.available);assert.equal(kept.inputUsd,.3);assert(kept.sourceError);
 assert.equal((await officialPrice(env,'deepseek','deepseek-flash',{refresh:false,now:now+8*86400000})).available,false);
 assert.equal(await officialPrice(env,'deepseek','unknown-model',{refresh:false,now}),null);
});
test('legacy USD settings and same-day reserve migrate once without changing historical ledger',async()=>{
 const env=environment();await cache(env,'fx',parseFx(xml));
 await env.DB.prepare('INSERT INTO accounts VALUES(?,?,?)').bind('alice',null,JSON.stringify({dailyUsd:1,callUsd:.15,approvalUsd:.03,enabled:true,models:['deepseek:deepseek-flash']})).run();
 await env.DB.prepare('INSERT INTO budgets(id,used) VALUES(?,?)').bind('alice:'+date,100000).run();
 const a=await account(env.DB,'alice');assert.equal(a.settings.dailyCny,7);assert.equal(a.settings.callCny,1.05);assert.equal(a.settings.approvalCny,.21);assert(!('dailyUsd' in a.settings));
 assert.equal(await dayBudget(env,'alice'),700000);assert.equal(env.DB.sql.prepare('SELECT used FROM budgets').get().used,100000);assert.equal((await account(env.DB,'alice')).settings.dailyCny,7);
});
test('CNY budgets use official rates; rising exchange rate invalidates an approved request before inference',async()=>{
 const env=environment();await cache(env,'fx',parseFx(xml));await cache(env,'deepseek',[{modelId:'deepseek-flash',currency:'USD',input:.3,output:1.2,context:1000000,note:'official fixture'}]);
 await env.DB.prepare('INSERT INTO accounts VALUES(?,?,?)').bind('alice',null,JSON.stringify({...DEFAULTS,enabled:true,models:['deepseek:deepseek-flash'],approvalMode:'always'})).run();
 await env.DB.prepare('INSERT INTO provider_keys VALUES(?,?,?)').bind('alice','deepseek',await seal('test-official-key','alice',env)).run();
 await env.DB.prepare('INSERT INTO direct_models VALUES(?,?,?,?,?,?,?,?)').bind('deepseek:deepseek-flash','alice','deepseek','deepseek-flash','Flash',.001,.002,50000).run();
 let inferred=0;const f=async()=>{inferred++;throw Error('must not call')};
 const plan=await planConsult('consult_model',{task:'verify'},env,'alice',f);assert.equal(plan.selected[0].prompt,.3/1e6);assert(plan.reserved>10000);
 const p=await prepareRequest('consult_model',{task:'verify'},env,'alice',f);assert.equal(p.estimate.budget_currency,'CNY');assert.equal(p.estimate.fx.cny_per_usd,7);await decideRequest(p.request_id,true,env,'alice');
 await cache(env,'fx',{...parseFx(xml),cnyPerUsd:8,usdPerUnit:{USD:1,CNY:1/8}});
 await assert.rejects(executeRequest(p.request_id,env,'alice',f),/估算已上升/);assert.equal(inferred,0);
 await cache(env,'fx',{...parseFx(xml),date:'2000-01-01'});await assert.rejects(budgetFx(env,f),/过期/);
});
