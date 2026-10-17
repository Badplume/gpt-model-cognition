import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {PROVIDERS,catalogEndpoint} from '../lib/providers.mjs';
const require=createRequire(import.meta.url);
// Use the same workerd version already installed with this project's Wrangler.
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const {build}=require('esbuild');
const bundled=await build({entryPoints:['tests/fixtures/provider-worker.mjs'],write:false,bundle:true,format:'esm',platform:'browser',target:'es2022'});
async function runtime(mode){
 const calls=[];
 const mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-15',outboundService:async request=>{
  calls.push({url:request.url,method:request.method,authorization:request.headers.get('authorization'),apiKey:request.headers.get('x-api-key'),googleKey:request.headers.get('x-goog-api-key')});
  if(request.url==='https://docs.bigmodel.cn/cn/guide/start/pricing.md')return new Response(readFileSync('tests/fixtures/public-pricing/glm-official-cny.md','utf8'));
  const entry=Object.entries(PROVIDERS).find(([id,p])=>request.url===catalogEndpoint(id)||request.url.startsWith(p.base+'/'));
  assert(entry,'no request may leave the fixed official provider endpoints');
  const [provider,p]=entry,isCatalog=request.url===catalogEndpoint(provider);
  assert(isCatalog||request.url===p.base+(provider==='anthropic'?'/messages':'/chat/completions'));
  if(mode==='redirect')return new Response('',{status:isCatalog?302:307,headers:{location:'https://example.invalid/steal'}});
  if(mode==='unauthenticated')return new Response('',{status:401});
  return Response.json(isCatalog?(provider==='gemini'?{models:[{name:'models/test-model',displayName:'Gemini test',supportedGenerationMethods:['generateContent'],inputTokenLimit:100000}]}:provider==='qwen'?{success:true,output:{total:1,models:[{model:'test-model',name:'test-model'}]}}:{data:[{id:'test-model',name:provider}]}):provider==='anthropic'?{content:[{type:'text',text:'runtime answer'}],usage:{input_tokens:1,output_tokens:1}}:{choices:[{message:{content:'runtime answer'}}],usage:{prompt_tokens:1,completion_tokens:1}});
 }});
 return {mf,calls};
}
test('all official catalogs and inference requests run in the deployed workerd runtime',async()=>{
 const {mf,calls}=await runtime('ok');try{
  for(const provider of Object.keys(PROVIDERS)){
   const catalog=await mf.dispatchFetch('http://local.test/?action=catalog&provider='+provider);assert.equal(catalog.status,200);assert.equal((await catalog.json()).models[0].id,provider==='glm'?'glm-5.3':'test-model');
   const inference=await mf.dispatchFetch('http://local.test/?action=infer&provider='+provider);assert.equal(inference.status,200);assert.equal((await inference.json()).choices[0].message.content,'runtime answer');
  }
  assert.equal(calls.length,Object.keys(PROVIDERS).length*2+1);
  const google=calls.filter(c=>c.url.includes('googleapis.com'));assert.equal(google[0].authorization,null);assert(google[0].googleKey);assert.equal(google[1].googleKey,null);assert(google[1].authorization.startsWith('Bearer '));
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
test('workerd accepts empty-stream POST for automatic pricing updates',async()=>{const {mf,calls}=await runtime('ok');try{const r=await mf.dispatchFetch('http://local.test/?action=pricing-parse',{method:'POST',body:''});assert.equal(r.status,200);assert.deepEqual(await r.json(),{});assert.equal(calls.length,0);}finally{await mf.dispose()}});
test('workerd supports the desktop ECDH/HKDF/AES-GCM connection envelope without upstream access',async()=>{const {mf,calls}=await runtime('ok');try{const r=await mf.dispatchFetch('http://local.test/?action=crypto-envelope'),data=await r.json();assert.equal(r.status,200,JSON.stringify(data));assert.deepEqual(data,{verified:true,plaintext_in_transport:false});assert.equal(calls.length,0);}finally{await mf.dispose()}});
