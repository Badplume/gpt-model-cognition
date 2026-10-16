// Owner-private, non-secret plugin preferences. Shared by the UI and updater;
// no signed-in visitor is fabricated for an unattended Site service request.
export const PRICING_DEFAULTS=Object.freeze({autoUpdate:true,refreshHours:24});
export const PRICING_FIELDS=Object.freeze({
 pricingAutoUpdate:{type:'boolean',title:'自动更新官方定价与汇率',description:'关闭后停止自动抓取；仍可手动更新。关闭不改变预算或模型调用权限。'},
 pricingRefreshHours:{type:'integer',title:'定价更新频率',enum:[24,72],description:'24 为每天，72 为每 3 天。云端每天北京时间 09:00 检查是否到期；使用插件时也检查。'}
});
export async function readPricingPolicy(env){const row=await env.DB.prepare('SELECT auto_update,refresh_hours FROM pricing_policy WHERE id=1').bind().first();return row?{autoUpdate:!!row.auto_update,refreshHours:row.refresh_hours}:PRICING_DEFAULTS;}
export async function savePricingPolicy(env,patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(k=>!['autoUpdate','refreshHours'].includes(k)))throw Error('定价更新设置无效');
 const next={...await readPricingPolicy(env),...patch};if(typeof next.autoUpdate!=='boolean'||![24,72].includes(next.refreshHours))throw Error('定价更新设置无效');
 await env.DB.prepare('INSERT INTO pricing_policy(id,auto_update,refresh_hours) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET auto_update=excluded.auto_update,refresh_hours=excluded.refresh_hours').bind(next.autoUpdate?1:0,next.refreshHours).run();return next;
}
// Align to 09:00 Asia/Shanghai, so a few seconds of scheduler jitter cannot
// accidentally postpone a daily update by a whole day.
export function nextPricingCheck(lastAt,refreshHours=24){const at=Date.parse(lastAt);if(!Number.isFinite(at))return null;return new Date((Math.floor((at-3600000)/86400000)+refreshHours/24)*86400000+3600000).toISOString();}
