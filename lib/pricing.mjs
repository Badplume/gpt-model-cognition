// Public official price data only. This module never reads keys or user accounts.
import {fetchOfficial} from './official-fetch.mjs';
import {parseDeepSeek,parseQwen,SOURCES} from './pricing-qwen-deepseek.mjs';
import {GLM_KIMI_PRICING_SOURCES} from './pricing-glm-kimi.mjs';
import {GLOBAL_PRICING_SOURCES} from './pricing-global.mjs';
import {readPricingPolicy,nextPricingCheck} from './pricing-policy.mjs';
export const FX_URL='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const PRICE_SOURCES=[
 {id:'deepseek',provider:'deepseek',url:SOURCES.deepseek,parse:parseDeepSeek},
 {id:'qwen',provider:'qwen',url:SOURCES.qwen,parse:parseQwen},
 ...GLM_KIMI_PRICING_SOURCES,...GLOBAL_PRICING_SOURCES
];
const DAY=86400000,MAX_AGE=7*DAY,inflight=new Map();
export function parseFx(xml,now=Date.now()){
 const date=xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
 const usd=Number(xml.match(/currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/)?.[1]);
 const cny=Number(xml.match(/currency=['"]CNY['"]\s+rate=['"]([\d.]+)['"]/)?.[1]);
 const at=Date.parse(date+'T00:00:00Z');
 if(!Number.isFinite(at)||at>now+DAY||now-at>MAX_AGE||!Number.isFinite(usd)||usd<.1||usd>10||!Number.isFinite(cny)||cny<1||cny>100)throw Error('官方汇率格式或日期无效');
 return {date,base:'CNY',usdPerUnit:{USD:1,CNY:usd/cny},cnyPerUsd:cny/usd,sourceUrl:FX_URL};
}
export function validatePrices(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>2000)throw Error('官方价格表为空或结构改变');
 const ids=new Set();
 for(const r of rows){if(typeof r.modelId!=='string'||!r.modelId||r.modelId.length>120||ids.has(r.modelId)||!['USD','CNY'].includes(r.currency)||!Number.isFinite(r.input)||!Number.isFinite(r.output)||r.input<0||r.output<0||r.input>10000||r.output>10000||!r.note||(r.safeInputRate!=null&&(!Number.isFinite(r.safeInputRate)||r.safeInputRate<r.input||r.safeInputRate>10000)))throw Error('官方价格数据未通过检查');ids.add(r.modelId);}
 return rows;
}
async function publicText(url,fetcher){
 const r=await fetchOfficial(url,{headers:{Accept:'text/html,text/plain,application/xml'},signal:AbortSignal.timeout(20000)},fetcher);
 if(!r.ok)throw Error('官方来源 HTTP '+r.status);
 // Price pages may be large; bound both advertised and streamed response size.
 if(Number(r.headers.get('content-length')||0)>4000000)throw Error('来源超过大小上限');
 const reader=r.body.getReader(),chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4000000){await reader.cancel();throw Error('来源超过大小上限');}chunks.push(value);}
 const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(joined);
}
async function readCache(env,id){const r=await env.DB.prepare('SELECT * FROM official_pricing WHERE id=?').bind(id).first();return r?{...r,data:r.payload?JSON.parse(r.payload):null}:null;}
async function updateSource(env,s,fetcher,now,force,policy){
 const old=await readCache(env,s.id);
 if(old&&(force||old.error?now-Date.parse(old.attempted_at)<300000:now<Date.parse(nextPricingCheck(old.attempted_at,policy.refreshHours))))return {id:s.id,skipped:true,ok:!!old.data&&!old.error,error:old.error};
 const at=new Date(now).toISOString();
 try{
  const body=await publicText(s.url,fetcher),data=s.id==='fx'?parseFx(body,now):validatePrices(s.parse(body));
  await env.DB.prepare('INSERT INTO official_pricing(id,payload,fetched_at,attempted_at,error) VALUES(?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,attempted_at=excluded.attempted_at,error=NULL').bind(s.id,JSON.stringify(data),at,at).run();
  return {id:s.id,ok:true,models:Array.isArray(data)?data.length:undefined,changed:JSON.stringify(old?.data)!==JSON.stringify(data)};
 }catch(e){
  // Do not store upstream text, credentials, or exception traces.
  const error=e?.name==='OfficialRedirectError'?'官方来源发生跳转，已停止':e?.name==='TimeoutError'?'官方来源超时':'来源不可用或价格结构改变，保留上次成功数据';
  await env.DB.prepare('INSERT INTO official_pricing(id,payload,fetched_at,attempted_at,error) VALUES(?,NULL,NULL,?,?) ON CONFLICT(id) DO UPDATE SET attempted_at=excluded.attempted_at,error=excluded.error').bind(s.id,at,error).run();
  return {id:s.id,ok:false,error};
 }
}
export async function refreshPricing(env,{force=false,provider,fetcher=fetch,now=Date.now()}={}){
 const policy=await readPricingPolicy(env);
 if(!force&&!policy.autoUpdate)return {results:[],automaticPaused:true,...await pricingStatus(env,now)};
 const list=[...PRICE_SOURCES.filter(s=>!provider||s.provider===provider),{id:'fx',url:FX_URL}];
 // Dedupe overlapping page refreshes inside a Worker isolate. Persisted attempt dates
 // also prevent normal UI refreshes from becoming a scraper loop.
 const results=await Promise.all(list.map(s=>{const id=s.id;if(!inflight.has(id))inflight.set(id,updateSource(env,s,fetcher,now,force,policy).finally(()=>inflight.delete(id)));return inflight.get(id)}));
 return {results,...await pricingStatus(env,now)};
}
export async function pricingStatus(env,now=Date.now()){
 const all=await env.DB.prepare('SELECT * FROM official_pricing').bind().all(),cache=all.results||[];
 const f=cache.find(x=>x.id==='fx'),fx=f?.payload?JSON.parse(f.payload):null;
 const policy=await readPricingPolicy(env),allSources=[...PRICE_SOURCES,{id:'fx'}];
 const nextChecks=policy.autoUpdate?allSources.map(s=>{const c=cache.find(x=>x.id===s.id);return nextPricingCheck(c?.attempted_at,policy.refreshHours)||new Date(now).toISOString()}):[];
 return {baseCurrency:'CNY',pricingCurrency:'CNY',budgetCurrency:'CNY',policy,nextCheckAt:nextChecks.length?nextChecks.sort()[0]:null,refreshCadence:policy.autoUpdate?(policy.refreshHours===24?'每天':'每 3 天')+' · 北京时间 09:00 检查到期':'自动更新已关闭',maxStaleDays:7,
  fx:fx?{...fx,fetchedAt:f.fetched_at,stale:now-Date.parse(f.fetched_at)>MAX_AGE||now-Date.parse(fx.date+'T00:00:00Z')>MAX_AGE,error:f.error}:null,
  sources:PRICE_SOURCES.map(s=>{const c=cache.find(x=>x.id===s.id);return {id:s.id,provider:s.provider,url:s.url,fetchedAt:c?.fetched_at||null,attemptedAt:c?.attempted_at||null,error:c?.error||null,models:c?.payload?JSON.parse(c.payload).length:0,stale:!c?.fetched_at||now-Date.parse(c.fetched_at)>MAX_AGE}})};
}
export async function officialPrice(env,provider,modelId,{fetcher=fetch,now=Date.now(),refresh=true}={}){
 const source=PRICE_SOURCES.find(s=>s.provider===provider);if(!source)return null;
 if(refresh)await refreshPricing(env,{provider,fetcher,now});
 const c=await readCache(env,source.id),row=c?.data?.find(x=>x.modelId===modelId);if(!row)return null;
 const f=await readCache(env,'fx'),fx=f?.data,rate=row.currency==='CNY'?1:fx?.cnyPerUsd;
 const stale=now-Date.parse(c.fetched_at)>MAX_AGE||!f?.fetched_at||now-Date.parse(f.fetched_at)>MAX_AGE||!Number.isFinite(Date.parse(fx?.date+'T00:00:00Z'))||now-Date.parse(fx?.date+'T00:00:00Z')>MAX_AGE;
 const available=!stale&&Number.isFinite(rate)&&rate>0&&Number.isFinite(fx?.cnyPerUsd)&&fx.cnyPerUsd>0;
 // Native currency remains provenance only. All usable numeric rates are CNY per million.
 const normalized={};for(const key of ['input','output','safeInputRate','cacheHit','cacheWrite5m','cacheWrite1h'])if(row[key]!=null)normalized[key]=available?row[key]*rate:null;
 if(row.cacheWrite)normalized.cacheWrite={ttl5m:normalized.cacheWrite5m,ttl1h:normalized.cacheWrite1h};
 return {...row,...normalized,currency:'CNY',original:{currency:row.currency,input:row.input,output:row.output,safeInputRate:row.safeInputRate},sourceUrl:source.url,fetchedAt:c.fetched_at,sourceError:c.error,fxDate:fx?.date||null,fxSource:FX_URL,cnyPerUsd:fx?.cnyPerUsd||null,available,stale};
}
export async function budgetFx(env,fetcher=fetch,now=Date.now()){
 const policy=await readPricingPolicy(env);if(policy.autoUpdate)await updateSource(env,{id:'fx',url:FX_URL},fetcher,now,false,policy);
 const f=await readCache(env,'fx'),fx=f?.data;
 if(!fx||now-Date.parse(f.fetched_at)>MAX_AGE||now-Date.parse(fx.date+'T00:00:00Z')>MAX_AGE||!Number.isFinite(fx.cnyPerUsd)||fx.cnyPerUsd<=0)throw Error('官方汇率不可用或已过期，请同步价格后重试');
 return fx;
}
export async function providerPrices(env,provider){
 const source=PRICE_SOURCES.find(s=>s.provider===provider);if(!source)return {prices:[]};
 const c=await readCache(env,source.id);return {prices:await Promise.all((c?.data||[]).map(m=>officialPrice(env,provider,m.modelId,{refresh:false})))};
}
