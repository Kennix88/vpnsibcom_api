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
    whitelist: ['127.0.0.1', '::1', '172.18.0.0/16'],
    errorResponseBuilder: (req, context) => ({
      code: 429,
      error: 'Too Many Requests',
      message: `TOO_MANY_REQUESTS:${context.after}`,
      date: Date.now(),
      expiresIn: context.after,
    }),
  })
  app.enableCors({
    origin: (origin, cb) => {
      const allowed = [
        config.getOrThrow<string>('ALLOWED_ORIGIN'),
        'https://127.0.0.1:3000',
      ]
      cb(null, !origin || allowed.includes(origin))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['set-cookie'],
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
      // явные php-файлы в конце пути: .php .phtml .php3 .php4 .php5 .pht
      '\\.(?:php|phtml|php3|php4|php5|pht)$',

      // распространённые админ/уязвимые скрипты
      '(?:\\b(?:wp-login|wp-admin|xmlrpc)\\.php\\b)',
      '(?:\\b(?:phpmyadmin|pma|adminer|sqlmanager|sql-admin)\\b)',

      // конфиг/уязвимости/резервные файлы
      '(?:\\.env(?:\\b|\\.|$))',
      '(?:\\.git(?:/|$))',
      '(?:composer\\.(?:json|lock))',
      '(?:\\.htaccess|\\.htpasswd)',

      // стандартные установщики/setup/install
      '(?:\\b(?:install|setup|upgrade|upgrade\\.php|install\\.php)\\b)',

      // vendor/phpunit и подобные тестовые утилиты
      '(?:vendor\\/phpunit|phpunit\\/)',
      '(?:\\/vendor\\/)',

      // попытки прочитать системные файлы в path / payload
      '(?:\\/etc\\/passwd)',
      '(?:\\/proc\\/self\\/environ)',
      '(?:\\.bash_history)',

      // попытки directory traversal или двойных точек
      '(?:\\.\\./|%2e%2e%2f)',

      // common webshell / eval / base64 payload indicators (в URL/Query)
      '(?:\\beval\\s*\\(|base64_decode\\()',

      // резервные/бэкап-файлы
      '(?:\\.bak$|\\.backup$|~$)',
    ].join('|'),
    'i',
  )

  const BOT_UA_RE = new RegExp(
    [
      // generic
      '\\b(?:bot|spider|crawler|crawler2|scanner|probe|monitor)\\b',

      // curl/wget/http clients
      '\\b(?:curl|wget|fetch|httpclient|libwww-perl|python-requests|ruby|mechanize)\\b',

      // common http libs / mobile clients that иногда используются by scanners
      '\\b(?:okhttp|okhttp3|apache-httpclient|java\\/|golang|go-http-client)\\b',

      // SEO / big crawlers (если не хочешь блокировать известных ботов, можешь убрать)
      '\\b(?:googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp)\\b',

      // security / spider tools & scanners
      '\\b(?:nikto|sqlmap|acunetix|nessus|nikto|masscan|zgrab|nmap|burp|zap)\\b',

      // common developer tools
      '\\b(?:postmanruntime|postman|insomnia|httpie)\\b',
    ].join('|'),
    'i',
  )

  fastify.addHook('onRequest', async (request, reply) => {
    try {
      const rawUrl = (request.raw.url || '').toString()
      const ua = (request.headers['user-agent'] || '').toString()

      // 1) quick allow list: авторизованные клиенты, внутренние IP, healthchecks
      if (request.headers.authorization || request.headers['x-api-key']) return
      if (/^\/health\b/i.test(rawUrl)) return
      const forwardIp = (request.headers['x-forwarded-for'] as string)?.split(
        ',',
      )?.[0]
      if (
        ['127.0.0.1', '::1'].includes(forwardIp) ||
        /^10\.|^172\.(1[6-9]|2\d|3[0-1])|^192\.168\./.test(forwardIp || '')
      ) {
        return
      }

      // 2) path check
      if (SUSPICIOUS_PATH_RE.test(rawUrl)) {
        // increment & possible blacklisting logic (redis)
        // respond 403 minimal
        return reply
          .code(403)
          .header('Content-Type', 'text/plain')
          .send('forbidden')
      }

      // 3) UA check (less strict) — count and possibly ban after threshold
      if (BOT_UA_RE.test(ua)) {
        // increment counter for ip and ban if threshold exceeded
        // but do not immediately alert telegram
        return reply
          .code(403)
          .header('Content-Type', 'text/plain')
          .send('forbidden')
      }
    } catch (err) {
      // не ломаем основной flow при ошибках
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
