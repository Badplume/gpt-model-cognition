// Public vendor documentation only. Prices are USD per million tokens for the
// fixed direct API endpoints; they are conservative estimates, not invoices.
// Do not infer prices for unlisted API IDs or change these sources to aggregators.
const USD_NOTE = '官方标准付费文本费率；按未缓存输入和公布的最高上下文/时间阶梯估算，输出包含思考 token；不含媒体、工具、批处理及账户优惠。';
// These pinned IDs are explicitly documented in the vendor's per-model
// /docs/en/models/{opus,sonnet,haiku}-4-5/overview pages. Never strip an arbitrary
// user-supplied date suffix: a new snapshot can have different prices.
const CLAUDE_PINNED_IDS = Object.freeze({
  'claude-opus-4-5': 'claude-opus-4-5-20251101',
  'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
});

function sourceText(value) {
  if (typeof value !== 'string' || value.length < 50 || value.length > 3_000_000) throw new Error('官方定价文档为空或大小异常。');
  return value;
}

function text(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, dec) => { const n = parseInt(hex || dec, hex ? 16 : 10); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; })
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/[ \t\r]+/g, ' ').trim();
}

function prices(cell) {
  const values = [...text(cell).matchAll(/\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)(?![\d.]|,\d)/g)].map(m => Number(m[1].replace(/,/g, '')));
  if (!values.length || values.some(n => !Number.isFinite(n) || n <= 0 || n > 1000)) throw new Error('官方 token 单价缺失或异常。');
  return values;
}

