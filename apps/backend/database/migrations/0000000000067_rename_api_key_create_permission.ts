import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db
      .from('permissions')
      .where('code', 'api-keys:create')
      .update({ name: '创建 AI 助手密钥', updated_at: new Date() })
  }

  async down() {
    await this.db
      .from('permissions')
      .where('code', 'api-keys:create')
      .update({ name: '创建全局 AI 助手密钥', updated_at: new Date() })
  }
}
