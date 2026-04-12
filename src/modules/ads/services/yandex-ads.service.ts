import { Injectable } from '@nestjs/common'
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { createHash } from 'node:crypto'

export type YandexAdsRegion = 'eu' | 'us'

export type YandexAdsWidgetType =
  | 'PUSH_STYLE'
  | 'EMBEDDED_BANNER'
  | 'INTERSTITIAL_MIXED'
  | string

export interface YandexAdsInitOptions {
  pubId?: string | number
  appId?: string | number
  region?: YandexAdsRegion | 'auto'
  debug?: boolean
}

export interface YandexAdsUserData {
  telegramId: string | number
  firstName?: string | null
  lastName?: string | null
  languageCode?: string | null
  premium?: boolean | null
  version?: string | null
  platform?: string | null
  sourceId?: string | null
  userAgent?: string | null
}

export interface YandexAdsTrackingRequest {
  url: string
  method?: 'GET' | 'POST'
  body?: unknown
  headers?: Record<string, string>
}

export interface YandexAdsTrackingResult {
  url: string
  method: 'GET' | 'POST'
  success: boolean
  status?: number
  data?: unknown
  error?: string
}

export interface YandexAdsWidgetRuntimeConfig {
  ssp_id?: number | string
}

export interface YandexAdsAppRuntimeConfig {
  widgetTypes?: Record<string, number | string>
  activeWidgetTypes?: string[]
  pushStyleAutoMode?: boolean
  embeddedBannerAutoMode?: boolean
  interstitialMixedAutoMode?: boolean
  isPremium?: boolean
  interstitialBannerOldStyleEnabled?: boolean
  interstitialVideoOldStyleEnabled?: boolean
  [key: string]: unknown
}

export interface YandexAdsTelegramConfig {
  limit_impression_per_interval?: number
  limit_impression_per_view?: number
  impression_interval?: number
  impression_delay?: number
  restart_limit_impressions?: boolean
  widget?: Record<string, YandexAdsWidgetRuntimeConfig>
  app_id?: Record<string, YandexAdsAppRuntimeConfig>
  [key: string]: unknown
}

export interface YandexAdsConfig {
  publisher?: number | string
  telegram?: YandexAdsTelegramConfig
  [key: string]: unknown
}

export interface YandexAdsResolvedWidget {
  widgetType: string
  widgetId: string
  sspId: string
  bidFloor: number
  isActive: boolean
  endpoint: string
  cssConfigUrl: string
}

export interface YandexAdsRequestPayload {
  publisher_id: string
  bid_floor: number
  user_agent: string
  language_code: string
  premium: boolean
  last_name: string
  firstName: string
  telegram_id: string
  version: string
  platform: string
  source_id: string
  debug?: boolean
}

export interface YandexAdsNormalizedTracking {
  impression: string[]
  click: string[]
  notificationUrl: string | null
  clickUrl: string | null
}

export interface YandexAdsNormalizedAd {
  index: number
  creativeType: string | null
  title: string | null
  description: string | null
  image: string | null
  banner: string | null
  icon: string | null
  brand: string | null
  button: string | null
  message: string | null
  html: string | null
  vastXml: string | null
  vastUrl: string | null
  targetUrl: string | null
  tracking: YandexAdsNormalizedTracking
  raw: Record<string, unknown>
}

export interface YandexAdsFetchOptions extends YandexAdsInitOptions {
  widgetType?: YandexAdsWidgetType
  widgetId?: string | number
  sspId?: string | number
  bidFloor?: number
  config?: YandexAdsConfig
  user: YandexAdsUserData
  log?: boolean
}

export interface YandexAdsFetchResult {
  pubId: string
  appId: string
  region: YandexAdsRegion
  configUrl: string
  rawConfig: YandexAdsConfig
  appConfig: YandexAdsAppRuntimeConfig
  widget: YandexAdsResolvedWidget
  requestBody: YandexAdsRequestPayload
  rawAds: Record<string, unknown>[]
  ads: YandexAdsNormalizedAd[]
}

