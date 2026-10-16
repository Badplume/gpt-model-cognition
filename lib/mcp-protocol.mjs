// MCP 2026-07-28 requires cache hints for discovery, lists and resource reads.
// Keep the legacy envelope unchanged and never cache account tool results.
const CACHEABLE = new Set(['server/discover','tools/list','prompts/list','resources/list','resources/templates/list','resources/read']);
export function completeResult(method, protocol, result) {
  const modern = method === 'server/discover' || (protocol >= '2026-07-28' && method !== 'initialize');
  if (!modern) return result;
  return {
    ...result,
    resultType: 'complete',
    ...(CACHEABLE.has(method) ? {ttlMs: 0, cacheScope: 'private'} : {})
  };
}
