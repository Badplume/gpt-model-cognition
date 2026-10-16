# 直连修复 3.1.2

2026-10-16 在项目使用的 workerd 运行环境复现：redirect: error 不受支持，会在请求发送前立即抛出 TypeError。此前所有直连平台的模型目录验证与付费推理都受影响，错误被隐藏为网络故障。

修复统一使用 manual 并显式拒绝 3xx。密钥只发送到固定官方接口，不跟随跳转，也不自动重试付费请求。连接页新增「检查服务连接」，检查不携带 Key、不发起推理；HTTP 401 是该检查的预期响应，不等于已验证用户的密钥。

已通过 40 项检查（其中 3 项直接使用项目的 workerd 运行环境）、类型检查和生产构建。线上已实际检测到 DeepSeek /models 返回 HTTP 401，证明插件服务器连通。用户已重新连接并明确确认成功；后台读回 DeepSeek configured=true，实际模型目录已显示 DeepSeek-V4.1-Flash 和 DeepSeek-V4-Pro。费用仍为 $0，未进行付费推理。

源码和服务器版本 3.1.2；技能包未变，无需重装插件。安全连接页：https://model-delegator-pleia.tangyvole32.chatgpt.site/?view=connection