type TrackingSource =
  | string
  | null
  | undefined
  | YandexAdsTrackingRequest
  | Array<string | YandexAdsTrackingRequest | null | undefined>

@Injectable()
export class YandexAdsService {
  public static readonly DEFAULT_PUB_ID = '1001262'
  public static readonly DEFAULT_APP_ID = '6023'

  public static readonly URLS = {
    CONFIG_BASE_URL: 'https://cdn.adx1.com/publisher-config/',
    MD5_SCRIPT_URL: 'https://7ool.net/richpartners/pops/js/md5.js',
    TELEGRAM_BID_BASE_ENDPOINT_EU:
      'https://{{ssp_id}}.xml.4armn.com/telegram-bid',
    TELEGRAM_BID_BASE_ENDPOINT_US:
      'https://{{ssp_id}}.xml.adx1.com/telegram-bid',
  } as const

  public static readonly DEFAULT_BID_FLOOR_BY_WIDGET_TYPE: Record<
    string,
    number
  > = {
    PUSH_STYLE: 0.0001,
    EMBEDDED_BANNER: 0.05,
    INTERSTITIAL_MIXED: 0.2,
  }

  private readonly http: AxiosInstance

  constructor(private readonly logger: PinoLogger) {
    this.http = axios.create({
      timeout: 20000,
      validateStatus: () => true,
    })
  }

  public getJsonConfigUrl(
    pubId: string | number = YandexAdsService.DEFAULT_PUB_ID,
  ) {
    return `${
      YandexAdsService.URLS.CONFIG_BASE_URL
    }${this.getPublisherConfigHash(pubId)}.json`
  }

  public getCssConfigUrl(args: {
    pubId?: string | number
    widgetId: string | number
  }) {
    const pubId = String(args.pubId ?? YandexAdsService.DEFAULT_PUB_ID)
    return `${YandexAdsService.URLS.CONFIG_BASE_URL}${pubId}-${String(
      args.widgetId,
    )}.css`
  }

  public getPublisherConfigHash(
    pubId: string | number = YandexAdsService.DEFAULT_PUB_ID,
  ) {
    return createHash('md5').update(String(pubId)).digest('hex')
  }

  public getFetchAdsEndpointBySspId(
    sspId: string | number,
    region: YandexAdsRegion = 'eu',
  ) {
    const template =
      region === 'us'
        ? YandexAdsService.URLS.TELEGRAM_BID_BASE_ENDPOINT_US
        : YandexAdsService.URLS.TELEGRAM_BID_BASE_ENDPOINT_EU

    return template.replace('{{ssp_id}}', String(sspId))
  }

  public async fetchConfig(
    init: YandexAdsInitOptions = {},
  ): Promise<YandexAdsConfig> {
    const pubId = String(init.pubId ?? YandexAdsService.DEFAULT_PUB_ID)
    const url = this.getJsonConfigUrl(pubId)

    this.logger.info(
      {
        msg: 'YandexAds fetch config',
        pubId,
        url,
      },
      'YandexAds config request',
    )

    const response = await this.http.get(url, {
      headers: {
        accept: 'application/json',
      },
    })

    if (response.status < 200 || response.status >= 300) {
      this.logger.warn(
        {
          msg: 'YandexAds config request failed',
          pubId,
          url,
          status: response.status,
          data: response.data,
        },
        'YandexAds config request failed',
      )
      throw new Error(
        `Yandex config request failed with status ${response.status} for ${url}`,
      )
    }

    if (!this.isRecord(response.data)) {
      this.logger.warn(
        {
          msg: 'YandexAds config response is not object',
          pubId,
          url,
          status: response.status,
          data: response.data,
        },
        'YandexAds config response invalid',
      )
      throw new Error(`Yandex config response is not an object for ${url}`)
    }

    this.logger.info(
      {
        msg: 'YandexAds config loaded',
        pubId,
        url,
        status: response.status,
        hasTelegram: Boolean(response.data.telegram),
        appIds: this.isRecord(response.data.telegram?.app_id)
          ? Object.keys(response.data.telegram.app_id)
          : [],
      },
      'YandexAds config loaded',
    )

    return response.data as YandexAdsConfig
  }

