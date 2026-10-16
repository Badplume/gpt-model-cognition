import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PROVIDERS} from '../lib/providers.mjs';
const require=createRequire(import.meta.url);
// Use the same workerd version already installed with this project's Wrangler.
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const {build}=require('esbuild');
const bundled=await build({entryPoints:['tests/fixtures/provider-worker.mjs'],write:false,bundle:true,format:'esm',platform:'browser',target:'es2022'});
async function runtime(mode){
 const calls=[];
 const mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-15',outboundService:async request=>{
  calls.push({url:request.url,method:request.method,authorization:request.headers.get('authorization'),apiKey:request.headers.get('x-api-key')});
  const entry=Object.entries(PROVIDERS).find(([,p])=>request.url.startsWith(p.base+'/'));
  assert(entry,'no request may leave the fixed official provider endpoints');
  const [provider,p]=entry,isCatalog=request.url===p.base+'/models';
  assert(isCatalog||request.url===p.base+(provider==='anthropic'?'/messages':'/chat/completions'));
  if(mode==='redirect')return new Response('',{status:isCatalog?302:307,headers:{location:'https://example.invalid/steal'}});
  if(mode==='unauthenticated')return new Response('',{status:401});
  return Response.json(isCatalog?{data:[{id:'test-model',name:provider}]}:provider==='anthropic'?{content:[{type:'text',text:'runtime answer'}],usage:{input_tokens:1,output_tokens:1}}:{choices:[{message:{content:'runtime answer'}}],usage:{prompt_tokens:1,completion_tokens:1}});
 }});
 return {mf,calls};
}
test('all official catalogs and inference requests run in the deployed workerd runtime',async()=>{
 const {mf,calls}=await runtime('ok');try{
  for(const provider of Object.keys(PROVIDERS)){
   const catalog=await mf.dispatchFetch('http://local.test/?action=catalog&provider='+provider);assert.equal(catalog.status,200);assert.equal((await catalog.json()).models[0].id,'test-model');
   const inference=await mf.dispatchFetch('http://local.test/?action=infer&provider='+provider);assert.equal(inference.status,200);assert.equal((await inference.json()).choices[0].message.content,'runtime answer');
  }
  assert.equal(calls.length,8);
 }finally{await mf.dispose();}
});
test('workerd rejects official redirects without sending a second request',async()=>{
 const {mf,calls}=await runtime('redirect');try{
  const catalog=await mf.dispatchFetch('http://local.test/?action=catalog&provider=deepseek'),body=await catalog.json();assert.equal(catalog.status,502,JSON.stringify(body));assert(body.message.includes('跳转'));
  const inference=await mf.dispatchFetch('http://local.test/?action=infer&provider=deepseek');assert.equal(inference.status,500);assert.equal((await inference.json()).name,'OfficialRedirectError');
  assert.equal(calls.length,2);assert(calls.every(c=>c.url.startsWith('https://api.deepseek.com/')));
 }finally{await mf.dispose();}
});
test('workerd can run the credential-free DeepSeek network check before configuration',async()=>{
 const {mf,calls}=await runtime('unauthenticated');try{
  const r=await mf.dispatchFetch('http://local.test/?action=check&provider=deepseek'),state=await r.json();assert.equal(r.status,200);assert.equal(state.ok,true);assert.equal(state.http_status,401);assert.equal(state.credentials_sent,false);assert.equal(state.inference_called,false);
  assert.equal(calls.length,1);assert.equal(calls[0].authorization,null);assert.equal(calls[0].apiKey,null);assert.equal(calls[0].method,'GET');
 }finally{await mf.dispose();}
});
