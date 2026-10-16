import {formatCny} from './money.mjs';
export function priceRows(price){return (price.tariffs?.length?price.tariffs:price.tiers?.length?price.tiers:[price]).map(t=>({...t,label:t.label||'标准',condition:(t.condition||'官方标准文本调用').replace(/\\([\[\]<>])/g,'$1').replace(/<br\s*\/?>/gi,'；')}));}
export function priceRange(price,key){const values=priceRows(price).map(t=>t[key]).filter(v=>typeof v==='number'&&Number.isFinite(v));if(!values.length)return '待同步';const min=Math.min(...values),max=Math.max(...values);return min===max?formatCny(min):formatCny(min)+'–'+formatCny(max);}
