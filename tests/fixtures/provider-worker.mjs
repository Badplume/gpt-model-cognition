import {providerModels,directInference,checkProviderConnection} from '../../lib/providers.mjs';
export default {async fetch(request){
 const q=new URL(request.url).searchParams,provider=q.get('provider'),action=q.get('action');
 try{
  if(action==='catalog')return Response.json({models:await providerModels(provider,'test-runtime-key')});
  if(action==='check')return Response.json(await checkProviderConnection(provider));
  if(action==='infer')return await directInference({provider,modelId:'test-model'},'test-runtime-key','test system','test task',{maxTokens:256,timeoutSec:15});
  return new Response(null,{status:400});
 }catch(e){return Response.json({name:e.name,message:e.message},{status:e.status||500});}
}};
