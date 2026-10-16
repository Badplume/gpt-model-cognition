'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/client-api';
type Pricing={refreshCadence:string;fx:{date:string;cnyPerUsd:number;stale:boolean;error?:string}|null;sources:{id:string;provider:string;url:string;models:number;fetchedAt:string|null;stale:boolean;error:string|null}[]};
export default function PricingPanel({changed}:{changed:()=>void}){
 const [data,setData]=useState<Pricing|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const load=async()=>setData(await api<Pricing>('/api/pricing'));
 useEffect(()=>{load().catch(e=>setMessage(e.message))},[]);
 return <section className="panel"><div className="panel-head"><div><h2>官方定价与汇率</h2><p>模型保留官网原币价格；所有预算与审批统一使用人民币。</p></div><button className="outline-button" disabled={busy} onClick={async()=>{setBusy(true);try{const r=await api<Pricing&{results:{ok:boolean}[]}>('/api/pricing',{method:'POST'});setData(r);changed();setMessage(r.results.every(x=>x.ok)?'价格与汇率已同步。5 分钟内重复点击会使用刚同步的结果。':'部分来源暂不可用，保留上次成功数据；请查看下方状态。')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>{busy?'正在同步…':'同步官方价格与汇率'}</button></div>
 <div className="price-card"><b>预算币种：人民币 CNY</b><p>{data?.fx?`1 USD ≈ ${data.fx.cnyPerUsd.toFixed(4)} CNY · ECB 参考汇率日期 ${data.fx.date}${data.fx.stale?' · 已过期，停止付费调用':''}`:'汇率尚未同步，付费调用会暂时阻止。'}</p><small>每日 09:00（北京时间）自动检查。官方参考汇率不是银行卡结算价；额外保留 10% 费用余量。价格或汇率超过 7 天停止使用，账户优惠不作为预算保障。</small></div>
 <div className="pricing-sources">{data?.sources.map(s=><div key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.provider} ↗</a><span>{s.models} 个模型 · {s.fetchedAt?new Date(s.fetchedAt).toLocaleString('zh-CN'):'未同步'}</span><small>{s.error||(s.stale?'待同步':'已更新')}</small></div>)}</div>{message&&<div className="notice" role="status">{message}</div>}
 </section>
}