function cells(row, tag = 'td') {
  return [...row.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map(m => m[1]);
}

function unique(rows) {
  if (!rows.length) throw new Error('官方文档中未找到可验证的文本模型定价。');
  const map = new Map();
  for (const row of rows) {
    const old = map.get(row.modelId);
    if (!old) map.set(row.modelId, row);
    else map.set(row.modelId, { ...old, input: Math.max(old.input, row.input), output: Math.max(old.output, row.output) });
  }
  return [...map.values()];
}

// Claude publishes a first-party Markdown representation linked from its HTML
// page. Its base-input column applies here: directInference does not request
// automatic/explicit prompt caching (no cache_control) or fast mode.
export function parseAnthropicPricing(document) {
  const source = sourceText(document);
  if (!/All prices are in USD\./i.test(source) || !/MTok:\*\* Million tokens|MTok.*Million tokens/i.test(source)) throw new Error('Claude 官方定价币种或计价单位发生变化。');
  const section = source.match(/## Model pricing\s+([\s\S]*?)(?=\n## |$)/)?.[1];
  if (!section) throw new Error('未找到 Claude 官方基础模型定价表。');
  const lines = section.split('\n').filter(l => /^\s*\|/.test(l));
  const header = lines.shift()?.split('|').slice(1, -1).map(s => s.trim());
  if (!header || header.length !== 6 || header[0] !== 'Model' || header[1] !== 'Base input tokens' || header[5] !== 'Output tokens' || !header[2].includes('cache writes')) throw new Error('Claude 官方定价表列定义发生变化。');
  const rows = [];
  for (const line of lines) {
    if (/^\s*\|\s*:?[-]{3}/.test(line)) continue;
    const cols = line.split('|').slice(1, -1).map(c => c.trim());
    if (cols.length !== 6) throw new Error('Claude 官方定价表行不完整。');
    if (/retired/i.test(cols[0])) continue;
    const name = cols[0].match(/^Claude (?:Fable|Mythos|Opus|Sonnet|Haiku) \d+(?:\.\d+)?\b/)?.[0];
    if (!name || !/\/ MTok/.test(cols[1]) || !/\/ MTok/.test(cols[5])) throw new Error('Claude 官方模型名或 token 单位无法验证。');
    const modelId = name.toLowerCase().replace(/ /g, '-').replace(/\./g, '-');
    const row = { modelId, name, currency: 'USD', input: Math.max(...prices(cols[1])), output: Math.max(...prices(cols[5])), note: USD_NOTE + ' Claude 未启用缓存写入及快速模式；同名模型跨阶梯取上界。' };
    rows.push(row);
    if (CLAUDE_PINNED_IDS[modelId]) rows.push({ ...row, modelId: CLAUDE_PINNED_IDS[modelId] });
  }
  return unique(rows);
}

// Only general text-output families are admitted. Audio, image generation,
// embedding, realtime and specialist models do not fit this plugin's billing.
const GEMINI_TEXT_ID = /^gemini-\d+(?:\.\d+)?-(?:pro|flash|flash-lite|argon)(?:-preview(?:-\d{2}-\d{2})?)?$/;

function geminiTextPrices(cell) {
  // Gemini lists audio separately on <br> lines. Keep text/shared text rates and
  // higher prompt-length/future-date tiers, but never charge an audio-only rate.
  const lines = text(cell).split('\n').map(s => s.trim()).filter(Boolean);
  const relevant = lines.filter(s => !/\((?:audio|images?|video)(?:\s*\/\s*(?:audio|images?|video))*\)/i.test(s) || /\(text\b/i.test(s));
  if (!relevant.length) throw new Error('Gemini 官方文本价格无法验证。');
  return Math.max(...prices(relevant.join('\n')));
}

export function parseGeminiPricing(document) {
  const source = sourceText(document);
  const rows = [];
  for (const section of source.split(/(?=<h2\b)/i)) {
    if (!/^<h2\b/i.test(section)) continue;
    const heading = section.match(/^<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    const modelId = section.match(/<code\b[^>]*>(gemini-[a-z0-9.-]+)<\/code>/i)?.[1];
    if (!modelId || !GEMINI_TEXT_ID.test(modelId)) continue;
    const beforeTable = section.slice(0, section.indexOf('<table'));
    // If Standard is ever removed, do not accidentally take a Batch/Flex table.
    const precedingH3 = [...beforeTable.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)].at(-1)?.[1];
    if (precedingH3 && text(precedingH3) !== 'Standard') throw new Error('Gemini 标准付费定价表缺失。');
    const table = section.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
    if (!table) throw new Error('Gemini 官方模型缺少定价表。');
    const headers = cells(table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i)?.[1] || '', 'th').map(text);
    if (headers.length !== 3 || headers[1] !== 'Free Tier' || headers[2] !== 'Paid Tier, per 1M tokens in USD') throw new Error('Gemini 官方付费币种或列定义发生变化。');
    let input, output;
    for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cols = cells(row[1]);
      if (!cols.length) continue;
      if (cols.length !== 3) throw new Error('Gemini 官方定价表行不完整。');
      const label = text(cols[0]);
      if (/^Input price(?:\s*\(text, image, video\))?$/.test(label)) input = geminiTextPrices(cols[2]);
      if (/^Output price(?:\s*\(including thinking tokens\))?$/.test(label)) output = geminiTextPrices(cols[2]);
    }
    if (input === undefined || output === undefined) throw new Error('Gemini 官方文本输入或输出单价缺失。');
    rows.push({ modelId, name: text(heading?.[1] || modelId), currency: 'USD', input, output, note: USD_NOTE + ' Gemini 已公布但尚未生效的更高标准费率也纳入预算上界，不按免费层预估。' });
  }
  return unique(rows);
}

export function parseXaiPricing(document) {
  const source = sourceText(document);
  if (!/All prices are in USD/.test(text(source))) throw new Error('xAI 官方定价币种发生变化。');
  const textSection = source.match(/<h3\b[^>]*>[\s\S]*?Text API[\s\S]*?<\/h3>([\s\S]*?)(?=<h3\b|$)/i)?.[1];
  if (!textSection || !/Prices per 1M tokens/.test(text(textSection))) throw new Error('未找到 xAI 官方文本 token 定价。');
  const table = textSection.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) throw new Error('xAI 官方文本定价表缺失。');
  const head = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i)?.[1] || '';
  const headers = cells(head, 'th').map(text);
  if (headers.join('|') !== 'Model|Context|Short context|Long context|Input|Cached|Output|Input|Cached|Output') throw new Error('xAI 官方定价表列定义发生变化。');
  const rows = [];
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cols = cells(row[1]);
    if (!cols.length) continue;
    if (cols.length !== 8) throw new Error('xAI 官方定价表行不完整。');
    const modelId = cols[0].match(/<a\b[^>]*href="\/developers\/models\/(grok-[a-z0-9.-]+)"[^>]*>\s*\1\s*<\/a>/i)?.[1];
    const contextMatch = text(cols[1]).match(/^(\d+(?:\.\d+)?)([kM])$/);
    if (!modelId || !contextMatch) throw new Error('xAI 官方模型 ID 或上下文窗口无法验证。');
    const shortInput = prices(cols[2]), shortOutput = prices(cols[4]);
    const longInput = text(cols[5]) === '-' ? [] : prices(cols[5]);
    const longOutput = text(cols[7]) === '-' ? [] : prices(cols[7]);
    const context = Number(contextMatch[1]) * (contextMatch[2] === 'M' ? 1_000_000 : 1000);
    rows.push({ modelId, name: modelId, currency: 'USD', input: Math.max(...shortInput, ...longInput), output: Math.max(...shortOutput, ...longOutput), context, note: USD_NOTE + ' xAI 全球直连端点；按长上下文费率上界估算，不含美国地区端点附加费。' });
  }
  return unique(rows);
}

export const GLOBAL_PRICING_SOURCES = Object.freeze([
  { id: 'anthropic', provider: 'anthropic', url: 'https://platform.claude.com/docs/en/about-claude/pricing.md', parse: parseAnthropicPricing },
  { id: 'gemini', provider: 'gemini', url: 'https://ai.google.dev/gemini-api/docs/pricing', parse: parseGeminiPricing },
  { id: 'xai', provider: 'xai', url: 'https://docs.x.ai/developers/pricing', parse: parseXaiPricing },
]);
