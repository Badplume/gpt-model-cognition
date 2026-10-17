# 部署自己的 gpt-model-cognition

这是依赖 Sites 身份网关、Cloudflare Workers 与 D1 的源码项目。
开源仓库不包含任何可直接共用的模型账户、服务端密钥或数据库。

1. 使用自己的 Sites 项目，取得它实际返回的项目 ID，保留该项目生成的
   `.openai/hosting.json`；若从源码建立项目，可参考根目录 `hosting.example.json`。
   不要复制维护者的项目身份或绕过身份网关。
2. 使用 Node.js 22.13+、pnpm 11.25.0，运行 `pnpm install --frozen-lockfile`。
   在自己的 D1 数据库按名称顺序应用 `drizzle/*.sql` 中的迁移。
3. 用可信随机源生成 32 字节的 Base64 密钥，在服务端设置秘密
   `DELEGATOR_VAULT_KEY`。不写入源码、构建参数或浏览器配置。不要覆盖已有保险库密钥。
4. 替换源码和技能中维护者的 `https://model-delegator-pleia.tangyvole32.chatgpt.site`
   为自己实际部署的地址。`plugin/` 是维护者账号插件的版本备份，包含非秘密的 App
   绑定；其他人需要在自己的账号创建对应 App/插件并使用真实返回的绑定，不能把该备份
   当成公共即装即用服务。
5. 运行 README 中的检查和构建，通过 Sites 的受支持源代码发布流程部署，并保持私有
   受众。MCP 服务入口为 `/mcp`；API Key 在登录后的连接页由用户自己填写。
6. `POST /api/pricing` 空请求体执行遵循插件设置的自动检查，手动更新发送
   `{"action":"refresh"}`。按需配置一个云端触发器在北京时间 09:00 调用，保留 Sites
   要求的服务认证；不要把维护者的自动化或服务令牌复制到自己的仓库。

普通 Cloudflare 托管需要另外实现可信身份网关、访问控制及 MCP OAuth，当前仓库
没有声称提供通用的免配置自托管身份服务。先阅读 `SECURITY.md`。

## Gemini 连接排查

连接验证使用 `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000`
和 `x-goog-api-key` 头，密钥不进入 URL。推理使用 Google 官方 OpenAI 兼容接口。

- **3.2.2 及以前的匿名检查 404**：兼容目录未携带身份时返回 404，不能说明本机断网。
  3.3.0 改用原生目录，明确识别“缺少调用者身份”的预期 403。
- **无效 Key 或 API/项目拒绝**：使用 AI Studio 的 Gemini API Key，核对 Generative
  Language API、项目权限以及密钥限制。Gemini 聊天会员和 Vertex AI 凭据不能替代此 Key。
- **地区拒绝**：请求从插件云服务器发出，桌面代理不会改变云端出口。应在 Google
  官方支持的地区部署，检查账户资格；不要绕过官方地区或账号限制。
- **超时、DNS 或 TLS 故障**：检查发生故障的服务器到
  `generativelanguage.googleapis.com:443` 的 DNS、HTTPS 出站和证书链。保留 TLS 校验，
  不把密钥交给不受信任的中转站。
- **目录成功**：只证明目录权限；模型推理还受模型开放、配额、余额和地区规则约束。

官方参考：[模型目录](https://ai.google.dev/api/models)、
[API Key](https://ai.google.dev/gemini-api/docs/api-key)、
[支持地区](https://ai.google.dev/gemini-api/docs/available-regions)。
