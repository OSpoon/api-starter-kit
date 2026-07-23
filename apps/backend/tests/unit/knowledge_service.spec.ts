import { test } from '@japa/runner'

import {
  canReadKnowledgeDocument,
  getKnowledgeAccess,
  splitKnowledgeContent,
} from '#services/knowledge_service'

test.group('knowledge service', () => {
  test('splits normalized document text into overlapping chunks', ({ assert }) => {
    const content = Array.from({ length: 80 }, (_, index) => `word${index + 1}`).join(' ')
    const chunks = splitKnowledgeContent(content, 100, 20)

    assert.isAbove(chunks.length, 1)
    assert.equal(chunks[0].startsWith('word1 word2'), true)
    assert.include(chunks[1], chunks[0].split(' ').at(-1)!)
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
