import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createJiti } from 'jiti'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const jiti = createJiti(import.meta.url, {
  alias: {
    '@': `${root}/src`,
  },
})

const { validatePasswordChange } = await jiti.import(`${root}/src/lib/change-password-form.ts`)
const { buildMonitorPayload, formatProbeSample } = await jiti.import(
  `${root}/src/lib/monitor-form.ts`
)
const { buildWebhookFormValues, buildWebhookSavePayload, splitWebhookMentionList } =
  await jiti.import(`${root}/src/lib/webhook-form.ts`)
const { buildWebhookPolicyFromMode, inferWebhookPolicyMode, normalizeWebhookPolicy } =
  await jiti.import(`${root}/src/lib/monitoring.ts`)
const { previewResponseAssertions } = await jiti.import(`${root}/src/lib/monitoring.ts`)
const { maskSensitiveUrl } = await jiti.import(`${root}/src/lib/sensitive-display.ts`)

function monitorForm(overrides = {}) {
  return {
    id: null,
    name: 'DeepSeek余额监控',
    method: 'GET',
    url: 'https://api.deepseek.com/user/balance',
    headersText: '{"Accept":"application/json","Authorization":"Bearer <TOKEN>"}',
    body: '',
    expectedStatusText: '200',
    assertionMatchMode: 'all',
    assertions: [
      {
        path: '$.balance_infos[0].total_balance',
        operator: 'gte',
        expected: '5',
        fieldLabel: '余额',
      },
    ],
    timeoutMs: 5000,
    cronExpression: '*/5 * * * *',
    enabled: true,
    webhookId: 3,
    webhookPolicyId: 2,
    webhookEnabled: true,
    ...overrides,
  }
}

test('monitor create/edit payload keeps only user-entered headers', () => {
  const payload = buildMonitorPayload(monitorForm(), {
    invalidHeadersJson: 'invalid headers',
  })

  assert.deepEqual(payload.headers, {
    Accept: 'application/json',
    Authorization: 'Bearer <TOKEN>',
  })
  assert.equal(Object.hasOwn(payload.headers, 'user-agent'), false)
  assert.equal(Object.hasOwn(payload.headers, 'host'), false)
  assert.equal(payload.webhookEndpointId, 3)
  assert.equal(payload.webhookEnabled, true)
  assert.deepEqual(payload.options.responseValidation, {
    match: 'all',
    assertions: [
      {
        path: '$.balance_infos[0].total_balance',
        operator: 'gte',
        expected: 5,
        fieldLabel: '余额',
      },
    ],
  })
})

test('monitor payload validates headers JSON and supports empty headers', () => {
  assert.equal(
    buildMonitorPayload(monitorForm({ headersText: '' }), {
      invalidHeadersJson: 'invalid headers',
    }).headers,
    null
  )

  assert.throws(
    () =>
      buildMonitorPayload(monitorForm({ headersText: '{' }), {
        invalidHeadersJson: 'Headers JSON 格式不正确',
      }),
    /Headers JSON 格式不正确/
  )
})

test('monitor test response sample is formatted for field selection', () => {
  assert.equal(
    formatProbeSample('{"is_available":true,"balance_infos":[{"total_balance":"8.08"}]}'),
    `{
  "is_available": true,
  "balance_infos": [
    {
      "total_balance": "8.08"
    }
  ]
}
`
  )
  assert.equal(formatProbeSample('<html>service unavailable</html>'), '')
})

test('response assertion preview uses field labels and numeric comparison', () => {
  const preview = previewResponseAssertions(
    {
      balance_infos: [
        {
          total_balance: '3.00',
        },
      ],
    },
    [
      {
        path: '$.balance_infos[0].total_balance',
        operator: 'gte',
        expected: '5',
        fieldLabel: '账户余额',
      },
    ],
    'all'
  )

  assert.deepEqual(preview, {
    status: 'fail',
    message: '账户余额当前为 3.00，低于预期值 5',
  })
})

