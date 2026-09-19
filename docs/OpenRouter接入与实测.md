# OpenRouter Jev 接入与实测

## 使用

已下载项目增加 OpenRouter 原生 Decisions 适配，不需要 TypeSafe 官方 Key 或 Vercel 账户。用户级 `~/.jev-router.env` 配置如下，权限应为 `600`，禁止提交真实密钥：

```dotenv
JEV_PROVIDER=openrouter
OPENROUTER_API_KEY=在本机填写
```

在要处理的项目目录中运行（替换路径为你的实际下载目录）：

```bash
node /你的下载目录/jev-router/bin/jev-codex.mjs
```

生成模型继续沿用 `~/.codex/config.toml` 中选中的中转 provider。分类仅发给 OpenRouter，模型执行请求发给原中转站。不需要再登录 OpenAI。

路由接口：`POST https://openrouter.ai/api/alpha/decisions`；模型名：`~typesafe/jev-latest`。本次响应模型为 `typesafe/jev-1.13-20260917`。该模型不在普通 `/api/v1/models` 列表中，不能以列表缺失断定不可用，也不使用聊天接口。请求有 20 秒总时限，无自动重试。严格验证 Choice、Score、置信度与概率分布；错误走现有保持原模型的回退，不伪装成分类成功。

## 真实调用结果

下列三条为分类测试，不执行描述中的大型任务。直接传入四个候选以观察差异：

| 任务 | Jev 选择 | 原生 confidence | 分类耗时 | API 报告费用（美元） |
|---|---|---:|---:|---:|
| README 拼写修改 | gpt-5.6-luna | 1.00 | 1575 ms | 0.000045318 |
| 部署后偶发退出登录，跨三个服务排查 | gpt-5.6-sol | 0.99 | 784 ms | 0.000045696 |
| 整个 monorepo 从 webpack 迁移 Vite | gpt-6-astra | 0.36 | 679 ms | 0.000045780 |

confidence 不等于任务成功概率。第三条明显不确定，不能作为选择准确的证明。真实 CLI 默认仍不开放 Astra 所在 long 档；如需参与路由，在启动时显式设置 `JEV_ALLOW_FABLE=1`。

CLI 端到端测试未指定执行模型：输入 `2+2`，输出包含 `[Jev] routed this turn to gpt-5.6-luna (jev, confidence 0.99).`，随后回答 `4`；退出码为 0，路由记录 reason 为 `jev`，分类费用为 $0.000041454。这证实 OpenRouter Jev → 本机路由代理 → 原 Codex 中转 → Luna 的链路，不是失败回退。

随后在临时隔离目录做了真实文件修改：要求将 README 中 `recieve` 改为 `receive`，Jev 自动选择 Luna（confidence 1.00），Codex 调用工具完成修改，退出码 0。逐字比对结果确认只改了指定单词，临时目录已清理。

首次 CLI 测试发现上游只识别 input 中的 `additional_tools`；本机 Codex 0.155.1 将工具放在顶层 `tools`，导致跳过 Jev。现已兼容两种格式，并保留工具续轮不重复分类的行为，新增回归测试。

API 返回非零 `usage.cost`，因此不能称为“免费 Jev”。以上仅分类费，不包含 Codex 执行费用，也不能用于证明总费用节省。

## 验证与来源

- `npm test`：71 项通过，包含 Decisions 请求、原生置信度保留、计费保留、HTTP 错误不泄露响应、畸形响应拒绝、新 Codex 请求格式。
- https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request
- https://github.com/BillionsBobby/JevRouter/blob/main/src/provider.ts （参考其原生 Decisions 接口接入方式，未复制实现）
- Vercel 接入的历史阻塞及原有中转适配见 `Vercel与Codex中转接入.md`；当前运行配置选择 OpenRouter。
