import type { ChannelName } from '#models/channel_identity'

export type NormalizedMessageType = 'text' | 'image' | 'file' | 'voice'

export interface NormalizedInboundMessage {
  channel: ChannelName
  externalTenantId: string
  externalUserId: string
  conversationKey: string
  messageId: string
  messageType: NormalizedMessageType
  content: string
  receivedAt: Date
  raw?: unknown
}

export interface ChannelTarget {
  channel: ChannelName
  externalTenantId: string
  conversationKey: string
}

export interface TextOutboundMessage {
  kind: 'text'
  content: string
}

export interface ConfirmationOutboundMessage {
  kind: 'confirmation'
  title: string
  description: string
  confirmationId: string
  confirmLabel: string
  cancelLabel: string
}

export type OutboundMessage = TextOutboundMessage | ConfirmationOutboundMessage

export interface ChannelAdapter {
  readonly channel: ChannelName
  readonly tenantId: string
  start(): Promise<void>
  stop(): Promise<void>
  send(target: ChannelTarget, message: OutboundMessage): Promise<void>
}
