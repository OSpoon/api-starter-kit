import { test } from '@japa/runner'

import { cpuUsage, parseMounts, readSystemStatus } from '#services/system_status_service'

test.group('system status service', () => {
  test('reports no CPU percentage until a previous sample exists', ({ assert }) => {
    const current = [{ idle: 60, total: 100 }]

    assert.isNull(cpuUsage(current, null))
    assert.deepEqual(cpuUsage(current, [{ idle: 50, total: 80 }]), [50])
    assert.deepEqual(cpuUsage(current, [{ idle: 60, total: 100 }]), [null])
  })

  test('skips disk rows without valid percentages or capacities', ({ assert }) => {
    const mounts = parseMounts(
      [
        'Filesystem 1K-blocks Used Available Use% Mounted on',
        '/dev/root 1000 250 750 25% /',
        '/dev/unknown 1000 250 750 unknown /unknown',
        '/dev/empty 0 0 0 0% /empty',
      ].join('\n')
    )

    assert.deepEqual(mounts, [
      { mount: '/', usedPercent: 25, usedBytes: 256_000, totalBytes: 1_024_000 },
    ])
  })

  test('reports disk collection failure separately from an empty disk list', async ({ assert }) => {
    const status = await readSystemStatus(async () => {
      throw new Error('df unavailable')
    })

    assert.isFalse(status.diskCollectionAvailable)
    assert.deepEqual(status.disks, [])
  })
})
