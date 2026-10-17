import {providerModels,directInference,checkProviderConnection} from '../../lib/providers.mjs';
import {readPricingAction} from '../../lib/pricing-request.mjs';
import {connectionTransport,decryptConnectionKey} from '../../lib/desktop-connection.mjs';
import {encryptConnectionKey} from '../../lib/connection-crypto.mjs';
export default {async fetch(request){
 const q=new URL(request.url).searchParams,provider=q.get('provider'),action=q.get('action');
 try{
  if(action==='crypto-envelope'){
   const sessions=new Map(),env={DELEGATOR_VAULT_KEY:btoa('01234567890123456789012345678901'),DB:{prepare(sql){let values=[];return {bind(...v){values=v;return this},async run(){if(sql.startsWith('INSERT'))sessions.set(values[0],values);return{}},async first(){const row=sessions.get(values[0]);if(!row||row[1]!==values[1]||row[2]<=values[2])return null;sessions.delete(values[0]);return{id:values[0]}}}}}};
   const secret='runtime-envelope-test-only',t=await connectionTransport(env,'owner','deepseek');
   const cipher=await encryptConnectionKey('deepseek',secret,t),plain=await decryptConnectionKey(env,'owner',cipher);
   return Response.json({verified:plain===secret,plaintext_in_transport:JSON.stringify(cipher).includes(secret)});
  }
  if(action==='pricing-parse')return Response.json(await readPricingAction(request));
  if(action==='catalog')return Response.json({models:await providerModels(provider,'test-runtime-key')});
  if(action==='check')return Response.json(await checkProviderConnection(provider));
  if(action==='infer')return await directInference({provider,modelId:'test-model'},'test-runtime-key','test system','test task',{maxTokens:256,timeoutSec:15});
  return new Response(null,{status:400});
 }catch(e){return Response.json({name:e.name,message:e.message},{status:e.status||500});}
}};
