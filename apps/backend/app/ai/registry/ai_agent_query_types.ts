import { type z } from 'zod'

import type { PermissionCode } from '#authorization/permission_catalog'

export type AiQueryParameter = {
  description: string
  required?: boolean
  schema: z.ZodTypeAny
}

export type AiQueryTemplateCode =
  | 'active_api_keys'
  | 'api_key_profile'
  | 'managed_users'
  | 'managed_user_profile'
  | 'recent_audit_logs'
  | 'roles_with_permissions'
  | 'role_profile'
  | 'permission_catalog'
  | 'permission_usage'
  | 'recent_access_control_changes'
  | 'wecom_message_templates'
  | 'wecom_message_template_profile'
  | 'wecom_message_preview'

export type AiQueryTemplate = {
  code: AiQueryTemplateCode
  version: number
  description: string
  permission: PermissionCode
  parameters: Record<string, AiQueryParameter>
  persistParameters?: boolean
  execute: (params: Record<string, unknown>) => Promise<Record<string, unknown>>
}
