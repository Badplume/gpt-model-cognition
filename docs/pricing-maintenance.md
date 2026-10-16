# Official pricing updater 3.2

The owner-private Site exposes a service writer at `POST /api/pricing` and public-data readback at `GET /api/pricing`. Sites dispatch authenticates the owner or a valid Sites service-access token. No visitor identity is fabricated. These routes only read and write shared public price/FX cache data and never access provider keys, accounts, inference, or connected apps.

Scheduled runs acquire Site service access using the native Sites `get_site` operation and use its short-lived bearer only in `OAI-Sites-Authorization` to this Site's origin. Keep it in memory; never place it in prompts, URLs, logs, Git, or files. POST the writer, then GET readback. A successful source has a timestamp and nonzero model count; the FX entry has a dated ECB reference rate. Failures keep the last good data and expose a short sanitized status. Do not retry model inference or redeploy to refresh prices. Routine refreshes require no user session, Key, or account editing.

Daily cadence: 09:00 Asia/Shanghai. A five-minute cooldown prevents repeated manual scraping. Automatic normal reads refresh after 24 hours; failed sources may retry after five minutes. Prices and FX over seven days old stop paid execution. Weekends use the latest valid ECB working-day rates.

Pricing sources and parsers are fixed in `lib/pricing.mjs`, `pricing-qwen-deepseek.mjs`, `pricing-glm-kimi.mjs`, and `pricing-global.mjs`. New/changed source schemas must pass fixtures and live source checks before adding coverage. No downloaded JavaScript or MDX is executed. Public fetches have no credentials, reject redirects, and have size/time limits. Never replace missing prices with zero.

Native prices stay CNY or USD per million tokens. Budget, approval ceilings, new call charges and daily reserves use integer micro-CNY. Existing USD settings convert once at the current verified FX rate; the old USD ledger is retained. CNY models use their native rate directly; USD models convert with ECB cross rates. Conservative prices use the highest published tiers/peak rates and automatic cache-write bounds plus a 10% request reserve. Promotions, student benefits and account discounts are excluded from the hard ceiling. Actual invoices can be lower.

An approved request includes price and FX snapshots. If the new conservative ceiling rises, execution requires a fresh plan. An old USD request cannot execute against the CNY budget. No paid inference is needed to maintain or verify this writer.
