# 企业微信与飞书 AI 机器人对接指南

本文说明 API Starter Kit 当前对企业微信智能机器人和飞书自建应用机器人的接入方式、运行时配置、用户绑定、受控操作、消息格式、开发启动和故障排查。

## 1. 设计目标

两种外部渠道使用同一套 AI 助手安全边界：

```text
企业微信 / 飞书
        ↓
渠道适配器（WebSocket、消息格式、卡片格式）
        ↓
AiChannelBridge
        ↓
现有 AI 助手、知识库、查询工具、受控操作和权限系统
```

渠道适配器只负责连接和协议转换，不复制 AI 编排、权限判断或业务执行逻辑。用户在外部渠道首次发消息时，系统为该渠道身份生成一次性绑定码；绑定后，外部消息使用系统用户的角色、权限、知识库范围和 AI 确认机制。

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

## 3. 运行时配置

机器人凭据统一在系统管理的「LLM 配置」页面底部维护。敏感字段由后端加密保存，保存后重启对应 Bot worker 才会重新加载运行时配置。

### 企业微信字段

| 字段          | 说明                                                               |
| ------------- | ------------------------------------------------------------------ |
| Bot ID        | 企业微信智能机器人后台获取的机器人 ID                              |
| Bot Secret    | 企业微信智能机器人后台获取的 Secret，后端加密保存                  |
| Tenant ID     | 企业/租户标识；按企业微信机器人配置填写                            |
| WebSocket URL | 长连接地址；通常使用官方默认地址，私有部署按企业后台提供的地址填写 |

### 飞书字段

| 字段       | 说明                                                    |
| ---------- | ------------------------------------------------------- |
| App ID     | 飞书企业自建应用的 App ID                               |
| App Secret | 飞书企业自建应用的 App Secret，后端加密保存             |
| Domain     | 国内飞书通常留空；国际版或 Lark 环境按官方 SDK 要求填写 |

完成数据库初始化后，可检查迁移状态：

```bash
pnpm --dir apps/backend exec node ace migration:status
```

## 4. 企业微信配置

1. 在企业微信管理后台创建或打开智能机器人。
2. 进入智能机器人 API 配置，取得 Bot ID、Secret、Tenant ID 和 WebSocket 地址。
3. 在本系统「系统管理 → LLM 配置 → 企业微信智能机器人」保存配置。
4. 启动企业微信 Bot worker。
5. 向机器人发送消息，首次回复会包含一次性绑定码。
6. 登录本系统，在「个人设置 → AI 渠道绑定 → 企业微信智能机器人」点击绑定，使用 Input OTP 组件输入 8 位绑定码。

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
10. 在本系统「系统管理 → LLM 配置 → 飞书机器人」配置 App ID、App Secret 和 Domain。
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

## 6. 开发启动与生产启动

两个 Bot 必须是独立进程，避免 WebSocket 连接、日志和故障相互影响。

### 本地开发

同时启动前端、后端、企业微信 Bot 和飞书 Bot：

```bash
pnpm dev
```

单独启动某个 Bot：

```bash
turbo bot:wecom
turbo bot:feishu
```

对应的 backend 脚本和 Nodemon 配置为：

```text
apps/backend/package.json       bot:wecom / bot:feishu
apps/backend/nodemon.wecom.json
apps/backend/nodemon.feishu.json
apps/backend/commands/wecom_bot.ts
apps/backend/commands/feishu_bot.ts
```

代码变更会由对应 Nodemon worker 重启。LLM 配置保存后，仍需要重启对应 worker，因为 Bot 进程在启动时读取运行时配置并建立连接。

### Docker Compose

Docker Compose 使用两个独立服务：

```text
wecom-bot
feishu-bot
```

两个服务都依赖 backend 和数据库，但分别执行 `node ace wecom:bot` 与 `node ace feishu:bot`。检查服务状态：

```bash
docker compose ps
docker compose logs -f wecom-bot
docker compose logs -f feishu-bot
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
| Bot 无法启动               | 检查 LLM 配置是否完整、迁移是否完成、对应 worker 是否启动                      |
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
docker compose config
```