  public resolveAppConfig(args: {
    config: YandexAdsConfig
    appId?: string | number
  }): YandexAdsAppRuntimeConfig {
    const appId = String(args.appId ?? YandexAdsService.DEFAULT_APP_ID)
    const appConfig = args.config?.telegram?.app_id?.[appId]

    if (!this.isRecord(appConfig)) {
      throw new Error(`Yandex app config not found for appId=${appId}`)
    }

    return appConfig as YandexAdsAppRuntimeConfig
  }

  public getActiveWidgetTypes(args: {
    config: YandexAdsConfig
    appId?: string | number
  }) {
    const appConfig = this.resolveAppConfig(args)
    const active = Array.isArray(appConfig.activeWidgetTypes)
      ? appConfig.activeWidgetTypes.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
      : []

    if (active.length > 0) {
      return active
    }

    return Object.keys(appConfig.widgetTypes ?? {})
  }

  public resolveWidget(args: {
    config: YandexAdsConfig
    appId?: string | number
    widgetType?: YandexAdsWidgetType
    widgetId?: string | number
    sspId?: string | number
    bidFloor?: number
    region?: YandexAdsRegion | 'auto'
  }): YandexAdsResolvedWidget {
    const region = this.resolveRegion(args.region)
    const appConfig = this.resolveAppConfig(args)
    const activeWidgetTypes = this.getActiveWidgetTypes(args)

    const widgetType =
      args.widgetType ??
      activeWidgetTypes[0] ??
      Object.keys(appConfig.widgetTypes ?? {})[0]

    if (!widgetType) {
      throw new Error('Yandex widget type cannot be resolved from config')
    }

    const widgetId =
      args.widgetId ??
      appConfig.widgetTypes?.[widgetType] ??
      (appConfig as Record<string, unknown>)[widgetType]

    if (widgetId === undefined || widgetId === null) {
      throw new Error(
        `Yandex widgetId not found for widgetType=${String(widgetType)}`,
      )
    }

    const widgetRuntime = args.config?.telegram?.widget?.[String(widgetId)]
    const sspId = args.sspId ?? widgetRuntime?.ssp_id

    if (sspId === undefined || sspId === null) {
      throw new Error(
        `Yandex ssp_id not found for widgetId=${String(widgetId)}`,
      )
    }

    const bidFloor =
      args.bidFloor ??
      YandexAdsService.DEFAULT_BID_FLOOR_BY_WIDGET_TYPE[String(widgetType)] ??
      0

    return {
      widgetType: String(widgetType),
      widgetId: String(widgetId),
      sspId: String(sspId),
      bidFloor,
      isActive: activeWidgetTypes.includes(String(widgetType)),
      endpoint: this.getFetchAdsEndpointBySspId(String(sspId), region),
      cssConfigUrl: this.getCssConfigUrl({
        widgetId: String(widgetId),
      }),
    }
  }

  public buildRequestPayload(args: {
    pubId?: string | number
    bidFloor: number
    user: YandexAdsUserData
    debug?: boolean
  }): YandexAdsRequestPayload {
    return {
      publisher_id: String(args.pubId ?? YandexAdsService.DEFAULT_PUB_ID),
      bid_floor: args.bidFloor,
      user_agent:
        args.user.userAgent ??
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      language_code: args.user.languageCode ?? 'en',
      premium: Boolean(args.user.premium ?? false),
      last_name: args.user.lastName ?? '',
      firstName: args.user.firstName ?? 'publisher',
      telegram_id: String(args.user.telegramId),
      version: args.user.version ?? '8.0',
      platform: args.user.platform ?? 'telegram-web',
      source_id: args.user.sourceId ?? '',
      ...(args.debug !== undefined ? { debug: args.debug } : {}),
    }
  }

