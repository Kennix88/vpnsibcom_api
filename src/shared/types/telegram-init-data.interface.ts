export interface TelegramInitDataInterface {
  auth_date: Date | number
  can_send_after?: number
  start_param?: string
  chat_type?: 'group' | 'supergroup' | 'private' | 'channel' | 'sender'
  chat_instance?: string
  hash: string
  query_id?: string
  receiver?: TelegramInitDataUserInterface
  chat?: TelegramInitDataChatInterface
  user?: TelegramInitDataUserInterface
}

export interface TelegramInitDataUserInterface {
  added_to_attachment_menu?: boolean
  allows_write_to_pm?: boolean
  is_premium?: boolean
  first_name: string
  id: number | string
  is_bot?: boolean
  last_name?: string
  language_code?: string
  photo_url?: string
  username?: string
}

export interface TelegramInitDataChatInterface {
  id: number
  type: 'group' | 'supergroup' | 'channel'
  title: string
  photo_url?: string
  username?: string
}
