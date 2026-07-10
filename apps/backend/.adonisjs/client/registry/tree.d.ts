/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  openapi: {
    html: typeof routes['openapi.html']
    json: typeof routes['openapi.json']
    yaml: typeof routes['openapi.yaml']
  }
  auth: {
    newAccount: {
      store: typeof routes['auth.new_account.store']
    }
    accessTokens: {
      store: typeof routes['auth.access_tokens.store']
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
    2Fa: {
      generate: typeof routes['profile.2fa.generate']
      enable: typeof routes['profile.2fa.enable']
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
  aiChat: {
    index: typeof routes['ai_chat.index']
    store: typeof routes['ai_chat.store']
    show: typeof routes['ai_chat.show']
    sendMessage: typeof routes['ai_chat.send_message']
    destroy: typeof routes['ai_chat.destroy']
  }
}