  public async fetchAds(
    args: YandexAdsFetchOptions,
  ): Promise<YandexAdsFetchResult> {
    const pubId = String(args.pubId ?? YandexAdsService.DEFAULT_PUB_ID)
    const appId = String(args.appId ?? YandexAdsService.DEFAULT_APP_ID)
    const region = this.resolveRegion(args.region)
    const config = args.config ?? (await this.fetchConfig({ pubId }))
    const appConfig = this.resolveAppConfig({ config, appId })
    const widget = this.resolveWidget({
      config,
      appId,
      widgetType: args.widgetType,
      widgetId: args.widgetId,
      sspId: args.sspId,
      bidFloor: args.bidFloor,
      region,
    })
    const requestBody = this.buildRequestPayload({
      pubId,
      bidFloor: widget.bidFloor,
      user: args.user,
      debug: args.debug,
    })

    if (args.log !== false) {
      this.logger.info(
        {
          msg: 'YandexAds fetch ads',
          pubId,
          appId,
          region,
          endpoint: widget.endpoint,
          widget: {
            widgetType: widget.widgetType,
            widgetId: widget.widgetId,
            sspId: widget.sspId,
            bidFloor: widget.bidFloor,
            isActive: widget.isActive,
          },
          requestBody,
        },
        'YandexAds fetch ads request',
      )
    }

    const response = await this.http.post(widget.endpoint, requestBody, {
      headers: {
        'content-type': 'application/json',
      },
    })

    if (response.status < 200 || response.status >= 300) {
      this.logger.warn(
        {
          msg: 'YandexAds ads request failed',
          pubId,
          appId,
          region,
          endpoint: widget.endpoint,
          status: response.status,
          data: response.data,
        },
        'YandexAds ads request failed',
      )
      throw new Error(
        `Yandex ads request failed with status ${response.status} for ${widget.endpoint}`,
      )
    }

    const rawAds = this.ensureRawAdsArray(response.data)
    const ads = rawAds.map((item, index) => this.normalizeAd(item, index))

    if (args.log !== false) {
      this.logger.info(
        {
          msg: 'YandexAds ads response',
          pubId,
          appId,
          region,
          endpoint: widget.endpoint,
          status: response.status,
          adsCount: ads.length,
          rawCount: rawAds.length,
          sample: ads[0] ? this.summarizeAd(ads[0]) : null,
        },
        'YandexAds ads response',
      )
    }

    if (rawAds.length === 0) {
      this.logger.warn(
        {
          msg: 'YandexAds ads response empty',
          pubId,
          appId,
          region,
          endpoint: widget.endpoint,
        },
        'YandexAds ads response empty',
      )
    }

    return {
      pubId,
      appId,
      region,
      configUrl: this.getJsonConfigUrl(pubId),
      rawConfig: config,
      appConfig,
      widget,
      requestBody,
      rawAds,
      ads,
    }
  }

