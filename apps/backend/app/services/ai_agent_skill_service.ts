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

export async function listEnabledAiAgentSkills() {
  const skills: AiAgentSkill[] = []
  let page = 1
  while (true) {
    const result = await AiAgentSkill.query()
      .where('enabled', true)
      .orderBy('id', 'asc')
      .paginate(page, 100)
    skills.push(...result.all())
    if (page >= result.lastPage) break
    page += 1
  }
  return skills
}

export async function loadAiAgentSkill(code: string) {
  return AiAgentSkill.query().where('code', code).where('enabled', true).first()
}

export function serializeAiAgentSkill(skill: AiAgentSkill) {
  return {
    id: skill.id,
    code: skill.code,
    name: skill.name,
    description: skill.description,
    instructions: skill.instructions,
    enabled: skill.enabled,
    updatedAt: skill.updatedAt.toISO(),
  }
}
