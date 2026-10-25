import { test } from '@japa/runner'

import {
  formatConfirmationDetails,
  formatDingTalkConfirmationDescription,
} from '#channels/confirmation_details'

test.group('DingTalk confirmation description', () => {
  test('renders the operation, target, safe changes, and impact as Markdown', ({ assert }) => {
    const description = formatDingTalkConfirmationDescription({
      kind: 'confirmation',
      title: '确认调用 MCP 工具',
      description: '请确认是否执行以下操作。',
      confirmationId: '42',
      confirmLabel: '确认执行',
      cancelLabel: '取消',
      targetLabel: '应用日志查询',
      changes: [
        { label: 'MCP 工具', value: 'search_logs' },
        { label: '参数', value: 'limit, offset, sinceMinutes' },
      ],
      impactLabel: '执行前会再次验证权限和操作状态。',
    })

    assert.include(description, '## 确认调用 MCP 工具')
    assert.include(description, '**操作对象：** 应用日志查询')
    assert.include(description, '- **MCP 工具：** search\\_logs')
    assert.include(description, '> 执行前会再次验证权限和操作状态。')
  })

  test('keeps user-provided text on one line and escapes Markdown syntax', ({ assert }) => {
    const description = formatDingTalkConfirmationDescription({
      kind: 'confirmation',
      title: '确认操作',
      description: '请确认。',
      confirmationId: '43',
      confirmLabel: '确认执行',
      cancelLabel: '取消',
      targetLabel: '名称\n**伪造标题**',
    })

    assert.include(description, '**操作对象：** 名称 \\*\\*伪造标题\\*\\*')
    assert.notInclude(description, '\n**伪造标题**')
  })

  test('formats shared confirmation details without repeating the card title', ({ assert }) => {
    const description = formatConfirmationDetails({
      kind: 'confirmation',
      title: '确认调用 MCP 工具',
      description: '请确认是否执行以下操作。',
      confirmationId: '44',
      confirmLabel: '确认执行',
      cancelLabel: '取消',
      targetLabel: '应用日志查询',
      changes: [{ label: 'MCP 工具', value: 'search_logs' }],
      impactLabel: '执行前会再次验证权限和操作状态。',
    })

    assert.notInclude(description, '## 确认调用 MCP 工具')
    assert.include(description, '**操作对象：** 应用日志查询')
    assert.include(description, '- **MCP 工具：** search\\_logs')
    assert.include(description, '> 执行前会再次验证权限和操作状态。')
  })
})
