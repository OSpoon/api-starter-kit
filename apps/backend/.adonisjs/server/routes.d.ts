import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'wecom.messages.send': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'openapi.html': { paramsTuple?: []; params?: {} }
    'openapi.json': { paramsTuple?: []; params?: {} }
    'openapi.yaml': { paramsTuple?: []; params?: {} }
    'auth.signup': { paramsTuple?: []; params?: {} }
    'auth.login': { paramsTuple?: []; params?: {} }
    'auth.github.redirect': { paramsTuple?: []; params?: {} }
    'auth.github.callback': { paramsTuple?: []; params?: {} }
    'auth.github.exchange': { paramsTuple?: []; params?: {} }
    'auth.2fa.verify': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'profile.profile.change_password': { paramsTuple?: []; params?: {} }
    'profile.2fa.generate': { paramsTuple?: []; params?: {} }
    'profile.2fa.enable': { paramsTuple?: []; params?: {} }
    'profile.profile.disable_two_factor': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'api_keys.index': { paramsTuple?: []; params?: {} }
    'api_keys.store': { paramsTuple?: []; params?: {} }
    'api_keys.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'api_keys.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'wecom_message_templates.index': { paramsTuple?: []; params?: {} }
    'wecom_message_templates.store': { paramsTuple?: []; params?: {} }
    'wecom_message_templates.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'wecom_message_templates.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'wecom_message_templates.test_send': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'system.wecom.messages.send': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'knowledge_documents.index': { paramsTuple?: []; params?: {} }
    'knowledge_documents.store': { paramsTuple?: []; params?: {} }
    'knowledge_documents.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'knowledge_documents.reindex': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'knowledge_documents.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.index': { paramsTuple?: []; params?: {} }
    'users.store': { paramsTuple?: []; params?: {} }
    'users.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.reset_password': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'roles.catalog': { paramsTuple?: []; params?: {} }
    'roles.index': { paramsTuple?: []; params?: {} }
    'roles.store': { paramsTuple?: []; params?: {} }
    'roles.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'roles.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'permissions.catalog': { paramsTuple?: []; params?: {} }
    'permissions.index': { paramsTuple?: []; params?: {} }
    'permissions.store': { paramsTuple?: []; params?: {} }
    'permissions.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'permissions.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'audit_logs.index': { paramsTuple?: []; params?: {} }
    'ai_chat.index': { paramsTuple?: []; params?: {} }
    'ai_chat.store': { paramsTuple?: []; params?: {} }
    'ai_chat.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ai_chat.send_message': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ai_chat.resume': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ai_chat.confirm_ai_agent_action': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'confirmationId': ParamValue} }
    'ai_chat.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  POST: {
    'wecom.messages.send': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'auth.signup': { paramsTuple?: []; params?: {} }
    'auth.login': { paramsTuple?: []; params?: {} }
    'auth.github.exchange': { paramsTuple?: []; params?: {} }
    'auth.2fa.verify': { paramsTuple?: []; params?: {} }
    'profile.2fa.generate': { paramsTuple?: []; params?: {} }
    'profile.2fa.enable': { paramsTuple?: []; params?: {} }
    'profile.profile.disable_two_factor': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'api_keys.store': { paramsTuple?: []; params?: {} }
    'wecom_message_templates.store': { paramsTuple?: []; params?: {} }
    'wecom_message_templates.test_send': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'system.wecom.messages.send': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'knowledge_documents.store': { paramsTuple?: []; params?: {} }
    'knowledge_documents.reindex': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.store': { paramsTuple?: []; params?: {} }
    'users.reset_password': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'roles.store': { paramsTuple?: []; params?: {} }
    'permissions.store': { paramsTuple?: []; params?: {} }
    'ai_chat.store': { paramsTuple?: []; params?: {} }
    'ai_chat.send_message': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ai_chat.resume': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ai_chat.confirm_ai_agent_action': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'confirmationId': ParamValue} }
  }
  GET: {
    'openapi.html': { paramsTuple?: []; params?: {} }
    'openapi.json': { paramsTuple?: []; params?: {} }
    'openapi.yaml': { paramsTuple?: []; params?: {} }
    'auth.github.redirect': { paramsTuple?: []; params?: {} }
    'auth.github.callback': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'api_keys.index': { paramsTuple?: []; params?: {} }
    'wecom_message_templates.index': { paramsTuple?: []; params?: {} }
    'knowledge_documents.index': { paramsTuple?: []; params?: {} }
    'users.index': { paramsTuple?: []; params?: {} }
    'roles.catalog': { paramsTuple?: []; params?: {} }
    'roles.index': { paramsTuple?: []; params?: {} }
    'permissions.catalog': { paramsTuple?: []; params?: {} }
    'permissions.index': { paramsTuple?: []; params?: {} }
    'audit_logs.index': { paramsTuple?: []; params?: {} }
    'ai_chat.index': { paramsTuple?: []; params?: {} }
    'ai_chat.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  HEAD: {
    'openapi.html': { paramsTuple?: []; params?: {} }
    'openapi.json': { paramsTuple?: []; params?: {} }
    'openapi.yaml': { paramsTuple?: []; params?: {} }
    'auth.github.redirect': { paramsTuple?: []; params?: {} }
    'auth.github.callback': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'api_keys.index': { paramsTuple?: []; params?: {} }
    'wecom_message_templates.index': { paramsTuple?: []; params?: {} }
    'knowledge_documents.index': { paramsTuple?: []; params?: {} }
    'users.index': { paramsTuple?: []; params?: {} }
    'roles.catalog': { paramsTuple?: []; params?: {} }
    'roles.index': { paramsTuple?: []; params?: {} }
    'permissions.catalog': { paramsTuple?: []; params?: {} }
    'permissions.index': { paramsTuple?: []; params?: {} }
    'audit_logs.index': { paramsTuple?: []; params?: {} }
    'ai_chat.index': { paramsTuple?: []; params?: {} }
    'ai_chat.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PUT: {
    'profile.profile.change_password': { paramsTuple?: []; params?: {} }
    'api_keys.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'wecom_message_templates.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'knowledge_documents.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'roles.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'permissions.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'api_keys.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'wecom_message_templates.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'knowledge_documents.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'roles.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'permissions.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ai_chat.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}