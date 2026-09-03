# 企业微信、飞书与钉钉 AI 机器人对接指南

本文说明 API Starter Kit 当前对企微机器人、飞书自建应用机器人和钉钉企业内部应用 Stream 机器人的接入方式、运行时配置、用户绑定、受控操作、消息格式、开发启动和故障排查。四个入口（含管理台默认 AI 助手）的业务能力对比见 [AI 助手能力：入口能力横向对比](../ai-assistant-capabilities.md#入口能力横向对比)。

## 1. 设计目标

两种外部渠道使用同一套 AI 助手安全边界：

```text
企业微信 / 飞书 / 钉钉
        ↓
渠道适配器（WebSocket、消息格式、卡片格式）
        ↓
AiChannelBridge
        ↓
现有 AI 助手、知识库、查询工具、受控操作和权限系统
```

渠道适配器只负责连接和协议转换，不复制 AI 编排、权限判断或业务执行逻辑。私聊用户首次发消息时，系统为该渠道身份生成一次性绑定码；绑定后，私聊消息使用系统用户的角色、权限、知识库范围和 AI 确认机制。群聊采用独立的访客模式，只回答公开知识库内容，不开放系统查询、管理操作或确认卡片。

## 2. 官方文档

### 企业微信

- [企业微信智能机器人 API：WebSocket 长连接](https://open.work.weixin.qq.com/help2/pc/21704)
- [企业微信官方 Node.js SDK：`@wecom/aibot-node-sdk`](https://github.com/WecomTeam/aibot-node-sdk)

官方 SDK README 说明了智能机器人 WebSocket 的认证、心跳、断线重连、流式回复、模板卡片和事件回调能力。企业微信普通 Webhook 机器人仍适合通知推送；本项目的双向 AI 对话使用智能机器人 API 的 WebSocket 长连接。

### 飞书

- [飞书服务端 SDK：Node.js SDK 与长连接](https://open.feishu.cn/document/server-docs/server-side-sdk)
- [飞书发送消息 API](https://open.feishu.cn/document/server-docs/im-v1/message/create)
- [飞书更新应用发送的消息卡片](https://open.feishu.cn/document/server-docs/im-v1/message-card/patch)
- [飞书消息卡片概述](https://open.feishu.cn/document/common-capabilities/message-card/overview)
- [飞书官方 Node.js SDK：`@larksuiteoapi/node-sdk`](https://github.com/larksuite/node-sdk)

飞书官方 SDK 的 WebSocket 长连接用于接收事件；回复通过发送消息 API 完成。需要逐步展示内容时，应先发送卡片，再调用更新消息卡片 API 刷新内容。飞书卡片支持的 Markdown 语法不是完整 CommonMark，复杂 Markdown 需要降级或转换。

### 钉钉

- [钉钉 Stream 模式概述](https://opensource.dingtalk.com/developerpedia/docs/learn/stream/overview)
- [钉钉 Stream 开发教程](https://opensource.dingtalk.com/developerpedia/docs/explore/tutorials/stream/overview)
- [钉钉官方 Node.js Stream SDK](https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs)
- [钉钉互动卡片示例](https://github.com/open-dingtalk/dingtalk-card-examples)
- [创建并投放互动卡片](https://open.dingtalk.com/document/orgapp/create-and-deliver-cards)
- [互动卡片更新接口](https://open.dingtalk.com/document/orgapp/interactive-card-update-interface)
- [互动卡片事件回调](https://open.dingtalk.com/document/orgapp/event-callback-card)

钉钉机器人使用官方 Stream WebSocket 接收机器人消息和卡片回调，普通文本/Markdown 回复使用消息中的会话 Webhook。受控操作使用钉钉互动卡片模板投放，模板回调再转换为系统统一的确认事件。一个 Client ID 只运行一个 Stream worker；卡片模板投放必须使用 `STREAM` 回调类型。

## 3. 运行时配置

机器人凭据统一在系统管理的「IM 配置」页面维护。敏感字段由后端加密保存，保存后重启对应 Bot worker 才会重新加载运行时配置；模型、ASR 和 Embedding 配置仍在「LLM 配置」页面维护。

### 企业微信字段

| 字段          | 说明                                                               |
| ------------- | ------------------------------------------------------------------ |
| Bot ID        | 企微机器人后台获取的机器人 ID                                      |
| Bot Secret    | 企微机器人后台获取的 Secret，后端加密保存                          |
| Tenant ID     | 企业/租户标识；按企业微信机器人配置填写                            |
| WebSocket URL | 长连接地址；通常使用官方默认地址，私有部署按企业后台提供的地址填写 |

### 飞书字段

| 字段       | 说明                                                    |
| ---------- | ------------------------------------------------------- |
| App ID     | 飞书企业自建应用的 App ID                               |
| App Secret | 飞书企业自建应用的 App Secret，后端加密保存             |
| Domain     | 国内飞书通常留空；国际版或 Lark 环境按官方 SDK 要求填写 |

### 钉钉字段

| 字段                      | 说明                                                        |
| ------------------------- | ----------------------------------------------------------- |
| Client ID / AppKey        | 钉钉企业内部应用的 Client ID 或 AppKey                      |
| Client Secret / AppSecret | 钉钉企业内部应用的 Client Secret 或 AppSecret，后端加密保存 |
| 受控操作互动卡片模板 ID   | 已发布到同一应用的互动卡片模板 ID；受控操作确认卡必填       |
| 流式回复互动卡片模板 ID   | 已发布到同一应用的互动卡片模板 ID；普通问答流式输出必填     |

完成数据库初始化后，可检查迁移状态：

```bash
pnpm --dir apps/backend exec node ace migration:status
```

## 4. 企业微信配置

1. 在企业微信管理后台创建或打开智能机器人。
2. 进入智能机器人 API 配置，取得 Bot ID、Secret、Tenant ID 和 WebSocket 地址。
3. 在本系统「系统管理 → IM 配置 → 企微机器人」保存配置。
4. 启动企业微信 Bot worker。
5. 向机器人发送消息，首次回复会包含一次性绑定码。
6. 登录本系统，在「个人设置 → AI 渠道绑定 → 企微机器人」点击绑定，使用 Input OTP 组件输入 8 位绑定码。

企业微信绑定码具有以下安全属性：

- 8 位字母或数字；
- 有效期 10 分钟；
- 明文只在机器人回复中出现，不写入数据库；
- 数据库只保存哈希；
- 重新发送未绑定消息时会轮换绑定码，旧码立即失效；
- 绑定成功后可在个人设置中使用密码确认解绑。

## 5. 飞书配置

1. 在[飞书开放平台](https://open.feishu.cn/)创建企业自建应用。
2. 启用机器人能力。
3. 创建应用版本，并将测试用户加入可用范围。
4. 在「事件与回调」中选择「使用长连接接收事件」。
5. 添加事件 `接收消息 v2.0`，事件标识为 `im.message.receive_v1`。
6. 如需直接私聊机器人，开通权限「读取用户发给机器人的单聊消息」（`im:message.p2p_msg`）。
7. 如需群聊触发，开通群聊中 @ 机器人的消息权限，并在群里使用 `@机器人` 测试。
8. 在「权限管理」中开通以应用身份发送消息所需的消息权限。
9. 发布应用版本；仅保存开发者后台配置但未发布时，权限和可见范围可能不会生效。
10. 在本系统「系统管理 → IM 配置 → 飞书机器人」配置 App ID、App Secret 和 Domain。
11. 启动飞书 Bot worker。
12. 私聊机器人获取一次性绑定码，并在本系统个人设置中绑定。

### 飞书单聊权限排查

如果日志中没有 `Feishu message event received`，优先检查：

- 是否开通 `im:message.p2p_msg`；
- 应用版本是否已经发布；
- 当前飞书账号是否在应用可用范围；
- 事件订阅是否为长连接模式；
- 是否启动了 `bot:feishu` 进程；
- 是否保存了正确的 App ID 和 App Secret。

如果群聊能收到消息、私聊收不到消息，通常是只开通了群聊 @ 机器人权限而未开通单聊权限。

## 6. 钉钉配置

1. 在[钉钉开放平台](https://open.dingtalk.com/)创建企业内部应用并启用机器人能力。
2. 按 Stream 文档配置机器人消息接收；本项目使用长连接，不需要公网回调服务器。
3. 创建并发布受控操作互动卡片模板，模板需要接收 `description`、`confirmLabel`、`cancelLabel`、`confirmActionKey`、`cancelActionKey`、`taskId`、`conversationKey`、`externalUserId` 和 `externalTenantId` 参数，并通过卡片按钮回传 `actionKey`、`taskId`、`conversationKey`、`externalUserId` 和 `externalTenantId` 等私有参数。标准示例见 [`dingtalk-controlled-action-confirmation-template.example.json`](./dingtalk-controlled-action-confirmation-template.example.json)。
4. 如需普通问答流式输出，再创建并发布流式回复互动卡片模板。模板只需要接收 `content`，卡片标题使用模板中的固定文本，系统通过官方卡片更新接口更新 `content`。标准示例见 [`dingtalk-streaming-reply-template.example.json`](./dingtalk-streaming-reply-template.example.json)。
5. 在本系统「系统管理 → IM 配置 → 钉钉机器人」保存 Client ID、Client Secret，以及对应的受控操作和流式回复卡片模板 ID。
6. 仅启动一个 `bot:dingtalk` 进程，向机器人发送消息获取一次性绑定码，并在个人设置中绑定。

如果日志显示 Stream 已认证但收不到消息，检查机器人能力、应用发布状态、消息事件订阅和当前用户可见范围；如果普通消息正常但没有确认卡，检查卡片模板 ID、模板发布状态、卡片回调主题和按钮回传参数。

## 7. 开发启动与生产启动

三个 Bot 必须是独立进程，避免 WebSocket 连接、日志和故障相互影响。

### 本地开发

同时启动前端、后端、企业微信 Bot、飞书 Bot 和钉钉 Bot：

```bash
pnpm dev
```

单独启动某个 Bot：

```bash
turbo bot:wecom
turbo bot:feishu
turbo bot:dingtalk
```

对应的 backend 脚本和 Nodemon 配置为：

```text
apps/backend/package.json       bot:wecom / bot:feishu / bot:dingtalk
apps/backend/nodemon.wecom.json
apps/backend/nodemon.feishu.json
apps/backend/nodemon.dingtalk.json
apps/backend/commands/wecom_bot.ts
apps/backend/commands/feishu_bot.ts
apps/backend/commands/dingtalk_bot.ts
```

代码变更会由对应 Nodemon worker 重启。IM 配置保存后，仍需要重启对应 worker，因为 Bot 进程在启动时读取运行时配置并建立连接。开发模式下，如果数据库暂时未就绪、IM 配置不完整或 WebSocket 握手失败，worker 会记录原因并自动重试，不需要再次修改代码才能恢复。

### Docker Compose

Docker Compose 使用三个独立服务：

```text
wecom-bot
feishu-bot
dingtalk-bot
```

两个服务都依赖 backend 和数据库，但分别执行 `node ace wecom:bot` 与 `node ace feishu:bot`。检查服务状态：

```bash
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs -f wecom-bot
docker compose -f docker/docker-compose.yml logs -f feishu-bot
docker compose -f docker/docker-compose.yml logs -f dingtalk-bot
```

## 7. 统一绑定与权限模型

绑定记录由渠道、租户和外部用户身份共同确定：

```text
channel + externalTenantId + externalUserId → system user
```

企业微信和飞书可以分别绑定到同一个系统用户。绑定后：

- 外部渠道不会自行决定系统角色；
- 所有查询仍经过已注册查询模板、权限校验、作用域限制和字段脱敏；
- 所有管理变更仍先生成持久化提议；
- 只有确认后才执行受控操作；
- 确认前会重新校验会话归属、权限、提议状态、有效期和目标当前状态；
- 执行结果会再次查询或返回业务状态，避免只回复“OK”；
- 解绑需要当前系统密码确认。

### 群聊访客模式

群聊不要求绑定系统账号。群聊消息使用以下逻辑会话范围：

```text
channel + externalTenantId + externalConversationKey + externalUserId
```

同一群中的不同外部用户拥有隔离的多轮上下文；用户发送 `/new` 只会重置自己的访客会话。群聊访客仅注册 `search_knowledge` 工具，并且只检索未绑定角色限制的公开知识库文档。实时系统查询、个人或敏感数据查询、所有写操作和确认卡片都必须转到私聊，并先完成身份绑定。

三个机器人均支持精确发送 `/new` 新建会话。系统会保留旧会话历史，但将当前渠道映射切换到新的 AI 会话，后续消息不会继续携带旧会话上下文；旧确认卡也不会在新会话中执行。

不要把 Bot Secret、API Key、绑定码明文或外部平台令牌写入 AI 消息、普通日志、浏览器状态或普通查询结果。

## 8. 消息、Markdown、卡片与流式输出

### 企业微信

企业微信 SDK 原生支持 WebSocket 流式回复和模板卡片。当前适配器将 AI 生成过程映射到企业微信流式回复，并在受控操作场景发送确认卡片；用户点击确认或取消后，再执行统一的确认解析流程。

### 飞书

飞书普通 `text` 消息不会自动渲染 Markdown。当前适配器行为为：

- 纯文本回复使用 `text` 消息；
- 检测到标题、列表、代码块、加粗或链接等 Markdown 时，发送含 `markdown` 元素的 Interactive Card；
- 受控操作发送带确认/取消按钮的 Interactive Card；
- 需要流式体验时，应创建一张卡片并通过更新消息卡片 API 增量刷新内容。

飞书卡片更新不是普通 WebSocket 文本流，而是“卡片消息 + 更新接口”的模拟流式。卡片 Markdown 语法有限，生成内容需要允许降级为纯文本。

## 9. 日志与故障定位

### 企业微信关键日志

```text
[wecom-bot] Authenticated
[wecom-bot] server -> plugin
WeCom AI turn completed
WeCom confirmation resolution completed
Confirmation card sent via stream
```

### 飞书关键日志

```text
WebSocket authenticated
Feishu message event received
Feishu message normalized; handing off to AI bridge
Feishu AI reply sent
```

规范化消息日志还包含：

```text
messageId
conversationKey
externalUserId
contentLength
contentPreview
```

`contentPreview` 有长度上限，只用于本地排查。生产环境应根据隐私和敏感信息策略降低日志级别或关闭正文预览。

### 常见问题

| 现象                       | 检查方向                                                                       |
| -------------------------- | ------------------------------------------------------------------------------ |
| Bot 无法启动               | 检查 IM 配置是否完整、迁移是否完成、对应 worker 是否启动                       |
| 连接成功但没有消息         | 检查事件订阅、应用发布、用户范围和单聊/群聊权限                                |
| 飞书私聊无响应、群聊有响应 | 开通 `im:message.p2p_msg` 并重新发布应用                                       |
| 收到消息但无法绑定         | 重新向未绑定账号发送一条消息获取新绑定码；旧码会在轮换后失效                   |
| Markdown 原样显示          | 确认回复是否走 Interactive Card；复杂 Markdown 语法可能需要降级                |
| 确认卡片不显示             | 检查飞书卡片 JSON、发送 API 错误码和 `Feishu bot event handler failed`         |
| 确认卡片显示但点击无效     | 检查飞书卡片回调配置；长连接模式主要接收事件，卡片回调能力需按官方配置单独验证 |
| 机器人回复重复             | 检查消息 ID 去重、是否重复启动两个同渠道 worker                                |
| 日志只有发送成功没有正文   | 查看 `Feishu message normalized...` 记录中的 `contentPreview`                  |

## 10. 验证清单

涉及渠道适配器、绑定、卡片或 AI Bridge 时至少运行：

```bash
pnpm --dir apps/backend typecheck
pnpm --dir apps/backend lint:check
pnpm --dir apps/backend exec node ace test
pnpm --dir apps/frontend typecheck
pnpm --dir apps/frontend lint:check
pnpm --dir apps/frontend build
git diff --check
```

部署或修改数据库配置时额外运行：

```bash
pnpm --dir apps/backend exec node ace migration:status
docker compose --env-file apps/backend/.env -f docker/docker-compose.yml config
```
