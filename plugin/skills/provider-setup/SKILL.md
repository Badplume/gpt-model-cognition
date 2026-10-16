---
name: provider-setup
description: Use when the user wants to connect Qwen, GLM, Kimi, Claude, Gemini, DeepSeek or Grok with their own official API key, run without OpenRouter, configure direct model pricing, or understand account login versus API access.
---

# Direct official providers

Prefer open_provider_setup for API Key setup. It shows a secure account link, where the human selects a platform and enters the Key. Native primitive settings do not contain password fields. Open open_console or the secure account page https://model-delegator-pleia.tangyvole32.chatgpt.site. API keys are entered only on that authenticated page. The server encrypts each provider's key separately and sends it only to that provider's fixed official endpoint.

Supported direct providers: Qwen via Alibaba Cloud Bailian Beijing, GLM via BigModel, Kimi China and international (separate keys), Anthropic Claude, Google Gemini, DeepSeek and xAI Grok. OpenRouter is optional; a direct-only configuration does not call its directory or inference endpoints. No personal credential belongs in plugin packages, GitHub backups, chat or tool arguments.

Guide the human to create a provider API key, connect it, read the official model directory, choose an exact model ID and a conservative context capacity. Prices are automatically synchronized from official primary sources; never ask the human to type prices. Use the console's official price and FX refresh action if missing. Unknown or expired prices block paid calls. Budgets are CNY; preserve native prices and the FX date in explanations. GLM validates a read-only files-list status and discards metadata, then lists models from official pricing; this does not prove model-specific permission. Qwen requires a Beijing API key. Then select approved models and save the main profile. Do not invent current model IDs or prices. A successful key check only proves API directory access, not paid inference compatibility.

Ordinary website sign-in or a consumer chat subscription does not automatically provide API access. This version uses official API keys; it does not scrape logged-in websites, reuse session cookies, or claim unsupported OAuth account login. A platform-specific OAuth adapter would require a documented grant and separate implementation.

The native desktop panel edits non-secret models, official pricing sync, CNY budgets and preferences using the MCP App bridge. Credential changes and final approval use the secure authenticated webpage. State these boundaries accurately. Direct-provider data retention is governed by that provider; the optional OpenRouter ZDR switch does not apply to direct endpoints.

The enabled setting is the master permission and can be saved before connecting a Key or choosing models. Read readiness to distinguish permission from being ready to infer. Never claim enabling it makes a paid call. Use apply_starter_limits only when the human explicitly asks for starter numeric limits; it preserves credentials, model choices, policy and master permission.

Alibaba Cloud student AI general savings plans are discounts against eligible pay-as-you-go API billing, not a replacement API credential. Keep undiscounted official price ceilings unless the specific account benefit and validity are verified. Do not route general proxy/background traffic through Coding Plan endpoints or assume student credits apply to every model/region.

