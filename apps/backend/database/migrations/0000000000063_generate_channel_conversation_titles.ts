import { BaseSchema } from '@adonisjs/lucid/schema'

type ChannelConversationTitleRow = {
  id: number
  channel: 'dingtalk' | 'feishu' | 'wecom'
  title: string
  content: string
}

function createMigrationTitle(content: string) {
  // Keep the backfill stable if the runtime title format changes later.
  const title = content.replace(/\s+/g, ' ').trim()
  return title.length > 60 ? `${title.slice(0, 57)}...` : title || 'New chat'
}

async function getChannelConversationTitles(
  db: { rawQuery: (query: string) => Promise<unknown> },
  direction: 'up' | 'down'
) {
  const titleCondition =
    direction === 'up'
      ? "conversation.title = channel_conversation.channel || ' assistant'"
      : "conversation.title <> channel_conversation.channel || ' assistant'"
  const result = (await db.rawQuery(`
    SELECT DISTINCT ON (conversation.id)
      conversation.id,
      channel_conversation.channel,
      conversation.title,
      message.content
    FROM channel_conversations AS channel_conversation
    JOIN ai_chat_conversations AS conversation
      ON conversation.id = channel_conversation.conversation_id
    JOIN ai_chat_messages AS message
      ON message.conversation_id = conversation.id AND message.role = 'user'
    WHERE ${titleCondition}
    ORDER BY conversation.id, message.id ASC
  `)) as { rows?: ChannelConversationTitleRow[] }
  return result.rows ?? []
}

export default class extends BaseSchema {
  async up() {
    for (const row of await getChannelConversationTitles(this.db, 'up')) {
      const initialTitle = `${row.channel} assistant`
      const title = createMigrationTitle(row.content)
      if (title === initialTitle) continue

      await this.db
        .from('ai_chat_conversations')
        .where('id', row.id)
        .where('title', initialTitle)
        .update({ title })
    }
  }

  async down() {
    for (const row of await getChannelConversationTitles(this.db, 'down')) {
      const initialTitle = `${row.channel} assistant`
      if (row.title !== createMigrationTitle(row.content)) continue

      await this.db
        .from('ai_chat_conversations')
        .where('id', row.id)
        .where('title', row.title)
        .update({ title: initialTitle })
    }
  }
}
