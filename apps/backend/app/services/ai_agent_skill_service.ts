import AiAgentSkill from '#models/ai_agent_skill'

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
