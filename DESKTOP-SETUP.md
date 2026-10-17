# gpt-model-cognition desktop setup

Open the installed plugin's settings or workbench. Connection and model selection, policy, CNY budgets, approvals, official prices and history share a self-contained desktop panel. Official keys can be typed in the panel and encrypted before transmission. If the host lacks WebCrypto, use the authenticated secure-page fallback. Final paid-request approval still uses that secure page. Existing accounts and plugin connections remain valid; refresh the plugin UI or reopen its panel to load version 3.5.0.

# 桌面安装与当前验证状态

云端私人插件已保存为 3.0.0。私人插件不会出现在公共目录搜索结果中。

本机已建立个人来源「我的模型工具」（model-cognition-personal），并通过官方 Codex 插件安装命令确认 3.0.0 已安装、已启用。桌面端需要重新加载目录；若列表不更新，请退出后重新打开 ChatGPT。此安装记录不等同于已经验证桌面界面渲染成功。

## 从此备份重新安装

需要已安装并登录的 ChatGPT / Codex 桌面运行环境，以及可用的 Codex CLI。将本私有仓库克隆到本地后，在仓库目录运行：

```powershell
codex plugin marketplace add .
codex plugin add dev-6b5f62835bf48191a0e64586536934a8@model-cognition-hub
```

然后重新打开桌面端，在插件来源中选择「模型认知工具」。此仓库保留同一私人 App 绑定；其他账号不会因此获得原账号的应用访问权、密钥或数据。

## 使用入口

- 私人插件：https://chatgpt.com/plugins/plugin_asdk_app_sites_6b5f62835bf48191a0e64586536934a8
- 完整设置：https://model-delegator-pleia.tangyvole32.chatgpt.site
- 对话命令：「打开模型认知控制台」「请我已配置的 Claude 独立复核这段推理」。

先在安全账户页连接自己的官方 API Key，配置准确模型 ID 与官方单价，再选择允许模型、预算和审批阈值，开启保存。普通聊天平台的网页登录或会员订阅不能替代 API Key。

## 验证边界

26 项模拟测试、类型检查、生产构建与发布通过。云端插件包含四个 skills，当前主机已发现 12 个面向模型的工具。尚未提供真实平台 Key，因此没有执行真实付费推理。

网页的完整 MCP App 曾显示「应用不可用」。已修正 MCP 2026 完成标记兼容性，但修复后网页仍未成功显示完整内嵌视图；独立设置页与原生结构化设置可用。桌面实际控制台仍需人工确认，不能将安装成功或工具状态正常等同于界面正常。
