/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  wecom: {
    messages: {
      send: typeof routes['wecom.messages.send']
    }
  }
  openapi: {
    html: typeof routes['openapi.html']
    json: typeof routes['openapi.json']
    yaml: typeof routes['openapi.yaml']
  }
  auth: {
    signup: typeof routes['auth.signup']
    login: typeof routes['auth.login']
    github: {
      redirect: typeof routes['auth.github.redirect']
      callback: typeof routes['auth.github.callback']
      exchange: typeof routes['auth.github.exchange']
      complete: typeof routes['auth.github.complete']
    }
    2Fa: {
      verify: typeof routes['auth.2fa.verify']
    }
  }
  profile: {
    profile: {
      show: typeof routes['profile.profile.show']
      changePassword: typeof routes['profile.profile.change_password']
      disableTwoFactor: typeof routes['profile.profile.disable_two_factor']
    }
    github: {
      unlink: typeof routes['profile.github.unlink']
      link: typeof routes['profile.github.link']
    }
    2Fa: {
      generate: typeof routes['profile.2fa.generate']
      enable: typeof routes['profile.2fa.enable']
    }
    channelIdentities: {
      bind: typeof routes['profile.channel_identities.bind']
      unbindWecom: typeof routes['profile.channel_identities.unbind_wecom']
      unbindFeishu: typeof routes['profile.channel_identities.unbind_feishu']
      unbindDingtalk: typeof routes['profile.channel_identities.unbind_dingtalk']
    }
    accessTokens: {
      destroy: typeof routes['profile.access_tokens.destroy']
    }
  }
  apiKeys: {
    index: typeof routes['api_keys.index']
    store: typeof routes['api_keys.store']
    update: typeof routes['api_keys.update']
    destroy: typeof routes['api_keys.destroy']
  }
  llmConfigurations: {
    show: typeof routes['llm_configurations.show']
    update: typeof routes['llm_configurations.update']
    test: typeof routes['llm_configurations.test']
  }
  imConfigurations: {
    show: typeof routes['im_configurations.show']
    update: typeof routes['im_configurations.update']
  }
  wecomMessageTemplates: {
    index: typeof routes['wecom_message_templates.index']
    store: typeof routes['wecom_message_templates.store']
    update: typeof routes['wecom_message_templates.update']
    destroy: typeof routes['wecom_message_templates.destroy']
    testSend: typeof routes['wecom_message_templates.test_send']
  }
  system: {
    wecom: {
      messages: {
        send: typeof routes['system.wecom.messages.send']
      }
    }
  }
  knowledgeDocuments: {
    index: typeof routes['knowledge_documents.index']
    store: typeof routes['knowledge_documents.store']
    storeBatch: typeof routes['knowledge_documents.store_batch']
    update: typeof routes['knowledge_documents.update']
    reindex: typeof routes['knowledge_documents.reindex']
    destroy: typeof routes['knowledge_documents.destroy']
  }
  systemStatus: {
    show: typeof routes['system_status.show']
  }
  users: {
    index: typeof routes['users.index']
    store: typeof routes['users.store']
    update: typeof routes['users.update']
    resetPassword: typeof routes['users.reset_password']
    destroy: typeof routes['users.destroy']
  }
  roles: {
    catalog: typeof routes['roles.catalog']
    index: typeof routes['roles.index']
    store: typeof routes['roles.store']
    update: typeof routes['roles.update']
    destroy: typeof routes['roles.destroy']
  }
  permissions: {
    catalog: typeof routes['permissions.catalog']
    index: typeof routes['permissions.index']
    store: typeof routes['permissions.store']
    update: typeof routes['permissions.update']
    destroy: typeof routes['permissions.destroy']
  }
  auditLogs: {
    index: typeof routes['audit_logs.index']
  }
  aiChat: {
    index: typeof routes['ai_chat.index']
    store: typeof routes['ai_chat.store']
    show: typeof routes['ai_chat.show']
    transcribe: typeof routes['ai_chat.transcribe']
    sendMessage: typeof routes['ai_chat.send_message']
    steer: typeof routes['ai_chat.steer']
    followUp: typeof routes['ai_chat.follow_up']
    confirmAiAgentAction: typeof routes['ai_chat.confirm_ai_agent_action']
    destroy: typeof routes['ai_chat.destroy']
  }
}
