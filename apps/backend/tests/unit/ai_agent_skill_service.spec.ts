import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { test } from '@japa/runner'

import {
  getAiAgentSkillCapabilities,
  listAiAgentSkills,
  listAiAgentSkillScripts,
  listEnabledAiAgentSkills,
  loadAiAgentSkill,
  removeAiAgentSkill,
  runAiAgentSkillCommand,
  updateAiAgentSkill,
  validateAiAgentSkillSource,
} from '#services/ai_agent_skill_service'

test.group('AI agent skill service', (group) => {
  const workspaces: string[] = []
  group.each.teardown(async () => {
    await Promise.all(
      workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true }))
    )
  })

  async function createSkillWorkspace() {
    const workspace = await mkdtemp(join(tmpdir(), 'api-agent-skills-'))
    workspaces.push(workspace)
    const skillPath = join(workspace, '.agents', 'skills', 'summarize')
    await mkdir(join(skillPath, 'references'), { recursive: true })
    await writeFile(
      join(skillPath, 'SKILL.md'),
      '---\nname: Summarize\ndescription: Create concise summaries.\n---\nUse short sentences.\n'
    )
    await writeFile(join(skillPath, 'references', 'guide.md'), 'Keep only durable facts.')
    return { workspace, skillPath }
  }

  test('accepts GitHub and Git sources but rejects ZIP archives and local paths', ({ assert }) => {
    assert.equal(validateAiAgentSkillSource('vercel-labs/agent-skills'), 'vercel-labs/agent-skills')
    assert.equal(
      validateAiAgentSkillSource('https://github.com/vercel-labs/agent-skills'),
      'https://github.com/vercel-labs/agent-skills'
    )
    assert.equal(
      validateAiAgentSkillSource('https://git.example.com/team/skills.git'),
      'https://git.example.com/team/skills.git'
    )
    assert.throws(() => validateAiAgentSkillSource('https://example.com/skills.zip'))
    assert.throws(() =>
      validateAiAgentSkillSource('https://github.com/team/skills/archive/main.zip')
    )
    assert.throws(() => validateAiAgentSkillSource('../local-path'))
  })

  test('lists skills, persists enablement, and loads only enabled skill resources', async ({
    assert,
  }) => {
    const { workspace } = await createSkillWorkspace()
    const before = await listAiAgentSkills(1, 20, workspace)
    assert.deepEqual(before.items[0], {
      code: 'summarize',
      name: 'Summarize',
      description: 'Create concise summaries.',
      enabled: false,
      updatedAt: before.items[0]!.updatedAt,
    })
    assert.deepEqual(await listEnabledAiAgentSkills(workspace), [])

    await updateAiAgentSkill('summarize', true, workspace)
    const active = await listEnabledAiAgentSkills(workspace)
    assert.equal(active.length, 1)
    assert.equal(
      await loadAiAgentSkill('summarize', undefined, workspace),
      '---\nname: Summarize\ndescription: Create concise summaries.\n---\nUse short sentences.\n'
    )
    assert.equal(
      await loadAiAgentSkill('summarize', 'references/guide.md', workspace),
      'Keep only durable facts.'
    )
    await assert.rejects(
      () => loadAiAgentSkill('summarize', 'system-info.md', workspace),
      /技能资源不存在/
    )

    await updateAiAgentSkill('summarize', false, workspace)
    assert.deepEqual(await listEnabledAiAgentSkills(workspace), [])
  })

  test('rejects traversal and symlinks escaping the skill directory', async ({ assert }) => {
    const { workspace, skillPath } = await createSkillWorkspace()
    await updateAiAgentSkill('summarize', true, workspace)
    await assert.rejects(() => loadAiAgentSkill('summarize', '../outside.md', workspace))
    await symlink('/etc/passwd', join(skillPath, 'references', 'external.md'))
    await assert.rejects(() => loadAiAgentSkill('summarize', 'references/external.md', workspace))
  })

  test('removes a skill from the CLI workspace so it disappears from the list', async ({
    assert,
  }) => {
    const { workspace } = await createSkillWorkspace()
    await updateAiAgentSkill('summarize', true, workspace)

    await removeAiAgentSkill('summarize', workspace)

    const listedSkills = await listAiAgentSkills(1, 20, workspace)
    assert.deepEqual(listedSkills.items, [])
    assert.deepEqual(await listEnabledAiAgentSkills(workspace), [])
  })

  test('executes enabled skill scripts in the OS sandbox', async ({ assert }) => {
    const { workspace, skillPath } = await createSkillWorkspace()
    await mkdir(join(skillPath, 'scripts'), { recursive: true })
    await writeFile(
      join(skillPath, 'SKILL.md'),
      '---\nname: Summarize\ndescription: Create concise summaries.\nallowed-tools: Bash(node:*)\n---\nRun the bundled script.\n'
    )
    await writeFile(
      join(skillPath, 'scripts', 'index.mjs'),
      "console.log(process.argv.slice(2).join('|'))\n"
    )
    await mkdir(join(skillPath, 'helpers'), { recursive: true })
    await writeFile(join(skillPath, 'helpers', 'ping.mjs'), "console.log('pong')\n")

    await updateAiAgentSkill('summarize', true, workspace)
    assert.deepEqual(await getAiAgentSkillCapabilities('summarize', workspace), [])
    assert.deepEqual(await listAiAgentSkillScripts('summarize', workspace), [
      'helpers/ping.mjs',
      'scripts/index.mjs',
    ])
    const result = await runAiAgentSkillCommand(
      'summarize',
      'scripts/index.mjs',
      ['ping', 'pong'],
      workspace
    )
    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, 'ping|pong\n')
    assert.equal(result.scriptPath, 'scripts/index.mjs')
    await assert.rejects(
      () => runAiAgentSkillCommand('summarize', 'references/guide.md', [], workspace),
      /必须是 JavaScript 文件/
    )
    await assert.rejects(
      () => runAiAgentSkillCommand('summarize', '/etc/passwd', [], workspace),
      /技能资源路径无效/
    )
    const literalArgumentResult = await runAiAgentSkillCommand(
      'summarize',
      'scripts/index.mjs',
      ['ping; whoami'],
      workspace
    )
    assert.equal(literalArgumentResult.stdout, 'ping; whoami\n')
  })

  test('limits skill script filesystem access to its skill and temporary directories', async ({
    assert,
  }) => {
    const { workspace, skillPath } = await createSkillWorkspace()
    await mkdir(join(skillPath, 'scripts'), { recursive: true })
    await writeFile(
      join(skillPath, 'scripts', 'access.mjs'),
      [
        "import { readFileSync, writeFileSync } from 'node:fs'",
        'const checks = []',
        "try { readFileSync(process.argv[2]); checks.push('outside-readable') } catch { checks.push('outside-denied') }",
        "try { writeFileSync(process.argv[3], 'changed'); checks.push('skill-writable') } catch { checks.push('skill-write-denied') }",
        "try { writeFileSync(`${process.env.TMPDIR}/sandbox-check`, 'ok'); checks.push('temp-write-allowed') } catch (error) { checks.push(`temp-denied-${error.permission}-${error.resource}`) }",
        "console.log(checks.join('|'))",
      ].join('\n')
    )
    await updateAiAgentSkill('summarize', true, workspace)

    const result = await runAiAgentSkillCommand(
      'summarize',
      'scripts/access.mjs',
      [join(process.cwd(), 'package.json'), join(skillPath, 'SKILL.md')],
      workspace
    )

    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, 'outside-denied|skill-write-denied|temp-write-allowed\n')
  })

  test('reads only supported runtime capabilities from enabled skill metadata', async ({
    assert,
  }) => {
    const { workspace, skillPath } = await createSkillWorkspace()
    await writeFile(
      join(skillPath, 'SKILL.md'),
      '---\nname: Summarize\ndescription: Create concise summaries.\nassistant-capabilities:\n  - system-status\n---\nUse service status.\n'
    )
    await updateAiAgentSkill('summarize', true, workspace)
    assert.deepEqual(await getAiAgentSkillCapabilities('summarize', workspace), ['system-status'])
    await writeFile(
      join(skillPath, 'SKILL.md'),
      '---\nname: Summarize\ndescription: Create concise summaries.\nassistant-capabilities:\n  - shell\n---\n'
    )
    await assert.rejects(() => getAiAgentSkillCapabilities('summarize', workspace), /不支持/)
  })

  test('uses the assistant-config enable switch as the only script run gate', async ({
    assert,
  }) => {
    const { workspace, skillPath } = await createSkillWorkspace()
    await mkdir(join(skillPath, 'scripts'), { recursive: true })
    await writeFile(join(skillPath, 'scripts', 'index.mjs'), "console.log('should not run')\n")
    await updateAiAgentSkill('summarize', true, workspace)

    const result = await runAiAgentSkillCommand('summarize', 'scripts/index.mjs', [], workspace)
    assert.equal(result.exitCode, 0)
    assert.equal(result.stdout, 'should not run\n')

    await updateAiAgentSkill('summarize', false, workspace)
    await assert.rejects(
      () => runAiAgentSkillCommand('summarize', 'scripts/index.mjs', [], workspace),
      /技能不存在/
    )
  })
})
