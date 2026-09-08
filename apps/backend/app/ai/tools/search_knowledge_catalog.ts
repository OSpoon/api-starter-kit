import { z } from 'zod'

import { ensureAiAgentPermission } from '#ai/core/ai_agent_authorization'
import type { AiAgentToolContext } from '#ai/core/ai_agent_tool_context'
import { type AiAgentToolSupport, createAiAgentTool } from '#ai/registry/ai_agent_tool_helpers'
import { piToolParameters } from '#ai/registry/ai_agent_tool_parameters'
import { recordKnowledgeSearchAudit } from '#services/knowledge_audit'
import { searchKnowledgeCatalog } from '#services/knowledge_service'

export function createSearchKnowledgeCatalogTool(
  input: AiAgentToolContext,
  support: AiAgentToolSupport
) {
  return createAiAgentTool(
    async ({ query }) => {
      const startedAt = performance.now()
      const publicOnly = input.capabilityMode === 'knowledge-only'
      try {
        support.throwIfAborted()
        const user = await ensureAiAgentPermission(input.userId, 'knowledge:read')
        const sources = await searchKnowledgeCatalog({ user, query, publicOnly })
        await recordKnowledgeSearchAudit({
          userId: input.userId,
          query,
          stage: 'catalog',
          authorization: 'allowed',
          resultCount: sources.length,
          candidateDocumentCount: sources.length,
          publicOnly,
          durationMs: performance.now() - startedAt,
        })
        input.knowledgeCatalogDocumentIds = new Set(sources.map((source) => source.documentId))
        return {
          sources: sources.map((source) => ({
          documentId: source.documentId,
          title: source.title,
          summary: source.summary,
            topics: source.topics,
            similarity: source.similarity,
          })),
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          const message = error instanceof Error ? error.message : ''
          await recordKnowledgeSearchAudit({
            userId: input.userId,
            query,
            stage: 'catalog',
            authorization: /权限|permission/i.test(message) ? 'denied' : 'failed',
            resultCount: 0,
            publicOnly,
            durationMs: performance.now() - startedAt,
          })
        }
        throw error
      }
    },
    {
      name: 'search_knowledge_catalog',
      description:
        'First stage of document knowledge retrieval. Search the permission-filtered knowledge-source catalog and return at most 12 candidate documents without正文片段. You must call this before search_knowledge; use the returned documentId values to choose the narrow document scope for the second stage.',
      schema: z.object({ query: z.string().trim().min(2).max(1000) }),
      parameters: piToolParameters.searchKnowledgeCatalog,
      executionMode: 'sequential',
    }
  )
}
