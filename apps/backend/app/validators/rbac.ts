import vine from '@vinejs/vine'

const roleCode = () =>
  vine
    .string()
    .trim()
    .minLength(2)
    .maxLength(100)
    .regex(/^[a-z0-9-]+$/)

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

export const createPermissionValidator = vine.compile(
  vine.object({
    code: vine
      .string()
      .trim()
      .minLength(2)
      .maxLength(100)
      .regex(/^[a-z0-9-]+:[a-z0-9-]+$/),
    name: vine.string().trim().minLength(1).maxLength(120),
    groupName: vine.string().trim().minLength(1).maxLength(120),
    description: vine.string().trim().maxLength(1000).optional().nullable(),
  })
)

export const updatePermissionValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(120),
    groupName: vine.string().trim().minLength(1).maxLength(120),
    description: vine.string().trim().maxLength(1000).optional().nullable(),
  })
)