test('webhook form builds generic and bot test payloads', () => {
  assert.deepEqual(
    buildWebhookFormValues({
      name: '通用通道',
      type: 'generic',
      url: 'https://example.com/webhook',
      secret: 'secret',
      template: 'ignored',
      mentionUserIdsText: '@all',
    }),
    {
      name: '通用通道',
      type: 'generic',
      url: 'https://example.com/webhook',
      secret: 'secret',
      settings: null,
    }
  )

  assert.deepEqual(
    buildWebhookFormValues({
      name: '企微机器人',
      type: 'work_weixin_bot',
      url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test',
      secret: '',
      template: '### {{title}}\n{{result.summary}}',
      mentionUserIdsText: 'zhangsan, lisi, zhangsan',
    }).settings,
    {
      template: '### {{title}}\n{{result.summary}}',
      mentionUserIds: ['zhangsan', 'lisi'],
    }
  )

  assert.deepEqual(
    buildWebhookFormValues({
      name: '钉钉机器人',
      type: 'dingtalk_bot',
      url: 'https://oapi.dingtalk.com/robot/send?access_token=test',
      secret: 'SECxxx',
      template: '### {{title}}\n{{result.detail}}',
      mentionUserIdsText: 'zhangsan, @all',
    }),
    {
      name: '钉钉机器人',
      type: 'dingtalk_bot',
      url: 'https://oapi.dingtalk.com/robot/send?access_token=test',
      secret: 'SECxxx',
      settings: {
        template: '### {{title}}\n{{result.detail}}',
        mentionUserIds: ['zhangsan', '@all'],
      },
    }
  )

  assert.deepEqual(
    buildWebhookFormValues({
      name: '飞书机器人',
      type: 'feishu_bot',
      url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      secret: 'secret',
      template: '',
      mentionUserIdsText: '',
    }),
    {
      name: '飞书机器人',
      type: 'feishu_bot',
      url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      secret: 'secret',
      settings: {},
    }
  )
})

test('webhook selector masks sensitive URL query values', () => {
  assert.equal(
    maskSensitiveUrl(
      'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=de0ba3ee-1dfd-4f08-9c7d-0b8459eb157a'
    ),
    'qyapi.weixin.qq.com/cgi-bin/webhook/send?key=de0b••••157a'
  )
  assert.equal(
    maskSensitiveUrl('https://webhook.site/1d22ce26-7f63-4ef5-a757-740ce062c4b8'),
    'webhook.site/1d22ce26-7f63-4ef5-a757-740ce062c4b8'
  )
})

test('webhook save payload does not overwrite an existing secret when editing', () => {
  const payload = buildWebhookSavePayload(
    {
      name: '编辑通道',
      type: 'generic',
      url: 'https://example.com/webhook',
      secret: '',
      settings: null,
    },
    { isEditing: true, currentEnabled: true }
  )

  assert.equal(Object.hasOwn(payload, 'secret'), false)
  assert.equal(payload.enabled, true)
  assert.deepEqual(splitWebhookMentionList('zhangsan, lisi, zhangsan, @all'), [
    'zhangsan',
    'lisi',
    '@all',
  ])
})

test('webhook policy modes cover balance alerts and legacy payloads', () => {
  assert.deepEqual(buildWebhookPolicyFromMode('first_failure'), {
    mode: 'first_failure',
    eventFilter: 'failure',
    onRepeatedSuccess: 'skip',
    onRepeatedFailure: 'skip',
    failureRepeatMinutes: 30,
  })

  assert.equal(buildWebhookPolicyFromMode('failure_interval', 0).failureRepeatMinutes, 30)
  assert.equal(
    inferWebhookPolicyMode({
      eventFilter: 'failure',
      onRepeatedSuccess: 'skip',
      onRepeatedFailure: 'notify',
    }),
    'every_failure'
  )
  assert.deepEqual(
    normalizeWebhookPolicy({
      event_filter: 'status_change',
      on_repeated_success: 'skip',
      on_repeated_failure: 'skip',
      failure_repeat_minutes: 60,
    }),
    {
      mode: 'status_change',
      eventFilter: 'status_change',
      onRepeatedSuccess: 'skip',
      onRepeatedFailure: 'skip',
      failureRepeatMinutes: 60,
    }
  )
})

test('password change validation covers required fields, mismatch and strength', () => {
  assert.equal(
    validatePasswordChange({
      currentPassword: '',
      newPassword: 'NewPassword123!@#',
      confirmPassword: 'NewPassword123!@#',
    }),
    'fill_all'
  )
  assert.equal(
    validatePasswordChange({
      currentPassword: 'OldPassword123!@#',
      newPassword: 'NewPassword123!@#',
      confirmPassword: 'OtherPassword123!@#',
    }),
    'password_mismatch'
  )
  assert.equal(
    validatePasswordChange({
      currentPassword: 'OldPassword123!@#',
      newPassword: 'shortA1!',
      confirmPassword: 'shortA1!',
    }),
    'password_weak'
  )
  assert.equal(
    validatePasswordChange({
      currentPassword: 'OldPassword123!@#',
      newPassword: 'N8x!SecureValue2026',
      confirmPassword: 'N8x!SecureValue2026',
      userInputs: ['admin@example.com'],
    }),
    null
  )
})
