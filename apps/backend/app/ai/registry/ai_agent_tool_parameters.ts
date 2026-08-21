import { type TSchema, Type } from '@earendil-works/pi-ai'

import { genericProposalActionNames } from '#ai/core/ai_agent_action_registry'
import { aiQueryTemplateCodes } from '#ai/registry/ai_agent_query_registry'

export const piToolParameters = {
  diagnoseMyAccess: Type.Object({ permissionCode: Type.Optional(Type.String()) }),
  runRegisteredQuery: Type.Object({
    templateCode: Type.Union(
      aiQueryTemplateCodes.map((code) => Type.Literal(code)) as unknown as [
        TSchema,
        TSchema,
        ...TSchema[],
      ]
    ),
    params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  }),
  searchKnowledge: Type.Object({ query: Type.String() }),
  apiKeyTarget: Type.Union([
    Type.Object({ apiKeyId: Type.Integer({ minimum: 1 }) }),
    Type.Object({ id: Type.Integer({ minimum: 1 }) }),
    Type.Object({ name: Type.String({ minLength: 1, maxLength: 120 }) }),
  ]),
  systemManagementChange: Type.Object({
    action: Type.Union(
      genericProposalActionNames.map((action) => Type.Literal(action)) as unknown as [
        TSchema,
        TSchema,
        ...TSchema[],
      ]
    ),
    input: Type.Record(Type.String(), Type.Unknown()),
  }),
  apiKeyCreation: Type.Object({
    name: Type.String(),
    expiresIn: Type.Optional(Type.String()),
  }),
  wecomMessageSend: Type.Object({
    templateId: Type.Integer({ minimum: 1 }),
    params: Type.Optional(Type.Record(Type.String(), Type.String())),
    mentionedList: Type.Optional(Type.Array(Type.String())),
    mentionedMobileList: Type.Optional(Type.Array(Type.String())),
  }),
} satisfies Record<string, TSchema>
