export interface UserInBotInterface {
  /** Unique identifier for this user or bot. */
  id: number
  /** True, if this user is a bot */
  is_bot: boolean
  /** User's or bot's first name */
  first_name: string
  /** User's or bot's last name */
  last_name?: string
  /** User's or bot's username */
  username?: string
  /** IETF language tag of the user's language */
  language_code?: string
  /** True, if this user is a Telegram Premium user */
  is_premium?: true
  /** True, if this user added the bot to the attachment menu */
  added_to_attachment_menu?: true
}
