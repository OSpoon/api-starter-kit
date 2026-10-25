import { test } from '@japa/runner'

import { createWecomConfirmationCard } from '#channels/wecom/wecom_bot_adapter'

test.group('WeCom confirmation card', () => {
  test('includes a safe operation summary and preserves confirmation callback keys', ({
    assert,
  }) => {
    const card = createWecomConfirmationCard({
      kind: 'confirmation',
      title: '确认调用 MCP 工具',
      description: '请确认是否执行以下操作。',
      confirmationId: '42',
      confirmLabel: '确认执行',
      cancelLabel: '取消',
      targetLabel: '应用日志查询',
      changes: [
        { label: 'MCP 工具', value: 'search_logs' },
        { label: '参数', value: 'limit, offset' },
      ],
      impactLabel: '执行前会再次验证权限和操作状态。',
    })

    assert.equal(card.main_title?.title, '确认调用 MCP 工具')
    assert.deepEqual(card.horizontal_content_list, [
      { keyname: '操作对象', value: '应用日志查询' },
      { keyname: 'MCP 工具', value: 'search_logs' },
      { keyname: '参数', value: 'limit, offset' },
      { keyname: '影响提示', value: '执行前会再次验证权限和操作状态。' },
    ])
    assert.equal(card.button_list?.[0]?.key, 'confirm:42')
    assert.equal(card.button_list?.[1]?.key, 'cancel:42')
  })

  test('keeps the native card detail list within its six-row limit', ({ assert }) => {
    const card = createWecomConfirmationCard({
      kind: 'confirmation',
      title: '确认更新角色',
      description: '请确认是否执行以下操作。',
      confirmationId: '43',
      confirmLabel: '确认执行',
      cancelLabel: '取消',
      targetLabel: '管理员',
      changes: Array.from({ length: 8 }, (_, index) => ({
        label: `字段${index}`,
        value: `值${index}`,
      })),
      impactLabel: '执行前会再次验证权限和操作状态。',
    })

    assert.lengthOf(card.horizontal_content_list ?? [], 6)
    assert.deepInclude(card.horizontal_content_list ?? [], {
      keyname: '更多',
      value: '另有 5 项变更',
    })
  })
})
