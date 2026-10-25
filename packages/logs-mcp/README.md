# Logs MCP

只读 stdio MCP，用于搜索不同应用服务的 Pino JSON 日志。支持按服务名选择日志源；不开放 HTTP 端点。

在仓库根目录构建，并部署到仓库外的独立运行目录：

```sh
pnpm --filter @api-starter-kit/logs-mcp build
pnpm deploy --legacy --filter=@api-starter-kit/logs-mcp --prod --ignore-scripts /absolute/path/to/logs-mcp
```

在 Agent 的 MCP 配置中使用 Node 启动独立安装产物，并传入日志目录：

```json
{
  "mcpServers": {
    "logs": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/logs-mcp/dist/index.js", "--log-dir", "/absolute/path/to/logs"]
    }
  }
}
```

发现并启用 `search_logs` 后，可按服务名、关键词、请求 ID、级别和时间范围查询。MCP 会递归
扫描配置的日志根目录；每个服务的活动日志和轮转日志需使用 `<service>.log` 和
`<service>.<rotation>.log` 命名，例如 `backend.log`、`backend.1.log`。目录只有一个服务时可省略
服务名；有多个服务时，工具会返回可用服务名并要求指定查询目标。服务名不匹配时也会返回可用名称。
结果最多 50 条，使用返回的 `nextOffset` 继续读取。每条记录保留 UTC 的 `timestamp`，并提供
按 MCP 进程时区格式化的 `timestampLocal`；Agent 回答时优先展示本地时间。日志正文不会脱敏，
长字段会截断，堆栈不会返回。

多个服务可以放在同一个日志目录中；如果服务日志分属不同目录，可在 Agent MCP 配置中为每个
目录登记一个 `logs-mcp` 实例。
