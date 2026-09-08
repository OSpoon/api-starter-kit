import { test } from '@japa/runner'

import { buildKnowledgeSearchAuditMetadata } from '#services/knowledge_audit'
import {
  buildKnowledgeCatalogText,
  buildSemanticKnowledgeChunks,
  canReadKnowledgeDocument,
  extractKnowledgeSearchTerms,
  getKnowledgeAccess,
  splitKnowledgeContent,
} from '#services/knowledge_service'

test.group('knowledge service', () => {
  test('redacts raw knowledge search queries from audit metadata', ({ assert }) => {
    const query = '客户订单退款规则和审批流程'
    const metadata = buildKnowledgeSearchAuditMetadata({
      query,
      stage: 'catalog',
      authorization: 'allowed',
      resultCount: 2,
      durationMs: 12.4,
    })

    assert.notProperty(metadata, 'query')
    assert.notInclude(JSON.stringify(metadata), query)
    assert.match(metadata.queryHash, /^[a-f0-9]{64}$/)
    assert.equal(metadata.resultCount, 2)
  })

  test('builds catalog text from confirmed metadata without inventing content', ({ assert }) => {
    assert.equal(
      buildKnowledgeCatalogText({
        title: '发送规则',
        metadata: {
          summary: '说明消息发送限制',
          topics: ['发送', '限制'],
        },
      }),
      '发送规则\n说明消息发送限制\n发送\n限制'
    )
  })

  test('extracts multilingual terms without a hard-coded stop-word policy', ({ assert }) => {
    assert.deepEqual(extractKnowledgeSearchTerms('如何启动 API Starter Kit 项目？'), [
      '如何',
      '启动',
      'api',
      'starter',
      'kit',
      '项目',
    ])
  })

  test('splits normalized document text into overlapping chunks', ({ assert }) => {
    const content = Array.from({ length: 80 }, (_, index) => `word${index + 1}`).join(' ')
    const chunks = splitKnowledgeContent(content, 100, 20)

    assert.isAbove(chunks.length, 1)
    assert.equal(chunks[0].startsWith('word1 word2'), true)
    assert.include(chunks[1], chunks[0].split(' ').at(-1)!)
  })

  test('uses a semantic discontinuity as a chunk boundary', ({ assert }) => {
    const chunks = buildSemanticKnowledgeChunks({
      units: [
        { content: '第一段介绍账号登录和密码管理。', forceBoundaryBefore: true },
        { content: '用户可以在个人资料中修改密码。', forceBoundaryBefore: false },
        { content: '现在开始说明订单发货和物流追踪。', forceBoundaryBefore: false },
        { content: '订单页面会显示承运商和物流状态。', forceBoundaryBefore: false },
      ],
      distances: [0.01, 0.85, 0.02],
      maxLength: 90,
      overlap: 0,
      breakpointPercentile: 75,
    })

    assert.lengthOf(chunks, 2)
    assert.include(chunks[0], '修改密码')
    assert.include(chunks[1], '订单发货')
  })

  test('allows a document when the user has its required permission', ({ assert }) => {
    const access = getKnowledgeAccess({
      roles: [
        {
          code: 'support',
          permissions: [{ code: 'users:read' }],
        },
      ],
    })

    assert.isTrue(canReadKnowledgeDocument(access, 'users:read'))
    assert.isTrue(canReadKnowledgeDocument(access, null))
  })

  test('denies a document when the user does not have its required permission', ({ assert }) => {
    const access = getKnowledgeAccess({
      roles: [
        {
          code: 'support',
          permissions: [{ code: 'users:read' }],
        },
      ],
    })

    assert.isFalse(canReadKnowledgeDocument(access, 'api-keys:delete'))
  })
})