  public normalizeAd(
    raw: Record<string, unknown>,
    index = 0,
  ): YandexAdsNormalizedAd {
    const notificationUrl = this.pickString(
      raw.notification_url,
      raw.notificationUrl,
    )
    const targetUrl = this.pickString(
      raw.link,
      raw.url,
      raw.target_url,
      raw.targetUrl,
      raw.click_url,
      raw.clickUrl,
    )

    const tracking: YandexAdsNormalizedTracking = {
      notificationUrl,
      clickUrl: this.pickString(
        raw.videoClickTrackerLink,
        raw.video_click_tracker_link,
        raw.click_tracker_url,
        raw.clickTrackerUrl,
      ),
      impression: this.uniqueStrings([
        notificationUrl,
        ...this.extractTrackingEventUrls(raw, [
          'impression',
          'creativeview',
          'view',
          'show',
          'display',
        ]),
      ]),
      click: this.uniqueStrings([
        ...this.extractTrackingEventUrls(raw, ['click', 'clickthrough']),
        ...this.collectStrings(
          raw.videoClickTrackerLink,
          raw.video_click_tracker_link,
          raw.click_tracker_url,
          raw.clickTrackerUrl,
          raw.click_tracking_url,
          raw.clickTrackingUrl,
        ),
      ]),
    }

    return {
      index,
      creativeType: this.pickString(raw.creative_type, raw.creativeType),
      title: this.pickString(raw.title),
      description: this.pickString(raw.description),
      image: this.pickString(raw.image),
      banner: this.pickString(raw.banner),
      icon: this.pickString(raw.icon),
      brand: this.pickString(raw.brand),
      button: this.pickString(raw.button),
      message: this.pickString(raw.message),
      html: this.pickString(raw.html, raw.markup, raw.adm),
      vastXml: this.pickString(raw.vast, raw.vastXml, raw.vast_xml),
      vastUrl: this.pickString(raw.vast_url, raw.vastUrl),
      targetUrl,
      tracking,
      raw,
    }
  }

  public extractImpressionTrackingRequests(
    input:
      | { ad?: Record<string, unknown>; url?: string; urls?: TrackingSource }
      | Record<string, unknown>,
  ) {
    const ad = this.isRecord(input) && 'raw' in input ? input.raw : input
    const normalized =
      this.isRecord(ad) && 'tracking' in ad
        ? (ad as YandexAdsNormalizedAd)
        : this.isRecord(ad)
        ? this.normalizeAd(ad)
        : null

    const base = normalized?.tracking.impression ?? []
    const extra =
      this.isRecord(input) && !('raw' in input)
        ? [input.url, input.urls]
        : [undefined, undefined]

    // @ts-ignore
    return this.normalizeTrackingRequests(base, ...extra)
  }

  public extractClickTrackingRequests(
    input:
      | { ad?: Record<string, unknown>; url?: string; urls?: TrackingSource }
      | Record<string, unknown>,
  ) {
    const ad = this.isRecord(input) && 'raw' in input ? input.raw : input
    const normalized =
      this.isRecord(ad) && 'tracking' in ad
        ? (ad as YandexAdsNormalizedAd)
        : this.isRecord(ad)
        ? this.normalizeAd(ad)
        : null

    const base = normalized?.tracking.click ?? []
    const extra =
      this.isRecord(input) && !('raw' in input)
        ? [input.url, input.urls]
        : [undefined, undefined]

    // @ts-ignore
    return this.normalizeTrackingRequests(base, ...extra)
  }

  public async confirmImpression(args: {
    ad?: Record<string, unknown> | YandexAdsNormalizedAd
    url?: string
    urls?: TrackingSource
  }) {
    return this.sendTrackingRequests(
      // @ts-ignore
      this.extractImpressionTrackingRequests(args.ad ?? args),
    )
  }

  public async confirmClick(args: {
    ad?: Record<string, unknown> | YandexAdsNormalizedAd
    url?: string
    urls?: TrackingSource
  }) {
    return this.sendTrackingRequests(
      // @ts-ignore
      this.extractClickTrackingRequests(args.ad ?? args),
    )
  }

  public async simulateImpression(args: {
    ad?: Record<string, unknown> | YandexAdsNormalizedAd
    fetchResult?: YandexAdsFetchResult
  }) {
    const ad =
      args.ad ?? args.fetchResult?.ads?.[0] ?? args.fetchResult?.rawAds?.[0]

    if (!ad || !this.isRecord(ad)) {
      this.logger.warn(
        { msg: 'YandexAds simulate impression: no ad provided' },
        'YandexAds simulate impression: no ad',
      )
      return []
    }

    // @ts-ignore
    const requests = this.extractImpressionTrackingRequests(ad)
    this.logger.info(
      {
        msg: 'YandexAds simulate impression',
        requestsCount: requests.length,
      },
      'YandexAds simulate impression',
    )

    return this.sendTrackingRequests(requests)
  }

