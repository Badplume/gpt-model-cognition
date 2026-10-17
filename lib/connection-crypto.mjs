// Shared browser/server envelope. No provider key travels as a tool argument.
const enc=new TextEncoder();
export const toBase64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
export async function exportPublicKey(key){const {kty,crv,x,y}=await crypto.subtle.exportKey('jwk',key);return {kty,crv,x,y,ext:true};}
const fromBase64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function sharedKey(privateKey,publicJwk,challenge){
 if(!publicJwk||publicJwk.kty!=='EC'||publicJwk.crv!=='P-256'||typeof publicJwk.x!=='string'||publicJwk.x.length!==43||typeof publicJwk.y!=='string'||publicJwk.y.length!==43||Object.hasOwn(publicJwk,'d'))throw Error('Invalid public key');
 const peer=await crypto.subtle.importKey('jwk',publicJwk,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const bits=await crypto.subtle.deriveBits({name:'ECDH',public:peer},privateKey,256);
 const material=await crypto.subtle.importKey('raw',bits,'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode(challenge),info:enc.encode('gpt-model-cognition/connection/v1')},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptConnectionKey(provider,apiKey,transport){
 if(typeof apiKey!=='string'||apiKey.trim().length<10||apiKey.length>512)throw Error('请填写所选平台的官方 API Key。');
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const key=await sharedKey(pair.privateKey,transport.publicKey,transport.challenge),iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(provider+'|'+transport.challenge)},key,enc.encode(apiKey.trim()));
 return {provider,challenge:transport.challenge,publicKey:await exportPublicKey(pair.publicKey),iv:toBase64(iv),ciphertext:toBase64(ciphertext)};
}
export async function decryptEnvelope(data,privateJwk){
 if(typeof data.iv!=='string'||data.iv.length!==16||typeof data.ciphertext!=='string'||data.ciphertext.length>1024)throw Error('Invalid envelope');
 const privateKey=await crypto.subtle.importKey('jwk',privateJwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
 const key=await sharedKey(privateKey,data.publicKey,data.challenge);
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(data.iv),additionalData:enc.encode(data.provider+'|'+data.challenge)},key,fromBase64(data.ciphertext)));
}
