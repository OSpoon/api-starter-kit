// Kept for the historical seed migration; this help example is not an active permission.
export const todoBoardReadPermission = {
  code: 'todo-board:read',
  name: '查看 Todo 看板',
  groupName: '帮助工具',
} as const

export const permissionCatalog = [
  { code: 'dashboard:view', name: '查看仪表盘', groupName: '工作台' },
  { code: 'api-keys:read', name: '查看 API 密钥', groupName: '系统管理' },
  { code: 'api-keys:create', name: '创建 AI 助手密钥', groupName: '系统管理' },
  { code: 'api-keys:update', name: '更新 API 密钥', groupName: '系统管理' },
  { code: 'api-keys:delete', name: '吊销 API 密钥', groupName: '系统管理' },
  { code: 'users:read', name: '查看用户', groupName: '权限管理' },
  { code: 'users:create', name: '创建用户', groupName: '权限管理' },
  { code: 'users:update', name: '分配用户角色', groupName: '权限管理' },
  { code: 'users:delete', name: '删除用户', groupName: '权限管理' },
  { code: 'roles:read', name: '查看角色', groupName: '权限管理' },
  { code: 'roles:create', name: '创建角色', groupName: '权限管理' },
  { code: 'roles:update', name: '编辑角色', groupName: '权限管理' },
  { code: 'roles:delete', name: '删除角色', groupName: '权限管理' },
  { code: 'permissions:read', name: '查看权限', groupName: '权限管理' },
  { code: 'audit-logs:read', name: '查看审计日志', groupName: '系统管理' },
  { code: 'backend-logs:read', name: '查看后端实时日志', groupName: '系统管理' },
  { code: 'knowledge:read', name: '检索知识库', groupName: 'Agent管理' },
  { code: 'knowledge:manage', name: '管理知识库', groupName: 'Agent管理' },
  { code: 'system-status:read', name: '查看系统状态', groupName: '系统管理' },
  { code: 'agent-config:read', name: '查看 Agent 配置', groupName: 'Agent管理' },
  { code: 'agent-config:update', name: '管理 Agent 配置', groupName: 'Agent管理' },
  { code: 'im-config:read', name: '查看 IM Bot', groupName: 'Agent管理' },
  { code: 'im-config:update', name: '管理 IM Bot', groupName: 'Agent管理' },
  { code: 'ai-usage:read', name: '查看 AI 用量', groupName: 'Agent管理' },
  { code: 'ai-evaluations:read', name: '查看测评管理', groupName: 'Agent管理' },
  { code: 'ai-evaluations:manage', name: '管理测评条目', groupName: 'Agent管理' },
  { code: 'ai-evaluations:run', name: '运行 AI 测评', groupName: 'Agent管理' },
  { code: 'ai-automations:read', name: '查看自动化任务', groupName: 'Agent管理' },
  { code: 'ai-automations:manage', name: '管理自动化任务', groupName: 'Agent管理' },
  { code: 'ai-automations:run', name: '运行自动化任务', groupName: 'Agent管理' },
  { code: 'media:upload', name: '上传媒体图片', groupName: '媒体管理' },
  { code: 'markdown-editor:read', name: '查看 Markdown 编辑器示例', groupName: '开发工具' },
] as const

export const permissionCatalogCodes = permissionCatalog.map(({ code }) => code)
