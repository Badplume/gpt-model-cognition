# Model Cognition Hub / Model Delegator 3.1

供 ChatGPT Chat、Work 和 Codex 使用的私人多模型认知插件。主助手负责判断、核查与最终回答，外部模型提供咨询、子任务和独立复核。

## 能力

- 官方 API Key 直连 Anthropic Claude、Google Gemini、DeepSeek、xAI Grok。OpenRouter 为可选渠道，直连配置无需该账户或其目录服务。
- 用户可以在聊天中主动要求调用，也可在控制台填写任务；GPT 按手动、谨慎、均衡、积极四种预设判断是否调用。
- 每次调用前估算输入、输出上限、总工作量、模型数量、等待上限和费用预留。默认达到 $0.03、8,000 粗估工作 tokens、2 个模型，或被标记为复杂任务时需要人工审批；也可设为每次审批。
- 服务器绑定不可变任务、材料、模型与费用上限。未批准的大任务不会调用。过期、设置变化或估算上涨需重新审批；重复或并发执行同一请求不会重复调用。
- 完整 MCP App 提供桌面全局侧栏入口 `open_console`；原生结构化设置提供快捷偏好项。主机需要刷新/扫描最新 MCP 元数据后才能发现新入口。
- 一个插件包含四个 skills：自主调度、手动调用、预算审批、直连设置。

## 初次设置

1. 安装并连接现有 Model Delegator 私人插件，打开控制台。
2. 在安全账户页选择官方平台并填写其 API Key，验证 Key 后读取官方模型目录。
3. 选择准确模型 ID，按官方价目表填写美元/百万 tokens 输入输出单价，以及不超过模型实际能力的上下文上限。
4. 在允许名单勾选模型，设置各用途首选模型、预算和审批阈值，开启并保存。
5. 在 Chat、Work 或 Codex 中说「用 Model Delegator 请我已配置的 Claude 检查这段推理」或「打开模型认知控制台」。

普通网页登录或聊天会员订阅不等于 API 授权。此版实现官方 API Key，不提供未获支持的账号 OAuth，也不抓取网页或复用登录 cookie。密钥连接与最终审批在安全网页完成；桌面内嵌面板可以直接编辑非敏感偏好、模型、价格、预算和调用计划。

## 预算与验证边界

默认每日 $1、每次工具调用 $0.15、每模型最多输出 2048 tokens、90 秒超时、16 KB 任务与材料、最多 2 模型复核。每日按 UTC（北京时间 08:00）重算。

粗估工作量不是模型真实计算量。直连成本使用用户配置的单价和返回 token 用量估算，不能当作官方账单；特殊推理计费或价格变化可能有差异。请同时设置平台端消费限额。每日/单次预留使用原子数据库操作；未知费用保持预留，不自动重试。

每项任务最多调用次数、语义复杂度、是否发送摘要和用户主动发起标记，由主助手遵循；服务器没有跨所有主机的可信任务身份，不能把这些偏好说成全局强制限制。主助手不能用 MCP 工具授予人工批准。

## 数据与秘密

每个平台的 API Key、审批任务及暂存结果使用 AES-GCM 加密，并绑定当前 Site 用户 ID。主密钥为服务端秘密 `DELEGATOR_VAULT_KEY`，不能放进源码或插件包，也不能直接轮换导致旧数据无法解密。

待审批计划 30 分钟有效，完成结果最多保留 24 小时；过期记录在后续请求/访问时清理，并非关闭页面后后台准时删除。日志仅包含模型、时间和费用状态。直连平台的数据政策由其官方条款决定；OpenRouter ZDR 开关只适用于该可选渠道。

GitHub 备份排除 API Key、环境文件、数据库、调用记录、临时运行目录和真实部署身份文件。`hosting.example.json` 只提供重新部署的结构示例。插件包保留账号内 App 绑定，以便保存同一插件版本。

## 开发与检查

需要 Node.js >=22.13 和 pnpm 11.25.0。

```sh
pnpm install --frozen-lockfile
node --test tests/delegator.test.mjs
pnpm exec tsc --noEmit
pnpm run build
```

`scripts/build-widget.mjs` 将同一个 React 控制台打包为自包含 MCP App HTML；`lib/client-api.ts` 在网页使用同源 API，在内嵌面板使用标准 MCP Apps 桥。服务端运行于 Sites / Cloudflare Workers，数据库迁移在 `drizzle/`。

自动检查使用 SQLite 内存数据库和模拟上游，不产生 API 费用。发布成功、插件工具可用、桌面实际渲染、真实供应商推理是不同验证阶段；未提供真实 Key 时不能宣称真实推理已实测。

生产设置页：https://model-delegator-pleia.tangyvole32.chatgpt.site

官方协议参考：[OpenAI Plugins](https://developers.openai.com/plugins/)、[Claude API](https://platform.claude.com/docs/en/api/overview)、[Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai)、[DeepSeek API](https://api-docs.deepseek.com/)、[xAI API](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions)。

## 桌面维护版 3.1

「允许外部模型调用」是调用许可总开关，可以在配置 API Key 前保存；未配置可用模型时服务器继续阻止推理，readiness 会说明缺少哪一步。开关不会更换主模型，也不会立即产生费用。

桌面插件设置新增「连接模型 / 填写 API Key」入口和「应用起步额度」。Key 在安全账户页填写，不进入聊天或工具参数。额度按钮仅修改数字限制，保留 Key、模型名单、调用方式和总开关。复杂任务仍需人工批准。

移除快捷设置对主机版本号的错误假设；新版 UI 使用新资源地址，并兼容旧地址。29 项自动检查通过；真实平台推理仍需用户提供 Key 后单独验证。

## 桌面白屏修复 3.1.1

桌面日志确认内嵌页面在读取资源时被协议校验拒绝：MCP 2026-07-28 的完整资源结果缺少 ttlMs 和 cacheScope。现在对该协议的发现、列表和资源结果统一返回 ttlMs: 0、cacheScope: private；旧协议响应保持原样，账户工具结果不缓存。新资源地址兼容旧地址，避免已安装入口失效。

连接官方平台失败时显示可理解的网络、平台拒绝或目录格式提示；不会保存验证失败的密钥，也不自动发起推理。
