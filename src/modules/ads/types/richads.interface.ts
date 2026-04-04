export interface RichAdsGetAdRequestInterface {
  language_code: string
  publisher_id: string
  widget_id?: string
  bid_floor?: number
  telegram_id?: string
  production?: boolean
}

export interface RichAdsGetAdResponseInterface {
  title: string
  message: string
  image: string
  image_preload: string
  notification_url: string
  link: string
  brand: string
  button: string
  bid_price: number
}
