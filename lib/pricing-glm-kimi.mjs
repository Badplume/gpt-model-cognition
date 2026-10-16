// Public official sources only. Parsers never evaluate MDX or execute downloaded code.
const GLM_URL = 'https://docs.bigmodel.cn/cn/guide/start/pricing.md';
const KIMI_CN_URL = 'https://platform.kimi.com/docs/pricing/chat.md';
const KIMI_INTL_URL = 'https://platform.kimi.ai/docs/pricing/chat.md';

function documentText(text) {
  if (typeof text !== 'string' || text.length < 100 || text.length > 2_000_000) throw new Error('官方价格文档为空或大小异常');
  return text;
}

function priceNumber(value, { currency, allowFree = false } = {}) {
  const text = String(value).trim();
  if (allowFree && text === '免费') return 0;
  const prefix = currency === 'USD' ? '\\$' : currency === 'CNY' ? '[¥￥]' : '';
  const match = text.match(new RegExp(`^${prefix}(\\d+(?:\\.\\d+)?)$`));
  if (!match) throw new Error('官方价格单元格无法识别');
  const valueNumber = Number(match[1]);
  if (!Number.isFinite(valueNumber) || valueNumber < 0 || valueNumber > 10_000) throw new Error('官方价格数值超出允许范围');
  return valueNumber;
}

function tokens(value) {
  const normalized = String(value).replaceAll(',', '').trim();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*([KM])?(?:\s*tokens)?$/i);
  if (!match) return undefined;
  const count = Number(match[1]) * ({ k: 1000, m: 1_000_000 }[match[2]?.toLowerCase()] || 1);
  return Number.isInteger(count) && count >= 4096 && count <= 2_000_000 ? count : undefined;
}

// These tiered models' full windows are given by the official model overview, not
// the price tier labels. Unknown new tier-only models have no guessed context.
const GLM_TIER_CONTEXT = Object.freeze({
  'glm-5.1': 200_000,
  'glm-5-turbo': 200_000,
  'glm-5': 200_000,
  'glm-4.7': 200_000,
  'glm-4.5-air': 128_000,
});

