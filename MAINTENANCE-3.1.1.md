# 桌面白屏修复 3.1.1

桌面日志明确报告 PerRequestReadResourceResult 缺少 ttlMs 和 cacheScope，导致 MCP App HTML 在渲染前被拒绝。已为 MCP 2026-07-28 的发现、列表及资源响应补齐缓存字段，并保留旧协议及旧资源地址兼容。

2026-10-16 发布成功；32 项模拟检查、类型检查和生产构建通过。已在 Codex 桌面真实 MCP App 沙箱中验证 API 连接说明、偏好表单、账号状态和完整控制台正常显示。截图所示的原插件设置弹窗需关闭后重开；未自动操作该原生设置窗口。

API Key 在同一 ChatGPT 账号登录的安全账户页输入：https://model-delegator-pleia.tangyvole32.chatgpt.site/?view=connection

源码 hotfix 版本为 3.1.1；技能及本地插件包未变，仍为 3.1.0，无需重装。密钥和现有预算未修改，未运行付费推理。
