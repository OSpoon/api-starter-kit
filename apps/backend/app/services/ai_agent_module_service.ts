import AiAgentSkill from '#models/ai_agent_skill'

type SkillInput = {
  code: string
  name: string
  instructions: string
  enabled: boolean
}

function describeAiAgentSkill(markdown: string) {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}(?:\s|$)/.test(line))
  const fallbackLines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^#{1,6}\s*/, ''))
    .filter(Boolean)
  const summary = (lines.length ? lines : fallbackLines)
    .slice(0, 3)
    .join(' ')
    .replace(/[*_`~]/g, '')
    .trim()
  return [...summary].slice(0, 1024).join('')
}

export async function listAiAgentSkills(page: number, limit: number) {
  const paginator = await AiAgentSkill.query()
    .orderBy('updated_at', 'desc')
    .orderBy('id', 'desc')
    .paginate(page, limit)
  return { items: paginator.all(), meta: paginator.getMeta() }
}

export async function createAiAgentSkill(input: SkillInput) {
  return AiAgentSkill.create({
    ...input,
    description: describeAiAgentSkill(input.instructions),
  })
}

export async function getAiAgentSkill(id: number) {
  return AiAgentSkill.findOrFail(id)
}

export async function updateAiAgentSkill(id: number, input: Partial<SkillInput>) {
  const skill = await AiAgentSkill.findOrFail(id)
  skill.merge({
    ...input,
    ...(input.instructions === undefined
      ? {}
      : { description: describeAiAgentSkill(input.instructions) }),
  })
  await skill.save()
  return skill
}

export async function deleteAiAgentSkill(id: number) {
  const skill = await AiAgentSkill.findOrFail(id)
  await skill.delete()
}