  public async simulateClick(args: {
    ad?: Record<string, unknown> | YandexAdsNormalizedAd
    fetchResult?: YandexAdsFetchResult
  }) {
    const ad =
      args.ad ?? args.fetchResult?.ads?.[0] ?? args.fetchResult?.rawAds?.[0]

    if (!ad || !this.isRecord(ad)) {
      this.logger.warn(
        { msg: 'YandexAds simulate click: no ad provided' },
        'YandexAds simulate click: no ad',
      )
      return []
    }
    // @ts-ignore
    const requests = this.extractClickTrackingRequests(ad)
    this.logger.info(
      {
        msg: 'YandexAds simulate click',
        requestsCount: requests.length,
      },
      'YandexAds simulate click',
    )

    return this.sendTrackingRequests(requests)
  }

  public async sendTrackingRequests(
    requests: Array<string | YandexAdsTrackingRequest | null | undefined>,
  ): Promise<YandexAdsTrackingResult[]> {
    const normalizedRequests = this.normalizeTrackingRequests(requests)

    if (normalizedRequests.length === 0) {
      this.logger.warn(
        { msg: 'YandexAds tracking: no requests to send' },
        'YandexAds tracking empty',
      )
      return []
    }

    this.logger.info(
      {
        msg: 'YandexAds tracking send',
        count: normalizedRequests.length,
        urls: normalizedRequests.map((req) => req.url),
      },
      'YandexAds tracking send',
    )

    return Promise.all(
      normalizedRequests.map((request) => this.sendTrackingRequest(request)),
    )
  }

