---
name: provider-setup
description: Use when the user wants to connect Claude, Gemini, DeepSeek or Grok with their own official API key, run without OpenRouter, configure direct model pricing, or understand account login versus API access.
---

# Direct official providers

Open open_console or the secure account page https://model-delegator-pleia.tangyvole32.chatgpt.site. API keys are entered only on that authenticated page. The server encrypts each provider's key separately and sends it only to that provider's fixed official endpoint.

Supported direct providers: Anthropic Claude, Google Gemini, DeepSeek and xAI Grok. OpenRouter is optional; a direct-only configuration does not call its directory or inference endpoints. No personal credential belongs in plugin packages, GitHub backups, chat or tool arguments.

Guide the human to create a provider API key, connect it, read the official model directory, choose an exact model ID and confirm its current USD-per-million-token input/output prices and a conservative context capacity. Then select approved models and save the main profile. Do not invent current model IDs or prices. A successful key check only proves API directory access, not paid inference compatibility.

Ordinary website sign-in or a consumer chat subscription does not automatically provide API access. This version uses official API keys; it does not scrape logged-in websites, reuse session cookies, or claim unsupported OAuth account login. A platform-specific OAuth adapter would require a documented grant and separate implementation.

The native desktop panel edits non-secret models, prices, budgets and preferences using the MCP App bridge. Credential changes and final approval use the secure authenticated webpage. State these boundaries accurately. Direct-provider data retention is governed by that provider; the optional OpenRouter ZDR switch does not apply to direct endpoints.
