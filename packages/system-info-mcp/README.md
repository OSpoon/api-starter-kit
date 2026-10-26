# System Info MCP

只读 stdio MCP，提供五个按需查询工具：`get_os_info`、`get_cpu_info`、`get_memory_info`、`get_disk_info` 和 `get_network_info`。磁盘容量只针对 MCP 工作目录所在文件系统；网络信息只列本机接口/IP，不测试外网连通性；所有工具都不会修改系统配置。

在仓库根目录构建，然后将包链接到本机 npm 全局目录和 backend 的本地 `node_modules`。这不会写入 backend 的 `package.json`，也不需要发布到 npm：

```sh
pnpm --filter @api-starter-kit/system-info-mcp build
cd packages/system-info-mcp
npm link
cd ../../apps/backend
npm link --ignore-scripts @api-starter-kit/system-info-mcp
```

Agent 使用 `npx --no-install` 启动本机链接的包，不会从 npm 下载：

```json
{
  "mcpServers": {
    "system-info": {
      "command": "npx",
      "args": ["--no-install", "system-info-mcp"]
    }
  }
}
```

`npm link` 创建本机 symlink；第二条 link 命令必须在 backend 目录执行，供 backend 的 `npx` 找到本地可执行入口。`--ignore-scripts` 避免 npm 执行 pnpm workspace 依赖的安装脚本。
