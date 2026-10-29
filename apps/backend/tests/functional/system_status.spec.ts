import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'

import Permission from '#models/permission'
import Role from '#models/role'
import User from '#models/user'
import { generateInitialPassword } from '#security/user_credentials'
import {
  getImBotProcessStatuses,
  startImBotWorkerStatusReporter,
} from '#services/im_bot_worker_status_service'

test.group('system status', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('reports online, stale, and missing IM bot worker heartbeats', async ({
    client,
    assert,
  }) => {
    await db.rawQuery('DELETE FROM im_bot_worker_statuses')
    await db.rawQuery(
      `INSERT INTO im_bot_worker_statuses
         (channel, pid, worker_status, started_at, last_heartbeat_at)
       VALUES
         ('wecom', 41001, 'running', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
         ('feishu', 41002, 'running', CURRENT_TIMESTAMP - INTERVAL '2 minutes', CURRENT_TIMESTAMP - INTERVAL '2 minutes')
       ON CONFLICT (channel) DO UPDATE SET
         pid = EXCLUDED.pid,
         worker_status = EXCLUDED.worker_status,
         started_at = EXCLUDED.started_at,
         last_heartbeat_at = EXCLUDED.last_heartbeat_at`
    )

    const permission = await Permission.findByOrFail('code', 'system-status:read')
    const role = await Role.create({ code: `status-${crypto.randomUUID()}`, name: 'Status reader' })
    await role.related('permissions').sync([permission.id])
    const user = await User.create({
      fullName: 'Status reader',
      email: `status-${crypto.randomUUID()}@example.com`,
      password: generateInitialPassword(),
    })
    await user.related('roles').sync([role.id])
    const token = await User.accessTokens.create(user)

    const response = await client.get('/api/v1/system/status').bearerToken(token.value!.release())
    response.assertStatus(200)

    const bots = (
      response.body() as unknown as { data: { imBots: Array<Record<string, unknown>> } }
    ).data.imBots
    assert.deepEqual(
      bots.map(({ channel }) => channel),
      ['wecom', 'feishu', 'dingtalk']
    )
    assert.equal(bots[0]?.status, 'online')
    assert.equal(bots[0]?.pid, 41001)
    assert.isString(bots[0]?.lastHeartbeatAt)
    assert.equal(bots[1]?.status, 'offline')
    assert.equal(bots[1]?.pid, 41002)
    assert.equal(bots[2]?.status, 'offline')
    assert.isNull(bots[2]?.pid)
    assert.isNull(bots[2]?.lastHeartbeatAt)
    await db.rawQuery('DELETE FROM im_bot_worker_statuses')
  })

  test('records a worker heartbeat and marks it stopped during graceful shutdown', async ({
    assert,
  }) => {
    await db.rawQuery('DELETE FROM im_bot_worker_statuses')
    const stopReporting = await startImBotWorkerStatusReporter('dingtalk')

    try {
      const runningStatus = await getImBotProcessStatuses()
      assert.equal(runningStatus[2]?.status, 'online')
      assert.equal(runningStatus[2]?.pid, process.pid)
      assert.isString(runningStatus[2]?.startedAt)
      assert.isString(runningStatus[2]?.lastHeartbeatAt)
    } finally {
      await stopReporting()
    }

    const stoppedStatus = await getImBotProcessStatuses()
    assert.equal(stoppedStatus[2]?.status, 'offline')
    await db.rawQuery('DELETE FROM im_bot_worker_statuses')
  })
})
