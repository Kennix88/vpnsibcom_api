import { CoreModule } from '@core/core.module'
import { PrismaSeed } from '@core/prisma/prisma.seed'
import { RedisService } from '@core/redis/redis.service'
import compression from '@fastify/compress'
import cookie from '@fastify/cookie'
import fastifyCsrf from '@fastify/csrf-protection'
import helmet from '@fastify/helmet'
import * as fastifyJwt from '@fastify/jwt'
import fastifyRateLimit from '@fastify/rate-limit'
import session from '@fastify/session'
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { genReqId } from '@shared/utils/gen-req-id.util'
import { ms, type StringValue } from '@shared/utils/ms.util'
import { parseBoolean } from '@shared/utils/parse-boolean.util'
import { RedisStore } from 'connect-redis'
import { FastifyReply, FastifyRequest } from 'fastify'
import { LoggerErrorInterceptor, Logger as PinoLogger } from 'nestjs-pino'

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production'

  const app = await NestFactory.create<NestFastifyApplication>(
    CoreModule,
    new FastifyAdapter({
      trustProxy: isProduction,
      logger: false,
      genReqId,
    }),
    { bufferLogs: isProduction, rawBody: true },
  )

  const config = app.get(ConfigService)
  const redis = app.get(RedisService)

  app.useLogger(app.get(PinoLogger))
  app.useGlobalInterceptors(new LoggerErrorInterceptor())

  // app.use(cookieParser(config.getOrThrow<string>('COOKIES_SECRET')))

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )

  await app.register(compression)
  await app.register(cookie)
  if (!isProduction) {
    await app.register(fastifyCsrf)
  }

  await app.register(helmet, {
    contentSecurityPolicy: false, // если ломает Telegram
  })

  await app.register(fastifyJwt, {
    secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    cookie: {
      cookieName: 'access_token',
      signed: false,
    },
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

  // Настройка Rate Limiting
  await app.register(fastifyRateLimit, {
    max: 100, // максимальное количество запросов
    timeWindow: '1 minute', // за 1 минуту
    redis: redis, // Redis client for rate limiting
    whitelist: ['127.0.0.1', '::1', '172.18.0.0/16'], // белый список IP-адресов
    errorResponseBuilder: (req, context) => ({
      code: 429,
      error: 'Too Many Requests',
      message: `TOO_MANY_REQUESTS:${context.after}`, // Localized error message
      date: Date.now(),
      expiresIn: context.after,
    }),
  })

  app.enableCors({
    origin: (origin, cb) => {
      const whitelist = [
        config.getOrThrow<string>('ALLOWED_ORIGIN'),
        'https://127.0.0.1:3000',
      ]
      if (!origin || whitelist.includes(origin)) return cb(null, true)
      return cb(new Error('Not allowed by CORS'), false)
    },
    credentials: true,
    exposedHeaders: ['set-cookie'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Set-Cookie'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })

  const fastifyInstance = app.getHttpAdapter().getInstance()

  fastifyInstance.decorate(
    'authenticate',
    async function (req: FastifyRequest, res: FastifyReply) {
      try {
        await req.jwtVerify({ onlyCookie: false }) // <--- важно
      } catch (err) {
        res.code(401).send({ message: 'Unauthorized' })
      }
    },
  )

  app.enableShutdownHooks()

  const port = config.get<number>('APPLICATION_PORT') ?? 3000
  Logger.log(`Attempting to listen on port ${port}`, 'Bootstrap')
  try {
    await app.listen(port, '0.0.0.0')
    Logger.log(`Application is listening on port ${port}`, 'Bootstrap')
  } catch (error) {
    Logger.error(error, 'Bootstrap - Listen Error')
    throw error; // Re-throw to ensure the error is propagated
  }

  return app.getUrl()
}

void (async () => {
  try {
    Logger.log(`SEED MOD: ${process.env.SEED_MOD}`, 'Bootstrap')
    if (process.env.SEED_MOD && parseBoolean(process.env.SEED_MOD)) {
      Logger.log(`GO SEED`, 'Bootstrap')
      await PrismaSeed().catch((e) => {
        Logger.error(e)
        throw new BadRequestException(
          'Error filling in the database',
          'Prisma-Seed',
        )
      })
      return
    } else {
      Logger.log(`GO NEST`, 'Bootstrap')
      try {
        const url = await bootstrap()
        Logger.log(url, 'Bootstrap')
      } catch (error) {
        Logger.error(error, 'Bootstrap - Bootstrap Function Error')
      }
    }
  } catch (error) {
    Logger.error(error, 'Bootstrap')
  }
})()

process.on('uncaughtException', (err) => {
  Logger.error(err, 'UncaughtException')
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  Logger.error(reason, 'UnhandledRejection')
})
