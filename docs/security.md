# 安全与治理

## 账号与凭据控制

- 注册已禁用；环境变量只会在用户表为空时初始化首个管理员。
- 密码哈希、密码策略、过期、登录锁定、TOTP 密钥和恢复码均由服务端实施。
- API Key 使用哈希校验。完整 API Key 或生成密码只在有意的创建或重置流程中展示一次，不会出现在常规读取接口中。
- 安全敏感和不可逆操作必须经明确确认。

## 授权与审计

- 角色组合稳定的 `resource:action` 权限，用户获得角色。
- 受保护 API 使用认证与命名权限 middleware，并以 Bouncer `access` ability 为依据。
- 受保护的 `super-admin` 角色不能通过管理 API 或 UI 分配或修改成员关系；系统防止移除最后一个受保护管理员。
- 前端路由与控件显隐只改善体验，后端始终重新鉴权。
- 管理操作和已确认 AI 操作均写入审计日志。

## 应用与部署加固

- 生产错误响应不会暴露 SQL、堆栈或内部异常细节。
- 登录和 2FA 按 IP 限流；账户与 AI 操作按用户限流。
- Adonis Shield 与 Nginx 设置 CSP、`X-Content-Type-Options`、`X-Frame-Options` 和 `Referrer-Policy` 等安全头。
- 后端容器以非 root 的 `node` 用户运行。
- 前端 Markdown 渲染器转义 raw HTML，防止 AI 输出 XSS。

## AI 安全边界

- 助手不能执行自由 SQL 或任意 mutation。
- 数据读取仅限已注册模板，并且在服务端执行鉴权、校验、限量和脱敏。
- 敏感变更只会创建持久化 proposal；执行前重新校验归属、权限、有效期和目标状态。
- 模型文本、Markdown、浏览器状态与会话历史都不是授权渠道。

面向产品的说明见 [AI 助手能力](ai-assistant-capabilities.md)，实现细节见 [AI 助手架构](ai-assistant-architecture.md)。
