import vine from '@vinejs/vine'

const roleCode = () =>
  vine
    .string()
    .trim()
    .minLength(2)
    .maxLength(100)
    .regex(/^[a-z0-9-]+$/)

const queryPage = vine
  .string()
  .trim()
  .maxLength(5)
  .regex(/^[1-9]\d*$/)
  .optional()
const queryLimit = vine
  .string()
  .trim()
  .maxLength(3)
  .regex(/^[1-9]\d*$/)
  .optional()

export const listAccessControlValidator = vine.compile(
  vine.object({
    page: queryPage,
    limit: queryLimit,
    search: vine.string().trim().maxLength(200).optional(),
    groupName: vine.string().trim().maxLength(120).optional(),
  })
)

export const listManagedUsersValidator = vine.compile(
  vine.object({
    page: queryPage,
    limit: queryLimit,
    search: vine.string().trim().maxLength(200).optional(),
    roleIds: vine
      .string()
      .trim()
      .maxLength(4000)
      .regex(/^[1-9]\d*(?:,[1-9]\d*)*$/)
      .optional(),
    channels: vine
      .string()
      .trim()
      .maxLength(200)
      .regex(/^(?:none|wecom|feishu|dingtalk)(?:,(?:none|wecom|feishu|dingtalk))*$/)
      .optional(),
  })
)

export const createRoleValidator = vine.compile(
  vine.object({
    code: roleCode(),
    name: vine.string().trim().minLength(1).maxLength(120),
    description: vine.string().trim().maxLength(1000).optional().nullable(),
    permissionIds: vine.array(vine.number().positive()).optional(),
  })
)

export const updateRoleValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(120),
    description: vine.string().trim().maxLength(1000).optional().nullable(),
    permissionIds: vine.array(vine.number().positive()).optional(),
  })
)

export const updateUserRolesValidator = vine.compile(
  vine.object({
    roleIds: vine.array(vine.number().positive()),
  })
)

export const createManagedUserValidator = vine.compile(
  vine.object({
    fullName: vine.string().trim().minLength(1).maxLength(120),
    email: vine.string().trim().email().maxLength(254),
    roleIds: vine.array(vine.number().positive()),
  })
)

export const updateManagedUserValidator = vine.compile(
  vine.object({
    fullName: vine.string().trim().minLength(1).maxLength(120),
    email: vine.string().trim().email().maxLength(254),
    roleIds: vine.array(vine.number().positive()),
  })
)
