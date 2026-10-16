// Scheduled HTTP clients may supply an empty readable stream rather than null.
// An empty body selects automatic maintenance; malformed nonempty JSON must fail.
export async function readPricingAction(req){
 if(Number(req.headers.get('content-length')||0)>150000)throw Error('请求过大。');
 const text=await req.text();if(new TextEncoder().encode(text).length>150000)throw Error('请求过大。');
 if(!text.trim())return {};
 let data;try{data=JSON.parse(text)}catch{throw Error('JSON 格式错误。')}
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['action','settings'].includes(k))||data.action&&!['refresh','settings'].includes(data.action))throw Error('定价更新操作无效。');
 return data;
}
