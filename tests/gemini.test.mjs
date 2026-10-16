import test from 'node:test';import assert from 'node:assert/strict';
import {providerModels,checkProviderConnection,saveProvider} from '../lib/providers.mjs';
import {GEMINI_MODELS,googleError,geminiIssue} from '../lib/gemini.mjs';
test('Google anonymous auth challenge is reachable, while region denial and 404 are distinct',async()=>{
 for(const [status,message,reason,ok] of [[403,"Method doesn't allow unregistered callers (callers without established identity).",'authentication_required',true],[400,'User location is not supported for the API use.','region_restricted',false],[404,'Requested entity was not found.','endpoint_not_found',false]]){
  const r=await checkProviderConnection('gemini',async(url,init)=>{assert.equal(url,GEMINI_MODELS);assert(!init.headers.Authorization);assert(!init.headers['x-goog-api-key']);assert.equal(init.redirect,'manual');return Response.json({error:{message}},{status})});
  assert.equal(r.reason,reason);assert.equal(r.ok,ok);assert.equal(r.reachable,true);assert.equal(r.credentials_sent,false);assert.equal(r.inference_called,false);
 }
});
test('Gemini native model discovery uses header auth, normalizes IDs and follows bounded native pagination',async()=>{
 let calls=0;const models=await providerModels('gemini','test-google-key',async(url,init)=>{
  calls++;assert.equal(init.headers['x-goog-api-key'],'test-google-key');assert.equal(init.headers.Authorization,undefined);assert(!url.includes('test-google-key'));assert.equal(init.redirect,'manual');
  return Response.json(calls===1?{models:[{name:'models/gemini-test',displayName:'Test',inputTokenLimit:50000,supportedGenerationMethods:['generateContent']},{name:'models/embed',supportedGenerationMethods:['embedContent']}],nextPageToken:'a/b'}:{models:[{name:'models/gemini-test',supportedGenerationMethods:['generateContent']},{name:'models/gemini-test-2',supportedGenerationMethods:['generateContent']} ]});
 });assert.equal(calls,2);assert.deepEqual(models.map(m=>m.id),['gemini-test','gemini-test-2']);assert.equal(models[0].context,50000);
 await assert.rejects(providerModels('gemini','test-google-key',async()=>Response.json({models:[],nextPageToken:'same'})),/分页异常/);
});
test('Gemini failures never save keys, echo server messages or confuse 404 with transient networking',async()=>{
 for(const status of [400,401,403,404]){await assert.rejects(saveProvider({DB:{prepare(){throw Error('must not persist')}}},'u',{provider:'gemini',apiKey:'test-google-key'},async()=>Response.json({error:{message:'secret upstream test-google-key',details:[{reason:'API_KEY_INVALID'}]}},{status})),e=>!e.message.includes('test-google-key')&&e.message.includes('无效'));}
 assert.equal(geminiIssue({message:'User location is not supported'},400).reason,'region_restricted');
 assert.equal(geminiIssue({},404).reason,'endpoint_not_found');
 assert.deepEqual(await googleError(new Response('x'.repeat(20000),{status:403})),{});
});
