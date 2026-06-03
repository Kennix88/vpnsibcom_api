import compression from '@fastify/compress'
import cookie from '@fastify/cookie'
import fastifyCsrf from '@fastify/csrf-protection'
import helmet from '@fastify/helmet'
import fastifyJwt from '@fastify/jwt'
import fastifyRateLimit from '@fastify/rate-limit'
import session from '@fastify/session'
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { RedisStore } from 'connect-redis'
import { FastifyReply, FastifyRequest } from 'fastify'
import { LoggerErrorInterceptor, PinoLogger } from 'nestjs-pino'

import { CoreModule } from '@core/core.module'
import { PrismaSeed } from '@core/prisma/prisma.seed'
import { RedisService } from '@core/redis/redis.service'
import { genReqId } from '@shared/utils/gen-req-id.util'
import { ms, type StringValue } from '@shared/utils/ms.util'
import { parseBoolean } from '@shared/utils/parse-boolean.util'

// Проверяет принадлежность IP к приватным диапазонам или явному списку
function isInternalIp(ip: string): boolean {
  if (!ip) return false
  if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) return true
  return /^(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|::ffff:(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.))/.test(
    ip,
  )
}

async function configureFastify(
  app: NestFastifyApplication,
  isProd: boolean,
  config: ConfigService,
  redis: RedisService,
) {
  await app.register(compression)
  await app.register(cookie)
  if (!isProd) await app.register(fastifyCsrf)
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(fastifyJwt, {
    secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    cookie: { cookieName: 'access_token', signed: false },
  })
  await app.register(session, {
    secret: config.getOrThrow<string>('SESSION_SECRET'),
    rolling: true,
    saveUninitialized: false,
    cookieName: config.getOrThrow<string>('SESSION_NAME'),
    cookie: {
      domain: config.getOrThrow<string>('SESSION_DOMAIN'),
      maxAge: ms(config.getOrThrow<StringValue>('SESSION_MAX_AGE')),
      httpOnly: parseBoolean(config.getOrThrow<string>('SESSION_HTTP_ONLY')),
      secure: parseBoolean(config.getOrThrow<string>('SESSION_SECURE')),
      sameSite: 'lax',
    },
    store: new RedisStore({
      client: redis,
      prefix: config.getOrThrow<string>('SESSION_FOLDER'),
      ttl: ms(config.getOrThrow<StringValue>('SESSION_MAX_AGE')),
    }),
  })
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis,
    // ИСПРАВЛЕНО: whitelist с CIDR не поддерживается — используем функцию
    allowList: (req) => {
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        ''
      return isInternalIp(ip)
    },
    errorResponseBuilder: (_req, context) => ({
      code: 429,
      error: 'Too Many Requests',
      message: `TOO_MANY_REQUESTS:${context.after}`,
      date: Date.now(),
      expiresIn: context.after,
    }),
  })

  // ИСПРАВЛЕНО: ALLOWED_ORIGINS (множественное) — список через запятую в .env
  // Пример: ALLOWED_ORIGINS=https://fasti.fun,https://vpnsib-front.frps.fasti.fun
  app.enableCors({
    origin: (origin, cb) => {
      const allowed = config
        .getOrThrow<string>('ALLOWED_ORIGINS')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)

      // Запросы без Origin (curl, healthcheck, server-to-server) — пропускаем
      if (!origin) return cb(null, true)

      // Локальные origin для браузерной разработки
      const localOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'https://127.0.0.1:3000',
      ]

      const isAllowed =
        allowed.includes(origin) || (!isProd && localOrigins.includes(origin))
      cb(null, isAllowed)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Platform',
      'X-Lang', // i18n HeaderResolver
      'X-Request-ID', // трейсинг
      'X-Api-Key',
    ],
    exposedHeaders: ['Set-Cookie', 'X-Request-ID'],
    optionsSuccessStatus: 204,
  })

  const fastify = app.getHttpAdapter().getInstance()

  // ========================
  // Favicon route
  fastify.route({
    method: 'GET',
    url: '/favicon.ico',
    handler: async (_req, reply) => {
      reply.code(204).header('Cache-Control', 'public, max-age=86400').send()
    },
  })

  // ========================
  // Suspicious URL scanner + lightweight autoban
  const SUSPICIOUS_PATH_RE = new RegExp(
    [
      '\\.(?:php|phtml|php3|php4|php5|pht)$',
      '(?:\\b(?:wp-login|wp-admin|xmlrpc)\\.php\\b)',
      '(?:\\b(?:phpmyadmin|pma|adminer|sqlmanager|sql-admin)\\b)',
      '(?:\\.env(?:\\b|\\.|$))',
      '(?:\\.git(?:/|$))',
      '(?:composer\\.(?:json|lock))',
      '(?:\\.htaccess|\\.htpasswd)',
      '(?:\\b(?:install|setup|upgrade|upgrade\\.php|install\\.php)\\b)',
      '(?:vendor\\/phpunit|phpunit\\/)',
      '(?:\\/vendor\\/)',
      '(?:\\/etc\\/passwd)',
      '(?:\\/proc\\/self\\/environ)',
      '(?:\\.bash_history)',
      '(?:\\.\\./|%2e%2e%2f)',
      '(?:\\beval\\s*\\(|base64_decode\\()',
      '(?:\\.bak$|\\.backup$|~$)',
    ].join('|'),
    'i',
  )

  const BOT_UA_RE = new RegExp(
    [
      '\\b(?:bot|spider|crawler|crawler2|scanner|probe|monitor)\\b',
      // curl намеренно убран — используется в healthcheck
      '\\b(?:wget|httpclient|libwww-perl|python-requests|ruby|mechanize)\\b',
      '\\b(?:okhttp|okhttp3|apache-httpclient|java\\/|golang|go-http-client)\\b',
      '\\b(?:googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp)\\b',
      '\\b(?:nikto|sqlmap|acunetix|nessus|masscan|zgrab|nmap|burp|zap)\\b',
      '\\b(?:postmanruntime|postman|insomnia|httpie)\\b',
    ].join('|'),
    'i',
  )

  fastify.addHook('onRequest', async (request, reply) => {
    try {
      const rawUrl = (request.raw.url || '').toString()
      const ua = (request.headers['user-agent'] || '').toString()

      // 1) healthcheck и авторизованные клиенты — пропускаем сразу
      if (/^\/health\b/i.test(rawUrl)) return
      if (request.headers.authorization || request.headers['x-api-key']) return

      // 2) внутренние IP — пропускаем
      const forwardIp = (request.headers['x-forwarded-for'] as string)
        ?.split(',')[0]
        ?.trim()
      const remoteIp = request.ip || ''
      if (isInternalIp(forwardIp || remoteIp)) return

      // 3) подозрительный путь → 403
      if (SUSPICIOUS_PATH_RE.test(rawUrl)) {
        return reply
          .code(403)
          .header('Content-Type', 'text/plain')
          .send('forbidden')
      }

      // 4) бот UA → 403
      if (BOT_UA_RE.test(ua)) {
        return reply
          .code(403)
          .header('Content-Type', 'text/plain')
          .send('forbidden')
      }
    } catch (err) {
      console.warn('scanner hook error', err)
    }
  })

  // ========================
  fastify.decorate(
    'authenticate',
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        await req.jwtVerify({ onlyCookie: false })
      } catch {
        res.code(401).send({ message: 'Unauthorized' })
      }
    },
  )
}

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production'

  const app = await NestFactory.create<NestFastifyApplication>(
    CoreModule,
    new FastifyAdapter({
      trustProxy: isProd,
      logger: false,
      genReqId,
    }),
    { bufferLogs: isProd, rawBody: true },
  )

  const config = app.get(ConfigService)
  const redis = app.get(RedisService)

  const pinoLogger = await app.resolve(PinoLogger)
  app.useLogger({
    log: (message: any) => pinoLogger.info(message),
    error: (message: any) => pinoLogger.error(message),
    warn: (message: any) => pinoLogger.warn(message),
    debug: (message: any) => pinoLogger.debug(message),
    verbose: (message: any) => pinoLogger.trace(message),
  })

  app.useGlobalInterceptors(new LoggerErrorInterceptor())
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )

  await configureFastify(app, isProd, config, redis)

  if (parseBoolean(process.env.SEED_MOD || '')) {
    await PrismaSeed().catch(() => {
      throw new BadRequestException('Error seeding database', 'Prisma-Seed')
    })
    process.exit(0)
  }

  const port = config.get<number>('APPLICATION_PORT') ?? 3000
  Logger.log(`Starting on port ${port}`, 'Bootstrap')
  await app.listen(port, '0.0.0.0')
  Logger.log(`App listening on port ${port}`, 'Bootstrap')
}

bootstrap().catch((err) => {
  Logger.error(err, 'Bootstrap Failure')
  process.exit(1)
})
