import {Fault,seal,unseal} from './delegator.mjs';
import {PROVIDERS,saveProvider} from './providers.mjs';
import {decryptEnvelope,exportPublicKey} from './connection-crypto.mjs';
export async function connectionTransport(env,user,provider){
 if(!PROVIDERS[provider])throw new Fault('不支持的模型平台。');
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const expires=Date.now()+5*60*1000,id=crypto.randomUUID();
 await env.DB.prepare('DELETE FROM connection_sessions WHERE expires_at<?').bind(Date.now()).run();
 await env.DB.prepare('INSERT INTO connection_sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(id,user,expires).run();
 const challenge=await seal(JSON.stringify({v:1,purpose:'provider-key',id,user,provider,expires,privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey)}),user,env);
 return {challenge,publicKey:await exportPublicKey(pair.publicKey),expires_at:new Date(expires).toISOString()};
}
export async function decryptConnectionKey(env,user,data){
 try{
  if(!data||Object.keys(data).some(k=>!['provider','challenge','publicKey','iv','ciphertext'].includes(k)))throw Error('Unexpected fields');
  if(typeof data.challenge!=='string'||data.challenge.length>4096||!PROVIDERS[data.provider])throw Error('Invalid challenge');
  const session=JSON.parse(await unseal(data.challenge,user,env));
  if(session.v!==1||session.purpose!=='provider-key'||session.user!==user||session.provider!==data.provider||!Number.isFinite(session.expires)||session.expires<=Date.now()||session.expires>Date.now()+5*60*1000)throw Error('Expired challenge');
  const value=await decryptEnvelope(data,session.privateKey);
  if(value.length<10||value.length>512||!/^[\x21-\x7e]+$/.test(value))throw Error('Invalid key');
  const consumed=await env.DB.prepare('DELETE FROM connection_sessions WHERE id=? AND user_id=? AND expires_at>? RETURNING id').bind(session.id,user,Date.now()).first();
  if(!consumed)throw Error('Consumed challenge');
  return value;
 }catch{throw new Fault('安全连接会话无效或已过期，请重新填写并连接。',400);}
}
export async function connectProvider(env,user,data,fetcher=fetch){
 const apiKey=await decryptConnectionKey(env,user,data);
 const result=await saveProvider(env,user,{provider:data.provider,apiKey},fetcher);
 if(JSON.stringify(result).includes(apiKey))throw new Fault('平台目录返回了异常内容，已阻止显示，请联系维护者。',502);
 return result;
}
