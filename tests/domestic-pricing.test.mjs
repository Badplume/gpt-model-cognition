import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {parseDeepSeek,parseQwen,SOURCES} from '../lib/pricing-qwen-deepseek.mjs';
import {parseGlmPricing,parseKimiPricing} from '../lib/pricing-glm-kimi.mjs';
import {priceRows,priceRange} from '../lib/price-display.mjs';import {publicCatalog} from '../lib/delegator.mjs';import {validatePrices} from '../lib/pricing.mjs';
const read=name=>readFileSync('tests/fixtures/public-pricing/'+name,'utf8');
test('DeepSeek comes only from Chinese CNY source and preserves peak, idle, hit and miss prices',()=>{
 assert(SOURCES.deepseek.includes('/zh-cn/'));
 const p=validatePrices(parseDeepSeek(read('deepseek-current.html'))),flash=p.find(p=>p.modelId==='deepseek-flash'),pro=p.find(p=>p.modelId==='deepseek-v4-pro');
 assert.equal(flash.currency,'CNY');assert.deepEqual(flash.tariffs.map(t=>[t.input,t.cacheHit,t.output]),[[1,.02,4],[2,.04,8]]);assert.deepEqual(pro.tariffs.map(t=>[t.input,t.cacheHit,t.output]),[[4.5,.15,13.5],[9,.3,27]]);
 assert(flash.schedule.rule.includes('不含中国法定节假日'));assert(flash.schedule.rule.includes('9:00 - 12:00'));assert(flash.schedule.rule.includes('14:00 - 18:00'));
 assert.throws(()=>parseDeepSeek(read('deepseek-current.html').replace('2元','$0.3')));assert.throws(()=>parseDeepSeek(read('deepseek-current.html').replace('北京时间周一至周五','unknown schedule')));
 assert.equal(priceRange(flash,'input'),'¥1–¥2');
});
test('Qwen Beijing tiers, thinking modes and temporary discounts are not replaced by maxima',()=>{
 const p=validatePrices(parseQwen(read('qwen-beijing.html'))),plus=p.find(x=>x.modelId==='qwen-plus'),latest=p.find(x=>x.modelId==='qwen3.7-plus');
 assert(plus.tariffs.some(t=>t.condition==='0<Token≤128K'&&t.label==='非思考模式'&&t.input===.8&&t.output===2));assert(plus.tariffs.some(t=>t.condition==='0<Token≤128K'&&t.label==='思考模式'&&t.output===8));assert.equal(plus.output,64);
 assert(latest.tariffs.some(t=>t.input===2&&t.output===8&&t.promotion.input===1.6&&t.promotion.output===6.4));assert.equal(priceRange(plus,'output'),'¥2–¥64');assert(p.every(p=>p.currency==='CNY'));
});
test('GLM retained tiers and Kimi domestic cache prices use yuan per million tokens',()=>{
 const glm=validatePrices(parseGlmPricing(read('glm-official-cny.md'))).find(p=>p.modelId==='glm-5.1');assert.deepEqual(glm.tiers.map(t=>[t.input,t.output,t.cacheHit]),[[6,24,1.3],[8,28,2]]);assert(!priceRows(glm).some(t=>t.condition.includes('\\[')));
 const kimi=validatePrices(parseKimiPricing(read('kimi-official-cny.md'))).find(p=>p.modelId==='kimi-k3');assert.equal(kimi.currency,'CNY');assert.equal(priceRows(kimi)[0].input,20);assert.equal(kimi.cacheHit,2);assert.equal(kimi.cacheWrite5m,20);assert.equal(kimi.cacheWrite1h,40);assert.equal(kimi.safeInputRate,60);
});
test('model-facing catalogue exposes million-token rates, not ambiguous per-token numbers',()=>{const [m]=publicCatalog([{id:'test',prompt:2/1e6,completion:8/1e6,request:0,reasoning:0}]);assert.equal(m.input_per_million,2);assert.equal(m.output_per_million,8);assert.equal(m.pricing_unit,'CNY per 1M tokens');assert(!('prompt' in m));assert(!('completion' in m));});
