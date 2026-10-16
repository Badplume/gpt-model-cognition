// These parsers deliberately consume the vendors' public price tables, without
// credentials. A missing label, unit, or region cannot turn into a free price.
export const SOURCES = Object.freeze({
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing/',
  qwen: 'https://help.aliyun.com/zh/model-studio/model-pricing',
});

function text(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, value) => {
      const n = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
    })
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}

function body(source) {
  if (typeof source !== 'string' || source.length > 5_000_000) throw new Error('官方价格页面格式或大小异常');
  // Aliyun embeds another escaped copy in a script. Only use its rendered
  // article, never the script's incidental model examples or navigation.
  const article = source.search(/<div\s+lang=["']zh["']\s+class=["']icms-help-docs-content["']/i);
  return (article < 0 ? source : source.slice(article))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

// Expand row/column spans so that the headings remain attached to the same
// column even when a model spans several token tiers or thinking modes.
function tableGrid(table) {
  const grid = [];
  const kinds = [];
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length > 1000) throw new Error('官方价格表行数异常');
  rows.forEach((row, r) => {
    grid[r] ||= [];
    kinds[r] ||= [];
    let c = 0;
    for (const cell of row[1].matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      while (grid[r][c] !== undefined) c++;
      const span = name => {
        const match = cell[2].match(new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+)`, 'i'));
        const n = match ? Number(match[1]) : 1;
        if (n < 1 || n > 100) throw new Error('官方价格表跨度异常');
        return n;
      };
      const width = span('colspan');
      // HTML clips a rowspan at the end of its table. Several unrelated
      // Aliyun free-quota cells retain an oversized span after retired rows
      // are removed; never let that span leak into the next price table.
      const height = Math.min(span('rowspan'), rows.length - r);
      if (c + width > 100) throw new Error('官方价格表结构异常');
      const value = text(cell[3]);
      for (let y = r; y < r + height; y++) {
        grid[y] ||= [];
        kinds[y] ||= [];
        for (let x = c; x < c + width; x++) {
          if (grid[y][x] !== undefined) throw new Error('官方价格表单元格重叠');
          grid[y][x] = value;
          kinds[y][x] = cell[1].toLowerCase();
        }
      }
      c += width;
    }
  });
  return { grid, kinds };
}

function amount(cell, currency) {
  const values = currency === 'USD'
    ? [...cell.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map(m => Number(m[1]))
    : [...cell.matchAll(/(\d+(?:\.\d+)?)\s*元/g)].map(m => Number(m[1]));
  if (!values.length || values.some(n => !Number.isFinite(n) || n <= 0 || n > 10000)) {
    throw new Error('官方价格数值或币种不明确');
  }
  // Ignore discounts/free allowances and reserve using the most expensive
  // official uncached, real-time, peak/thinking option in this cell.
  return Math.max(...values);
}

function tokenCeiling(value) {
  const matches = [...value.matchAll(/[≤<=]\s*(\d+(?:\.\d+)?)\s*([KM])\b/gi)];
  if (!matches.length) return undefined;
  return Math.max(...matches.map(m => Number(m[1]) * (m[2].toUpperCase() === 'M' ? 1e6 : 1e3)));
}

export function parseDeepSeek(source) {
  const tables = [...body(source).matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
  const table = tables.find(m => /CACHE\s*MISS/i.test(text(m[0])) && /1M INPUT TOKENS/i.test(text(m[0])));
  if (!table) throw new Error('未找到 DeepSeek 官方每百万 Token 未缓存价格表');
  const { grid } = tableGrid(table[0]);
  const models = grid.find(row => row[0]?.replace(/\s+/g, '') === 'MODEL');
  if (!models) throw new Error('DeepSeek 官方价格表缺少模型列');
  const names = grid.find(row => row[0] === 'MODEL VERSION');
  const contexts = grid.find(row => row[0] === 'CONTEXT LENGTH');
  const input = grid.filter(row => row.some(cell => /1M INPUT TOKENS.*CACHE MISS/i.test(cell)) && row.some(cell => cell === 'PEAK'));
  const output = grid.filter(row => row.some(cell => /^1M OUTPUT TOKENS$/i.test(cell)) && row.some(cell => cell === 'PEAK'));
  if (input.length !== 1 || output.length !== 1) throw new Error('DeepSeek 忙时价格行不明确');
  const result = [];
  models.forEach((value, col) => {
    const modelId = value?.match(/^(deepseek-[a-z\d.-]+)\b/i)?.[1];
    if (!modelId) return;
    const contextText = contexts?.[col];
    const contextMatch = contextText?.match(/^(\d+(?:\.\d+)?)\s*([KM])$/i);
    result.push({
      modelId, name: names?.[col] || modelId, currency: 'USD',
      input: amount(input[0][col] || '', 'USD'), output: amount(output[0][col] || '', 'USD'),
      ...(contextMatch ? { context: Number(contextMatch[1]) * (contextMatch[2].toUpperCase() === 'M' ? 1e6 : 1e3) } : {}),
      note: '官方美元原价；按忙时、输入未命中缓存估算；实际账单可能因闲时或缓存降低。',
    });
  });
  if (!result.length || new Set(result.map(m => m.modelId)).size !== result.length) throw new Error('DeepSeek 官方模型列不明确');
  return result;
}

function textModel(id) {
  return /^qwen[\da-z.-]*$/i.test(id)
    && !/(?:^|-)(?:vl|omni|ocr|mt|audio|image|tts|asr|embedding|rerank|character|doc|deep-research)(?:-|$)/i.test(id);
}

export function parseQwen(source) {
  const html = body(source);
  const events = html.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>|<table\b[^>]*>[\s\S]*?<\/table>/gi);
  const result = new Map();
  const incomplete = new Set();
  let region = null;
  for (const event of events) {
    if (event[1]) {
      const heading = text(event[2]).replace(/\s+/g, '');
      const level = Number(event[1]);
      if (level <= 3) region = null;
      if (level === 4) {
        region = /^华北2[（(]北京[）)]$/.test(heading) ? 'beijing' : null;
      }
      continue;
    }
    if (region !== 'beijing') continue;
    const { grid, kinds } = tableGrid(event[0]);
    let firstData = kinds.findIndex(row => row.some(kind => kind === 'td'));
    if (firstData < 1) continue;
    const width = Math.max(...grid.slice(0, firstData).map(row => row.length));
    const headers = Array.from({ length: width }, (_, c) => grid.slice(0, firstData).map(row => row[c] || '').join(' '));
    const modelColumn = headers.findIndex(h => /模型.*ID/i.test(h));
    const inputColumns = headers.map((h, c) => /输入单价.*每百万/i.test(h) && !/缓存/.test(h) ? c : -1).filter(c => c >= 0);
    const outputColumns = headers.map((h, c) => /输出单价.*每百万/i.test(h) ? c : -1).filter(c => c >= 0);
    if (modelColumn < 0 || inputColumns.length !== 1 || !outputColumns.length) continue;
    // Multi-modal prices require a different usage ledger and cannot silently
    // be treated as text token prices in this text-only adapter.
    if (headers.some(h => /音频|图片|视频|多模态/.test(h))) continue;
    for (const row of grid.slice(firstData)) {
      const id = row[modelColumn]?.match(/^(qwen[\da-z.-]+)(?:\s|$)/i)?.[1];
      if (!id || !textModel(id)) continue;
      let input;
      let output;
      try {
        input = amount(row[inputColumns[0]] || '', 'CNY');
        output = Math.max(...outputColumns.map(c => amount(row[c] || '', 'CNY')));
      } catch {
        // Retired/free-only models, missing prices, or a changed billing unit
        // are omitted. Callers must require a matching complete price row.
        result.delete(id);
        incomplete.add(id);
        continue;
      }
      if (incomplete.has(id)) continue;
      const context = tokenCeiling(row.join(' '));
      const previous = result.get(id);
      result.set(id, {
        modelId: id, name: id, currency: 'CNY',
        input: Math.max(previous?.input || 0, input), output: Math.max(previous?.output || 0, output),
        ...((context || previous?.context) ? { context: Math.max(context || 0, previous?.context || 0) } : {}),
        note: '百炼北京地域人民币原价；按未缓存实时调用、最高输入阶梯和较高思考模式价格保守估算，不抵扣优惠或免费额度。',
      });
    }
  }
  if (!result.size) throw new Error('未找到百炼北京地域明确的每百万 Token 文本模型价格');
  return [...result.values()];
}
