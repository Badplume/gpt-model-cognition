---
name: pricing-updates
description: Use when the human asks to update model prices, synchronize exchange rates, check official pricing, open pricing management, or manage Model Delegator automatic pricing updates in Chat, Work or Codex.
---

# Official pricing inside Model Delegator

Use the connected plugin tools; do not create a separate task or scrape prices in chat for normal maintenance.

- For "更新定价", "同步模型价格" or "更新汇率", call refresh_pricing. It fetches only allowlisted official public pages and ECB data, has no provider Key argument, performs no inference, and does not require model-budget preparation or paid-call approval.
- For prices and sync status, call pricing_status. Report original currency, dated FX, last success and source failures. Cached valid data and a newly successful fetch are different; inspect results/skipped/error before describing them.
- For the pricing UI, call open_pricing. It opens the plugin's dedicated MCP App view. If the host cannot display it, link https://model-delegator-pleia.tangyvole32.chatgpt.site/?view=pricing.
- Automatic update preferences are saved by the human in the plugin's pricing page or native settings. Never change automatic update settings or budgets solely to bypass stale pricing. The existing cloud trigger checks these saved preferences; do not create duplicate automations.
- Closing ChatGPT does not itself disable the linked cloud trigger. Turning off automatic updates stops automatic scraping; manual updates remain available. Five-minute cooldowns, failed-source cache retention and seven-day expiry still apply.
- Price refresh does not spend provider tokens, verify a Key, execute approved inference requests or prove a model works. Normal inference continues to require the standard immutable estimate/approval workflow.

