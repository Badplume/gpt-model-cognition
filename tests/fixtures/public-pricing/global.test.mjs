import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLOBAL_PRICING_SOURCES, parseAnthropicPricing, parseGeminiPricing, parseXaiPricing } from '../../../lib/pricing-global.mjs';

const fixture = async name => readFile(new URL(name, import.meta.url), 'utf8');

test('official global descriptors use fixed primary pages and no API keys', () => {
  assert.deepEqual(GLOBAL_PRICING_SOURCES.map(s => [s.provider, new URL(s.url).hostname]), [
    ['anthropic', 'platform.claude.com'], ['gemini', 'ai.google.dev'], ['xai', 'docs.x.ai'],
  ]);
  assert.ok(GLOBAL_PRICING_SOURCES.every(s => {const u=new URL(s.url);return !u.username&&!u.password&&u.search===(s.provider==='gemini'?'?hl=en':'')&&typeof s.parse==='function'}));
});

test('Claude base prices preserve USD and use highest Haiku prompt tier, not cache-hit discounts', async () => {
  const rows = parseAnthropicPricing(await fixture('global-anthropic.md'));
  assert.equal(rows.length, 19);
  const opus = rows.find(m => m.modelId === 'claude-opus-5-5');
  assert.deepEqual([opus.currency, opus.input, opus.output], ['USD', 4, 20]);
  const haiku = rows.find(m => m.modelId === 'claude-haiku-5-5');
  assert.deepEqual([haiku.input, haiku.output], [0.5, 2.5]);
  assert.equal(rows.some(m => m.modelId === 'claude-opus-4-1'), false, 'retired direct models excluded');
  assert.equal(rows.some(m => m.modelId === 'claude-opus-5-5-latest'), false, 'unlisted aliases are not invented');
  assert.equal(rows.find(m => m.modelId === 'claude-haiku-4-5-20251001')?.input, 1, 'documented dated snapshots mapped explicitly');
  assert.equal(rows.some(m => m.modelId === 'claude-haiku-4-5-20261001'), false, 'other date suffixes are never inferred');
});

test('Claude rejects changed currency, missing input, unknown units and malformed rows', async () => {
  const source = await fixture('global-anthropic.md');
  for (const invalid of [source.replace('All prices are in USD.', 'All prices are in EUR.'), source.replace('Base input tokens', 'Cached input tokens'), source.replace('$10 / MTok', '$10 / request'), source.replace('$10 / MTok', '$1,200 / MTok')]) {
    assert.throws(() => parseAnthropicPricing(invalid));
  }
});

test('Gemini prices use Standard paid text columns, never free tier, audio or image generation', async () => {
  const rows = parseGeminiPricing(await fixture('global-gemini.html'));
  assert.equal(rows.length, 10);
  const flash = rows.find(m => m.modelId === 'gemini-2.5-flash');
  assert.deepEqual([flash.currency, flash.input, flash.output], ['USD', 0.3, 2.5]);
  const pro = rows.find(m => m.modelId === 'gemini-3.1-pro-preview');
  assert.deepEqual([pro.input, pro.output], [4, 18], 'highest long-context tier');
  const future = rows.find(m => m.modelId === 'gemini-4-argon');
  assert.deepEqual([future.input, future.output], [4, 20], 'future standard rate included in conservative upper bound');
  assert.match(future.note, /尚未生效/);
  assert.equal(rows.some(m => /image|tts|live|transcribe|omni|embedding|robotics/.test(m.modelId)), false);
});

test('Gemini fails closed when Standard table, paid currency or output prices change', async () => {
  const source = await fixture('global-gemini.html');
  assert.throws(() => parseGeminiPricing(source.replace('>Standard</h3>', '>Batch</h3>')));
  assert.throws(() => parseGeminiPricing(source.replace('Paid Tier, per 1M tokens in USD', 'Paid Tier, per 1M tokens in EUR')));
  assert.throws(() => parseGeminiPricing(source.replace('$20.00 starting December 1, 2026.', '$0.00 starting December 1, 2026.')));
});

test('xAI text parser uses long-context uncached prices and exact official IDs', async () => {
  const rows = parseXaiPricing(await fixture('global-xai.html'));
  assert.equal(rows.length, 8);
  const grok = rows.find(m => m.modelId === 'grok-4.7');
  assert.deepEqual([grok.currency, grok.input, grok.output, grok.context], ['USD', 4, 12, 500000]);
  const small = rows.find(m => m.modelId === 'grok-build-0.1');
  assert.equal(small.context, 256000);
  assert.equal(rows.some(m => /imagine|voice|latest/.test(m.modelId)), false);
});

test('xAI rejects currency/schema changes and incomplete price rows', async () => {
  const source = await fixture('global-xai.html');
  assert.throws(() => parseXaiPricing(source.replace('All prices are in USD', 'All prices are in EUR')));
  assert.throws(() => parseXaiPricing(source.replace('>Long context</th>', '>Priority</th>')));
  assert.throws(() => parseXaiPricing(source.replace('$12.00', 'Contact sales')));
});

test('empty and oversized documents are never interpreted as free models', () => {
  for (const parse of [parseAnthropicPricing, parseGeminiPricing, parseXaiPricing]) {
    assert.throws(() => parse(''));
    assert.throws(() => parse('x'.repeat(3_000_001)));
  }
});
