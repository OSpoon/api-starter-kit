import { test } from '@japa/runner'

import {
  applyWecomRuntimeMentions,
  inferTemplateParameters,
  renderWecomPayload,
  validateTemplateDefinition,
  validateTemplateParameters,
  validateTemplateStoragePayload,
  validateWecomTemplatePayload,
} from '#services/wecom_message_template_service'

const validText = {
  msgtype: 'text',
  text: {
    content: '广州今日天气：29度，大部分多云，降雨概率：60%',
    mentioned_list: ['wangqing', '@all'],
    mentioned_mobile_list: ['13800001111'],
  },
}

test.group('WeCom message template service', () => {
  test('supports the currently enabled message types', ({ assert }) => {
    const payloads = [
      validText,
      { msgtype: 'markdown', markdown: { content: '# 标题\n> 内容' } },
      { msgtype: 'markdown_v2', markdown_v2: { content: '**内容**' } },
    ] as Array<Record<string, unknown>>

    for (const payload of payloads) {
      validateWecomTemplatePayload(
        payload.msgtype as Parameters<typeof validateWecomTemplatePayload>[0],
        payload
      )
      assert.isTrue(true)
    }
  })

  test('renders inferred required text parameters and validates the final payload', ({
    assert,
  }) => {
    const payload = {
      msgtype: 'text',
      text: {
        content: '{{region}}今日天气：{{temperature}}度，降雨概率：{{probability}}%',
        mentioned_list: [],
      },
    }
    const definitions = inferTemplateParameters(payload)
    assert.deepEqual(
      definitions.map(({ name, type, required }) => ({ name, type, required })),
      [
        { name: 'region', type: 'string', required: true },
        { name: 'temperature', type: 'string', required: true },
        { name: 'probability', type: 'string', required: true },
      ]
    )
    validateTemplateDefinition(payload, definitions)
    validateTemplateParameters(payload, definitions, {
      region: '北京',
      temperature: '35',
      probability: '60',
    })
    const rendered = renderWecomPayload(payload, {
      region: '北京',
      temperature: '35',
      probability: '60',
    })
    validateWecomTemplatePayload('text', rendered as Record<string, unknown>)
    assert.equal((rendered as any).text.content, '北京今日天气：35度，降雨概率：60%')
  })

  test('rejects missing, undeclared, duplicate, or empty runtime parameters', ({ assert }) => {
    const payload = { msgtype: 'text', text: { content: '{{content}} {{missing}}' } }
    assert.throws(() =>
      validateTemplateDefinition(payload, [{ name: 'content', type: 'string', required: true }])
    )
    assert.throws(() =>
      validateTemplateParameters(payload, [{ name: 'content', type: 'string', required: true }], {})
    )
    assert.throws(() =>
      validateTemplateDefinition({ msgtype: 'text', text: { content: '{{content}}' } }, [
        { name: 'content', type: 'string', required: true },
        { name: 'content', type: 'string', required: true },
      ])
    )
    assert.throws(() =>
      validateTemplateParameters(
        { msgtype: 'text', text: { content: '{{content}}' } },
        [{ name: 'content', type: 'string', required: true }],
        { content: '   ' }
      )
    )
  })

  test('enforces text, markdown, and markdown v2 UTF-8 byte limits', ({ assert }) => {
    validateWecomTemplatePayload('text', { msgtype: 'text', text: { content: '中'.repeat(682) } })
    assert.throws(() =>
      validateWecomTemplatePayload('text', { msgtype: 'text', text: { content: '中'.repeat(683) } })
    )
    validateWecomTemplatePayload('markdown', {
      msgtype: 'markdown',
      markdown: { content: '中'.repeat(1365) },
    })
    assert.throws(() =>
      validateWecomTemplatePayload('markdown', {
        msgtype: 'markdown',
        markdown: { content: '中'.repeat(1366) },
      })
    )
    validateWecomTemplatePayload('markdown_v2', {
      msgtype: 'markdown_v2',
      markdown_v2: { content: '中'.repeat(1365) },
    })
    assert.throws(() =>
      validateWecomTemplatePayload('markdown_v2', {
        msgtype: 'markdown_v2',
        markdown_v2: { content: '中'.repeat(1366) },
      })
    )
  })

  test('enforces the documented markdown subsets', ({ assert }) => {
    validateWecomTemplatePayload('markdown', {
      msgtype: 'markdown',
      markdown: {
        content:
          '实时新增<font color="warning">132例</font>。\n>类型:<font color="comment">反馈</font>',
      },
    })
    assert.throws(() =>
      validateWecomTemplatePayload('markdown', {
        msgtype: 'markdown',
        markdown: { content: '- 不支持的列表' },
      })
    )
    assert.throws(() =>
      validateWecomTemplatePayload('markdown', {
        msgtype: 'markdown',
        markdown: { content: '<font color="blue">不支持的颜色</font>' },
      })
    )
    assert.throws(() =>
      validateWecomTemplatePayload('markdown_v2', {
        msgtype: 'markdown_v2',
        markdown_v2: { content: '<font color="warning">不支持</font>' },
      })
    )
    assert.throws(() =>
      validateWecomTemplatePayload('markdown_v2', {
        msgtype: 'markdown_v2',
        markdown_v2: { content: '<@userid> 不支持' },
      })
    )
  })

  test('enforces text mentions', ({ assert }) => {
    validateWecomTemplatePayload('text', {
      ...validText,
      text: { ...validText.text, mentioned_list: Array(100).fill('user') },
    })
    assert.throws(() =>
      validateWecomTemplatePayload('text', {
        ...validText,
        text: { ...validText.text, mentioned_list: Array(101).fill('user') },
      })
    )
    assert.throws(() =>
      validateWecomTemplatePayload('text', {
        msgtype: 'text',
        text: { content: '内容', mentioned_list: 'user' },
      })
    )
  })

  test('keeps text mentions as runtime-only fields', ({ assert }) => {
    const payload = applyWecomRuntimeMentions(
      'text',
      { msgtype: 'text', text: { content: '内容', mentioned_list: ['template-user'] } },
      { mentionedList: ['runtime-user'], mentionedMobileList: ['13800001111'] }
    )
    assert.deepEqual((payload.text as Record<string, unknown>).mentioned_list, ['runtime-user'])
    assert.deepEqual((payload.text as Record<string, unknown>).mentioned_mobile_list, [
      '13800001111',
    ])

    const withoutMentions = applyWecomRuntimeMentions('text', payload)
    assert.notProperty(withoutMentions.text as Record<string, unknown>, 'mentioned_list')
    assert.notProperty(withoutMentions.text as Record<string, unknown>, 'mentioned_mobile_list')
    assert.doesNotThrow(() =>
      validateTemplateStoragePayload({ msgtype: 'text', text: { content: '内容' } })
    )
    assert.throws(() => validateTemplateStoragePayload(payload))
  })
})
