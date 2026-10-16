'use client';
import {priceRows} from '@/lib/price-display.mjs';
import {formatCny} from '@/lib/money.mjs';
export type Rate={label?:string;condition?:string;input:number|null;output:number|null;cacheHit?:number|null;promotion?:{label:string;input:number;output:number}};
export type OfficialPrice=Rate&{modelId:string;name?:string;currency:string;tariffs?:Rate[];tiers?:Rate[];schedule?:{timezone:string;rule:string};cacheWrite5m?:number;cacheWrite1h?:number;safeInputRate?:number;note:string;available:boolean;sourceUrl:string;fetchedAt:string;original?:{currency:string;input:number;output:number};fxDate?:string|null;pricingBasis?:string;context?:number};
export default function OfficialRates({price}:{price:OfficialPrice}){
 const rows=priceRows(price) as Rate[];
 return <div><p><b>人民币元 / 每百万 tokens（1M = 1,000,000）</b></p>{price.schedule&&<p>{price.schedule.rule}</p>}
 <div className="history-table"><table><thead><tr><th>时段 / 条件</th><th>输入未缓存</th><th>输入缓存命中</th><th>输出</th></tr></thead><tbody>{rows.map((t,i)=><tr key={i}><td>{t.label}<small style={{display:'block',maxWidth:320,whiteSpace:'normal'}}>{t.condition}</small></td><td>{formatCny(t.input)}</td><td>{t.cacheHit==null?'官网未单列':formatCny(t.cacheHit)}</td><td>{formatCny(t.output)}{t.promotion&&<small style={{display:'block'}}>限时优惠：输入 {formatCny(t.promotion.input)} / 输出 {formatCny(t.promotion.output)}；预算按原价</small>}</td></tr>)}</tbody></table></div>
 {(price.cacheWrite5m!=null||price.cacheWrite1h!=null)&&<p>缓存写入（元 / 百万 tokens）：5 分钟 {formatCny(price.cacheWrite5m)}；1 小时 {formatCny(price.cacheWrite1h)}。按官方规则另计。</p>}
 <p className="subtle-note">预算预留上界（元 / 百万 tokens）：输入 {formatCny(price.safeInputRate??price.input)}，输出 {formatCny(price.output)}。此处用于预算保护，不代表所有时段、输入长度或缓存条件的实际单价。</p>
 <p>{price.note}</p><p>{price.pricingBasis==='domestic_official_cny'?'直接抓取国内官网人民币原价，不经过汇率折算。':`官网原币按参考汇率折算；汇率日期 ${price.fxDate||'待同步'}。`}</p><a href={price.sourceUrl} target="_blank" rel="noreferrer">官方人民币价目 / 来源 ↗</a></div>
}
