export const PROVIDERS={
 anthropic:{name:'Claude · Anthropic',base:'https://api.anthropic.com/v1',keys:'https://platform.claude.com/settings/keys',kind:'anthropic'},
 gemini:{name:'Gemini · Google',base:'https://generativelanguage.googleapis.com/v1beta/openai',keys:'https://aistudio.google.com/apikey',kind:'compatible',note:'使用 Google AI Studio 的 Gemini API Key；原生目录验证连接，兼容接口负责文字推理。访问从插件云端发出，本机代理不改变云端出口。'},
 deepseek:{name:'DeepSeek',base:'https://api.deepseek.com',keys:'https://platform.deepseek.com/api_keys',kind:'compatible'},
 qwen:{name:'Qwen · 阿里云百炼（北京）',base:'https://dashscope.aliyuncs.com/compatible-mode/v1',keys:'https://bailian.console.aliyun.com/',kind:'compatible',note:'使用北京地域百炼 API Key。按量 API 与 Coding Plan 密钥不可混用。'},
 glm:{name:'GLM · 智谱 BigModel',base:'https://open.bigmodel.cn/api/paas/v4',keys:'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',kind:'compatible',note:'只读接口验证 Key；官方价格表提供模型目录，模型权限以实际调用为准。'},
 kimi:{name:'Kimi · 月之暗面（中国）',base:'https://api.moonshot.cn/v1',keys:'https://platform.kimi.com/console/api-keys',kind:'compatible'},
 kimi_intl:{name:'Kimi · Moonshot（国际）',base:'https://api.moonshot.ai/v1',keys:'https://platform.kimi.ai/console/api-keys',kind:'compatible',note:'中国站与国际站的 Key、价格分别配置。'},
 xai:{name:'Grok · xAI',base:'https://api.x.ai/v1',keys:'https://console.x.ai',kind:'compatible'}
};
export const isDirectId=id=>typeof id==='string'&&id.includes(':')&&!!PROVIDERS[id.split(':')[0]];
