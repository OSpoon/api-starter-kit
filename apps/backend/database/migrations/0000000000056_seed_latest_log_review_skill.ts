import { BaseSchema } from '@adonisjs/lucid/schema'

const code = 'latest-log-review'
const name = '日志查询与异常检查'
const instructions = `适用于用户询问最新、最近日志，或判断日志是否异常的请求。
先查询可用服务，再按服务读取真实日志记录。
只依据查询返回的记录和范围作答，不把服务发现当作日志结果。

## 查询流程
1. 调用 list_log_services 获取准确的服务名。用户指定了服务时使用该准确名称；只有一个服务时直接使用，不要追问。
2. 用户只问最新一条时，对目标服务调用 get_latest_log，省略级别和其他可选筛选。
3. 用户询问日志是否异常时，对每个目标服务调用 search_logs，读取最新 20 条；省略级别和时间筛选，除非用户明确指定范围或级别。若只查询了部分服务或记录，明确说明范围。
4. 多个服务且用户未指定服务时，逐个查询各服务后汇总；不要把单个服务的结果说成全局结论。
5. 如果服务列表为空、没有匹配记录、工具不可用或查询失败，说明实际情况；不要据此声称日志正常。

## 判断与答复
- error 和 fatal 作为错误报告，warn 作为警告；其他级别须结合消息判断，不要仅凭级别定性。
- 优先使用 timestampLocal，并说明服务、级别和消息要点。search_logs 返回的 items 按时间从新到旧排列。
- 仅当检查结果覆盖的记录中没有明显异常时，表述“检查的最近记录中未见明显异常”，并说明服务和记录范围；不得声称完整日志无异常。
- 用用户的语言简洁回答，不输出原始 JSON。`
const description = instructions
  .split(/\r?\n/)
  .filter((line) => line.trim() && !/^#{1,6}(?:\s|$)/.test(line))
  .slice(0, 3)
  .join(' ')

export default class extends BaseSchema {
  async up() {
    const now = new Date()
    await this.db
      .table('ai_agent_skills')
      .insert({
        code,
        name,
        description,
        instructions,
        enabled: true,
        created_at: now,
        updated_at: now,
      })
      .onConflict('code')
      .ignore()
  }

  async down() {
    await this.db
      .from('ai_agent_skills')
      .where({ code, name, description, instructions, enabled: true })
      .delete()
  }
}
