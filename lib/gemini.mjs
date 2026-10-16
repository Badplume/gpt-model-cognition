// Only classify known Google errors. Never return upstream messages or key values.
export const GEMINI_MODELS='https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000';
export async function googleError(response){
 const reader=response.body?.getReader();if(!reader)return {};
 let size=0,text='';const decoder=new TextDecoder();
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return {}}text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode())?.error||{};}catch{return {}}
}
export function geminiIssue(error,status,{anonymous=false}={}){
 const message=typeof error?.message==='string'?error.message:'';
 const reasons=(Array.isArray(error?.details)?error.details:[]).map(d=>d?.reason);
 if(anonymous&&status===403&&/unregistered callers|without established identity/i.test(message))return {reason:'authentication_required',ok:true,message:'Google 官方服务连接正常（未携带密钥，返回预期的身份验证提示）。可填写 AI Studio API Key 继续验证；本检查未验证账户权限或推理可用性。'};
 if(/location is not supported|not available in your (country|region)|unsupported (country|region)/i.test(message))return {reason:'region_restricted',message:'Google 拒绝插件服务器所在地区访问。调用从云端服务器发出，桌面端代理不会改变其出口；请在 Google 支持的地区部署服务，并核对 AI Studio 账户资格。'};
 if(reasons.some(r=>['API_KEY_INVALID','API_KEY_EXPIRED'].includes(r))||/API key not valid|API key expired/i.test(message))return {reason:'invalid_key',message:'Gemini API Key 无效或已过期，请在 Google AI Studio 创建或更换密钥。'};
 if(/reported as leaked|key.*leaked/i.test(message))return {reason:'key_disabled',message:'Google 已停用泄露的 API Key，请在 AI Studio 更换密钥。'};
 if(reasons.some(r=>['API_KEY_SERVICE_BLOCKED','API_KEY_HTTP_REFERRER_BLOCKED','API_KEY_IP_ADDRESS_BLOCKED','SERVICE_DISABLED','BILLING_DISABLED'].includes(r)))return {reason:'account_restricted',message:'Google 项目、API 或密钥限制拒绝访问。请检查 Generative Language API 是否启用、密钥是否允许此 API，以及服务器 IP 限制；浏览器来源限制不适用于云端服务。'};
 if(status===404)return {reason:'endpoint_not_found',message:'Google 返回接口或资源不存在（HTTP 404）。请更新插件并重新读取模型目录；这不是超时，也不能据此判定为本机网络故障。'};
 if(status===400||status===401||status===403)return {reason:'access_denied',message:'Google 未接受此 API Key 或项目权限（HTTP '+status+'）。请使用 AI Studio 的 Gemini API Key，检查 API 限制、账户与地区资格；Gemini 会员和 Vertex AI 凭据不能直接替代此密钥。'};
 return null;
}
