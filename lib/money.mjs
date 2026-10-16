// Display only. Accounting uses integer micro-CNY in the server ledger.
export function formatCny(value){return typeof value==='number'&&Number.isFinite(value)?'¥'+value.toLocaleString('zh-CN',{minimumFractionDigits:0,maximumFractionDigits:6}):'待同步';}
