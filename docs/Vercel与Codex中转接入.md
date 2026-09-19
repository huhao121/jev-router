# Vercel Jev 与 Codex 中转接入

此分支在上游 jev-router 上增加 Vercel AI Gateway evaluation 接口与用户已有 Codex 自定义 provider 的兼容支持。原生 TypeSafe 路径保留。

## 配置与运行

需要 Node.js 22 或以上版本。

在用户目录的 `~/.jev-router.env` 保存以下字段，文件权限设为 `600`，不要提交该文件：

```dotenv
JEV_PROVIDER=vercel
AI_GATEWAY_API_KEY=替换为本机密钥
```

从可信项目目录执行：

```bash
node /你的下载目录/jev-router/bin/jev-codex.mjs
```

入口读取 `CODEX_HOME` 指定目录或默认 `~/.codex` 中的 `config.toml`。选中自定义 provider 时，读取其 `base_url` 与密钥（内联 token、指定环境变量，或 API-key 模式的 `auth.json`），由本机代理转发至该上游。密钥通过子进程环境传递，不出现在命令参数中。不改写原有 Codex 配置。不支持自定义 provider 的 OAuth token 转换或 profile 覆盖。

四个默认候选模型为 Luna、Terra、Sol、Astra；Astra 所在 long 档需显式设置 `JEV_ALLOW_FABLE=1`。账号能否使用模型取决于中转站。如果中转不返回有效模型目录，项目仍使用默认候选；这不代表默认候选均可用。不要把未验证的模型作为实测成功。

Vercel 路径使用 AI SDK 7 的 `evaluationModel('typesafe-ai/jev')`，不是普通 Chat Completions 接口。单次总时限 15 秒，不自动重试。Gateway 不暴露原生 TypeSafe confidence，因此适配层从概率分布计算 `1 - 归一化熵`，只供现有策略阈值使用；缺失或无效分布按 0 处理。界面称其为“distribution concentration”，它不是官方 confidence，也不是任务成功概率；原有 0.3 阈值在此路径上尚未校准。

已有项目在 Jev 失败时会继续使用原模型。这种回退不算路由成功；检查输出是否为 `jev-unavailable`。路由分类会把任务文本发送到 Vercel/TypeSafe。

## 验证

```bash
npm ci --ignore-scripts
npm test
```

新增测试覆盖 Gateway 适配、概率分布缺失、请求失败、自定义 provider 三种密钥来源、命令行不携带密钥、错误配置阻断。代理与模型改写测试使用本机模拟服务，不代表真实模型能力。

本次 Vercel 实际调用返回 HTTP 403：账户需要绑定有效信用卡才能启用免费额度。因此尚未完成真实 Jev 分类及端到端自动路由；绑定要求来自 Vercel 服务返回，并非本项目限制。

Codex 中转链路已单独实测：读取用户配置，经本机路由代理发送 Luna 的 Responses 请求，返回 HTTP 200、模型字段 `gpt-5.6-luna`，并正确回答 `2+2=4`。这只验证中转传输与模型响应，不代表 Jev 路由成功或复杂任务能力。

上游 `test/live-routing.mjs` 仍传旧 `available` 参数，而当前 `askJev` 需要 `models`，不能直接拿该脚本的输出评价模型。实际联调应通过 `jev-codex`，或给 `askJev` 传完整候选模型。

## 来源

- https://github.com/gargpratyush/jev-router
- https://github.com/mejiasd3v/pi-jev-router （参考其 Vercel evaluation 接入方式）
- https://vercel.com/docs/ai-gateway/modalities/evaluation
- https://ai-sdk.dev/docs/ai-sdk-core/evaluation
- https://developers.openai.com/codex/config-reference