  public async sendTrackingRequest(
    request: string | YandexAdsTrackingRequest,
  ): Promise<YandexAdsTrackingResult> {
    const normalizedRequest =
      typeof request === 'string'
        ? ({ url: request } satisfies YandexAdsTrackingRequest)
        : request
    const method = (normalizedRequest.method ?? 'GET').toUpperCase() as
      | 'GET'
      | 'POST'

    if (!this.isHttpUrl(normalizedRequest.url)) {
      return {
        url: String(normalizedRequest.url),
        method,
        success: false,
        error: 'Invalid tracking URL',
      }
    }

    const config: AxiosRequestConfig = {
      url: normalizedRequest.url,
      method,
      headers: normalizedRequest.headers,
    }

    if (method === 'POST' && normalizedRequest.body !== undefined) {
      config.data = normalizedRequest.body
    }

    try {
      const response = await this.http.request(config)
      const success = response.status >= 200 && response.status < 300

      if (!success) {
        this.logger.warn({
          msg: 'Yandex tracking request failed',
          url: normalizedRequest.url,
          method,
          status: response.status,
          data: response.data,
        })
      }

      return {
        url: normalizedRequest.url,
        method,
        success,
        status: response.status,
        data: response.data,
      }
    } catch (error) {
      this.logger.warn({
        msg: 'Yandex tracking request error',
        url: normalizedRequest.url,
        method,
        error,
      })

      return {
        url: normalizedRequest.url,
        method,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private resolveRegion(region?: YandexAdsRegion | 'auto'): YandexAdsRegion {
    if (!region || region === 'auto') {
      return 'eu'
    }

    return region === 'us' ? 'us' : 'eu'
  }

  private ensureRawAdsArray(data: unknown): Record<string, unknown>[] {
    if (!Array.isArray(data)) {
      return []
    }

    return data.filter(this.isRecord) as Record<string, unknown>[]
  }

  private summarizeAd(ad: YandexAdsNormalizedAd) {
    return {
      index: ad.index,
      creativeType: ad.creativeType,
      title: ad.title,
      hasHtml: Boolean(ad.html),
      hasVast: Boolean(ad.vastXml || ad.vastUrl),
      impressionCount: ad.tracking.impression.length,
      clickCount: ad.tracking.click.length,
      notificationUrl: ad.tracking.notificationUrl,
      clickUrl: ad.tracking.clickUrl,
    }
  }

  private normalizeTrackingRequests(...sources: TrackingSource[]) {
    const requests: YandexAdsTrackingRequest[] = []

    for (const source of sources.flat()) {
      if (!source) continue

      if (typeof source === 'string') {
        if (this.isHttpUrl(source)) {
          requests.push({ url: source, method: 'GET' })
        }

        continue
      }

      if (Array.isArray(source)) {
        requests.push(...this.normalizeTrackingRequests(...source))
        continue
      }

      if (this.isRecord(source) && this.isHttpUrl(source.url)) {
        requests.push({
          url: String(source.url),
          method: source.method === 'POST' ? 'POST' : 'GET',
          body: source.body,
          headers: this.isRecord(source.headers)
            ? (source.headers as Record<string, string>)
            : undefined,
        })
      }
    }

    return this.uniqueTrackingRequests(requests)
  }

  private extractTrackingEventUrls(
    ad: Record<string, unknown>,
    eventNames: string[],
  ) {
    const containers = [
      ad.trackingEvents,
      ad.tracking_events,
      ad.tracking,
      ad.trackings,
    ]

    const normalizedEventNames = eventNames.map((value) =>
      value.toLowerCase().replace(/[^a-z]/g, ''),
    )

    const urls: string[] = []

    for (const container of containers) {
      if (Array.isArray(container)) {
        for (const item of container) {
          if (!this.isRecord(item)) continue

          const eventName = this.pickString(item.event, item.name, item.type)
          const normalizedEventName = (eventName ?? '')
            .toLowerCase()
            .replace(/[^a-z]/g, '')

          if (normalizedEventNames.includes(normalizedEventName)) {
            urls.push(
              ...this.collectStrings(
                item.url,
                item.urls,
                item.value,
                item.link,
              ),
            )
          }
        }
      }

      if (!this.isRecord(container)) {
        continue
      }

      for (const [key, value] of Object.entries(container)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '')

        if (normalizedEventNames.includes(normalizedKey)) {
          urls.push(...this.collectStrings(value))
        }
      }
    }

    return this.uniqueStrings(urls)
  }

  private collectStrings(...values: unknown[]): string[] {
    const result: string[] = []

    for (const value of values.flat()) {
      if (!value) continue

      if (typeof value === 'string') {
        const trimmed = value.trim()

        if (trimmed.length > 0 && this.isHttpUrl(trimmed)) {
          result.push(trimmed)
        }

        continue
      }

      if (Array.isArray(value)) {
        result.push(...this.collectStrings(...value))
        continue
      }

      if (this.isRecord(value)) {
        result.push(
          ...this.collectStrings(
            value.url,
            value.urls,
            value.link,
            value.value,
            value.href,
          ),
        )
      }
    }

    return this.uniqueStrings(result)
  }

  private pickString(...values: unknown[]) {
    return this.collectStrings(...values)[0] ?? null
  }

  private uniqueStrings(values: Array<string | null | undefined>) {
    return [
      ...new Set(values.filter((value): value is string => Boolean(value))),
    ]
  }

  private uniqueTrackingRequests(requests: YandexAdsTrackingRequest[]) {
    const uniqueMap = new Map<string, YandexAdsTrackingRequest>()

    for (const request of requests) {
      const key = `${request.method ?? 'GET'}:${request.url}:${
        request.body ? JSON.stringify(request.body) : ''
      }`

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, request)
      }
    }

    return [...uniqueMap.values()]
  }

  private isHttpUrl(value: unknown): value is string {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }
}
