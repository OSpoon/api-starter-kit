import { test } from '@japa/runner'

import { parseKnowledgeMetadataResponse } from '#services/knowledge_metadata_service'

test.group('knowledge metadata service', () => {
  test('accepts explicit empty metadata', ({ assert }) => {
    assert.deepEqual(parseKnowledgeMetadataResponse('{"summary":null,"topics":[]}'), {
      summary: null,
      topics: [],
    })
  })

  test('rejects malformed metadata fields instead of replacing them with empty values', ({
    assert,
  }) => {
    assert.throws(
      () => parseKnowledgeMetadataResponse('{"summary":7,"topics":"invalid"}'),
      'LLM 返回的知识文档元数据格式无效'
    )
  })
})