export function parseGlmPricing(text) {
  text = documentText(text);
  if (!text.includes('元/百万 Tokens') || !text.includes('### 文本模型')) throw new Error('GLM 官方价格表结构已变更');
  // Deliberately exclude OCR, voice, embedding, generation and tool billing.
  const latest = text.match(/## 最新模型\s*([\s\S]*?)(?=\n## 模型推理)/)?.[1];
  const standard = text.match(/### 文本模型\s*([\s\S]*?)(?=\n### 视觉理解)/)?.[1];
  if (!latest || !standard) throw new Error('GLM 官方文本价格区块不存在');
  const grouped = new Map();
  for (const section of [latest, standard]) {
    if (!/输入单价（元\/百万 Tokens）/.test(section) || !/输出单价（元\/百万 Tokens）/.test(section)) throw new Error('GLM 官方价格单位已变更');
    const header = section.split('\n').map(line => line.trim().split('|').slice(1, -1).map(cell => cell.trim())).find(cells => cells[0] === '模型名称');
    if (!header || header.slice(0, 6).join('|') !== '模型名称|上下文|输入单价（元/百万 Tokens）|输出单价（元/百万 Tokens）|缓存存储（元/百万 Tokens/小时）|缓存命中（元/百万 Tokens）') throw new Error('GLM 官方价格列顺序已变更');
    for (const line of section.split('\n')) {
      const cells = line.trim().split('|').slice(1, -1).map(cell => cell.trim());
      if (!/^GLM-[A-Za-z0-9.-]+$/.test(cells[0] || '')) continue;
      if (cells.length < 6) throw new Error('GLM 官方价格行不完整');
      // Storage is time based. Do not silently ignore a newly introduced charge.
      if (!/^(限时免费|免费|0)$/.test(cells[4])) throw new Error('GLM 缓存存储已收费或价格无法识别，需更新计费适配');
      const modelId = cells[0].toLowerCase();
      const tier = {
        condition: cells[1],
        input: priceNumber(cells[2], { allowFree: true }),
        output: priceNumber(cells[3], { allowFree: true }),
        cacheHit: cells[5] === '不支持' ? null : priceNumber(cells[5], { allowFree: true }),
      };
      const row = grouped.get(modelId) || {
        modelId, name: cells[0], currency: 'CNY', input: 0, output: 0,
        context: tokens(cells[1]) ?? GLM_TIER_CONTEXT[modelId],
        tiers: [], sourceUrl: GLM_URL,
      };
      row.input = Math.max(row.input, tier.input);
      row.output = Math.max(row.output, tier.output);
      row.tiers.push(tier);
      grouped.set(modelId, row);
    }
  }
  const result = [...grouped.values()];
  if (result.length < 3) throw new Error('GLM 官方文本价格记录异常减少');
  return result.map(row => ({
    ...row,
    note: `${row.tiers.length > 1 ? '按输入/输出阶梯中最高单价保守估算；' : ''}未命中缓存原价；缓存存储目前限时免费；历史模型是否可用以平台为准`,
  }));
}

export function parseKimiPricing(text, { currency = 'CNY', sourceUrl = currency === 'USD' ? KIMI_INTL_URL : KIMI_CN_URL } = {}) {
  text = documentText(text);
  if (!['CNY', 'USD'].includes(currency)) throw new Error('Kimi 价格币种不支持');
  const tables = [...text.matchAll(/<DocTable\s+columns=\{\[([\s\S]*?)\]\}\s+rows=\{(\[[\s\S]*?\])\}\s*\/>/g)];
  if (tables.length < 2) throw new Error('Kimi 官方价格表结构已变更');
  const result = [];
  for (const table of tables) {
    const columns = [...table[1].matchAll(/title:\s*"([^"]+)"/g)].map(match => match[1]);
    const isWrite = columns.some(title => /缓存写入|Cache Write Price/.test(title));
    const expectedLength = isWrite ? 8 : 6;
    if (columns.length !== expectedLength) throw new Error('Kimi 官方价格列数已变更');
    const expectedTitles = currency === 'CNY'
      ? (isWrite ? ['模型', '计费单位', '缓存写入（TTL 5min）', '缓存写入（TTL 1h）', '输入价格（缓存命中）', '输入价格（缓存未命中）', '输出价格', '上下文窗口'] : ['模型', '计费单位', '输入价格（缓存命中）', '输入价格（缓存未命中）', '输出价格', '上下文窗口'])
      : (isWrite ? ['Model', 'Unit', 'Cache Write Price (TTL 5min)', 'Cache Write Price (TTL 1h)', 'Cached Input Price', 'Input Price', 'Output Price', 'Context Window'] : ['Model', 'Unit', 'Input Price (Cache Hit)', 'Input Price (Cache Miss)', 'Output Price', 'Context Window']);
    if (columns.join('|') !== expectedTitles.join('|')) throw new Error('Kimi 官方价格列顺序或币种页面已变更');
    // International MDX renders dollars as a tiny JSX literal; this exact form
    // is converted to JSON, while every other expression fails JSON.parse.
    const json = table[2].replace(/<>\{"\$"\}(\d+(?:\.\d+)?)<\/>/g, '"$$$1"').replace(/,\s*\]/g, ']');
    let rows;
    try { rows = JSON.parse(json); } catch { throw new Error('Kimi 官方 MDX 价格数据无法安全解析'); }
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('Kimi 官方价格表为空');
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== expectedLength || !row.every(cell => typeof cell === 'string')) throw new Error('Kimi 官方价格行格式已变更');
      if (!/^kimi-[a-z0-9.-]+$/.test(row[0]) || row[1] !== '1M tokens') throw new Error('Kimi 官方模型标识或计费单位无法识别');
      const offset = isWrite ? 2 : 0;
      const cacheHit = priceNumber(row[2 + offset], { currency });
      const input = priceNumber(row[3 + offset], { currency });
      const output = priceNumber(row[4 + offset], { currency });
      const context = tokens(row[5 + offset]);
      if (!context) throw new Error('Kimi 官方上下文长度无法识别');
      const price = { modelId: row[0], name: row[0], currency, input, output, context, cacheHit, sourceUrl };
      if (isWrite) {
        price.cacheWrite5m = priceNumber(row[2], { currency });
        price.cacheWrite1h = priceNumber(row[3], { currency });
        price.cacheWrite = { ttl5m: price.cacheWrite5m, ttl1h: price.cacheWrite1h };
        // A safe upper bound independent of the caching path or previous TTL.
        price.safeInputRate = input + Math.max(price.cacheWrite5m, price.cacheWrite1h);
        price.note = '官方输入原价另列；预算按未命中输入加最高 TTL 缓存写入费保守预留，未假定缓存优惠';
      } else {
        price.note = '未命中缓存原价；未假定缓存优惠';
      }
      result.push(price);
    }
  }
  if (new Set(result.map(row => row.modelId)).size !== result.length || result.length < 2) throw new Error('Kimi 官方价格记录重复或异常减少');
  return result;
}

export const GLM_KIMI_PRICING_SOURCES = Object.freeze([
  { id: 'glm-official-cny', provider: 'glm', currency: 'CNY', url: GLM_URL, parse: parseGlmPricing },
  { id: 'kimi-official-cny', provider: 'kimi', currency: 'CNY', url: KIMI_CN_URL, parse: text => parseKimiPricing(text, { currency: 'CNY' }) },
  { id: 'kimi-official-usd', provider: 'kimi_intl', currency: 'USD', url: KIMI_INTL_URL, parse: text => parseKimiPricing(text, { currency: 'USD' }) },
]);
