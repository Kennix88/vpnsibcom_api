import compression from '@fastify/compress'
import cookie from '@fastify/cookie'
import fastifyCsrf from '@fastify/csrf-protection'
import helmet from '@fastify/helmet'
import fastifyJwt from '@fastify/jwt'
import fastifyRateLimit from '@fastify/rate-limit'
import session from '@fastify/session'
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory, Reflector } from '@nestjs/core'
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { RedisStore } from 'connect-redis'
import { FastifyReply, FastifyRequest } from 'fastify'
import { LoggerErrorInterceptor, PinoLogger } from 'nestjs-pino'

import { PreventDuplicateInterceptor } from '@core/auth/guards/prevent-duplicate.guard'
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
    new FastifyAdapter({ trustProxy: isProd, logger: false, genReqId }),
    { bufferLogs: isProd, rawBody: true },
  )

  const config = app.get(ConfigService)
  const redis = app.get(RedisService)
  const reflector = app.get(Reflector)

  // Resolve scoped logger properly
  const pinoLogger = await app.resolve(PinoLogger)
  app.useLogger({
    log: pinoLogger.info.bind(pinoLogger),
    error: pinoLogger.error.bind(pinoLogger),
    warn: pinoLogger.warn.bind(pinoLogger),
    debug: pinoLogger.debug.bind(pinoLogger),
    verbose: pinoLogger.trace.bind(pinoLogger),
  })

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggerErrorInterceptor(),
    new PreventDuplicateInterceptor(redis, reflector),
  )

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )

  await configureFastify(app, isProd, config, redis)

  if (parseBoolean(process.env.SEED_MOD || '')) {
    await PrismaSeed().catch((e) => {
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
