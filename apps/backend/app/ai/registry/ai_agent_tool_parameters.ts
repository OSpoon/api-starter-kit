import type { AgentToolParameters } from '#ai/agent'
import {
  channelProposalActionNames,
  genericProposalActionNames,
} from '#ai/core/ai_agent_action_contracts'
import { aiQueryTemplateCodes } from '#ai/registry/ai_agent_query_registry'

export const aiAgentToolParameters = {
  diagnoseMyAccess: {
    type: 'object',
    properties: { permissionCode: { type: 'string' } },
  },
  runRegisteredQuery: {
    type: 'object',
    properties: {
      templateCode: { type: 'string', enum: aiQueryTemplateCodes },
      params: {
        type: 'object',
        properties: { page: { type: 'integer', minimum: 1 } },
        additionalProperties: true,
      },
    },
    required: ['templateCode'],
  },
  searchKnowledge: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      documentIds: {
        type: 'array',
        items: { type: 'integer', minimum: 1 },
        minItems: 1,
        maxItems: 10,
      },
    },
    required: ['query', 'documentIds'],
  },
  searchKnowledgeCatalog: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  taskPlan: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', minLength: 1, maxLength: 240 },
            state: { type: 'string', enum: ['pending', 'running', 'done'] },
          },
          required: ['label', 'state'],
        },
        minItems: 1,
        maxItems: 8,
      },
    },
    required: ['steps'],
  },
  apiKeyTarget: {
    anyOf: [
      {
        type: 'object',
        properties: { apiKeyId: { type: 'integer', minimum: 1 } },
        required: ['apiKeyId'],
      },
      {
        type: 'object',
        properties: { id: { type: 'integer', minimum: 1 } },
        required: ['id'],
      },
      {
        type: 'object',
        properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
        required: ['name'],
      },
    ],
    type: 'object',
  },
  systemManagementChange: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: genericProposalActionNames },
      input: { type: 'object', additionalProperties: true },
    },
    required: ['action', 'input'],
  },
  channelSystemManagementChange: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: channelProposalActionNames },
      input: { type: 'object', additionalProperties: true },
    },
    required: ['action', 'input'],
  },
  apiKeyCreation: {
    type: 'object',
    properties: { name: { type: 'string' }, expiresIn: { type: 'string' } },
    required: ['name'],
  },
  wecomMessageSend: {
    type: 'object',
    properties: {
      templateId: { type: 'integer', minimum: 1 },
      params: { type: 'object', additionalProperties: { type: 'string' } },
      mentionedList: { type: 'array', items: { type: 'string' } },
      mentionedMobileList: { type: 'array', items: { type: 'string' } },
    },
    required: ['templateId'],
  },
} satisfies Record<string, AgentToolParameters>
