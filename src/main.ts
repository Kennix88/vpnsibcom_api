import { CoreModule } from '@core/core.module'
import { PrismaSeed } from '@core/prisma/prisma.seed'
import { RedisService } from '@core/redis/redis.service'
import compression from '@fastify/compress'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import { Authenticator } from '@fastify/passport'
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
import * as cookieParser from 'cookie-parser'
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

  app.use(cookieParser(config.getOrThrow<string>('COOKIES_SECRET')))

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  )

  await app.register(compression)
  await app.register(cookie)
  await app.register(session, {
    secret: config.getOrThrow<string>('SESSION_SECRET'),
    rolling: true,
    saveUninitialized: true,
    // name: config.getOrThrow<string>('SESSION_NAME'),
    // resave: false,
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
    }),
  })

  app.enableCors({
    origin: config.getOrThrow<string>('ALLOWED_ORIGIN'),
    credentials: true,
    exposedHeaders: ['set-cookie'],
  })
  app.enableShutdownHooks()

  const passport = new Authenticator()
  await app.register(passport.initialize())
  await app.register(passport.secureSession())
  await app.register(helmet)

  await app.listen(config.getOrThrow<number>('APPLICATION_PORT') || 3000)

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
      const url = await bootstrap()
      Logger.log(url, 'Bootstrap')
    }
  } catch (error) {
    Logger.error(error, 'Bootstrap')
  }
})()
