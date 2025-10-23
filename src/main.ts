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

  // Create app early so we can attach graceful shutdown references
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

  // Resolve scoped logger properly
  const pinoLogger = await app.resolve(PinoLogger)
  app.useLogger({
    log: (message: any) => pinoLogger.info(message),
    error: (message: any) => pinoLogger.error(message),
    warn: (message: any) => pinoLogger.warn(message),
    debug: (message: any) => pinoLogger.debug(message),
    verbose: (message: any) => pinoLogger.trace(message),
  })

  // Global interceptors
  app.useGlobalInterceptors(new LoggerErrorInterceptor())

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )

  // graceful shutdown helper
  let isShuttingDown = false
  const shutdownLogger = new Logger('Shutdown')

  async function gracefulShutdown(reason?: unknown) {
    if (isShuttingDown) return
    isShuttingDown = true
    try {
      shutdownLogger.warn(
        `Graceful shutdown initiated. Reason: ${String(reason ?? '')}`,
      )
      // try to close Nest app (calls OnModuleDestroy hooks)
      await app.close().catch((e) => {
        shutdownLogger.error('Error while closing app: ' + (e?.message ?? e))
      })
      // try to close redis (if exists)
      if (redis) {
        try {
          // ioredis: quit(); node-redis: disconnect(); both are safe to call if present
          // prefer quit() to flush commands
          // @ts-ignore
          if (typeof redis.quit === 'function') {
            // quit returns a promise on ioredis
            await (redis.quit() as Promise<unknown>).catch(() => {})
          } else if (typeof redis.disconnect === 'function') {
            // fallback
            // @ts-ignore
            redis.disconnect()
          }
        } catch (e) {
          shutdownLogger.error(
            'Error while closing redis: ' + (e?.message ?? e),
          )
        }
      }
    } catch (e) {
      shutdownLogger.error(
        'Unexpected error during graceful shutdown: ' + (e?.message ?? e),
      )
    } finally {
      // Ensure process exit so docker/watchdog can restart everything
      shutdownLogger.warn('Exiting process now.')
      // give some time to flush logs
      setTimeout(() => process.exit(1), 200)
    }
  }

  // GLOBAL PROCESS HANDLERS
  process.on('unhandledRejection', (reason) => {
    const msg = `unhandledRejection: ${String(reason)}`
    pinoLogger.error(msg)
    // Do graceful shutdown so watchdog / supervisor can restart the stack
    void gracefulShutdown(reason)
  })

  process.on('uncaughtException', (err: any) => {
    const msg = `uncaughtException: ${(err && err.stack) || err}`
    pinoLogger.error(msg)
    // exit gracefully
    void gracefulShutdown(err)
  })

  process.on('SIGINT', () => {
    pinoLogger.warn('SIGINT received')
    void gracefulShutdown('SIGINT')
  })
  process.on('SIGTERM', () => {
    pinoLogger.warn('SIGTERM received')
    void gracefulShutdown('SIGTERM')
  })

  // Optional defensive patch: avoid Node throw on EventEmitter 'error' when there are no listeners.
  // This is a last-resort safety-net for third-party libraries that emit 'error' on EventEmitter instances
  // without attaching handlers (can cause process to crash). It's disabled by default; enable by env:
  // PATCH_EVENT_EMITTER=true
  try {
    if (process.env.PATCH_EVENT_EMITTER === 'true') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const { EventEmitter } = require('events')
      const origEmit = EventEmitter.prototype.emit
      // patch
      // do not use Nest Logger here (may not be ready), use console as fallback
      // keep patch minimal: swallow unhandled 'error' events and log a warning
      // NOTE: this is a pragmatic workaround — prefer fixing the root cause (attach proper error handler on the offending client)
      // tslint:disable-next-line:only-arrow-functions
      EventEmitter.prototype.emit = function (
        this: any,
        event: string | symbol,
        ...args: any[]
      ) {
        if (
          event === 'error' &&
          this.listenerCount &&
          this.listenerCount('error') === 0
        ) {
          try {
            console.warn(
              `[event-patch] Unhandled 'error' on ${this.constructor?.name}:`,
              args[0],
            )
          } catch {
            // ignore
          }
          return true
        }
        return origEmit.call(this, event, ...args)
      }
      pinoLogger.warn(
        'EventEmitter.emit patched to swallow unhandled error events (PATCH_EVENT_EMITTER=true)',
      )
    }
  } catch (e) {
    pinoLogger.error('Failed to apply EventEmitter patch: ' + (e?.message ?? e))
  }

  // Wait for Redis readiness before registering Fastify and listening
  // If Redis is essential (as in your case), it's better to fail fast so the watchdog can restart all services.
  try {
    const REDIS_READY_TIMEOUT_MS = Number(
      process.env.REDIS_READY_TIMEOUT_MS ?? 15000,
    )
    pinoLogger.info(
      `Waiting up to ${REDIS_READY_TIMEOUT_MS}ms for Redis to become ready...`,
    )
    // redis.waitTillReady exists in your service
    await Promise.race([
      (async () => {
        // @ts-ignore
        if (typeof redis.waitTillReady === 'function') {
          // will reject on error
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          return redis.waitTillReady()
        }
        // fallback: check status
        // @ts-ignore
        while (redis.status !== 'ready') {
          await new Promise((r) => setTimeout(r, 200))
        }
      })(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Redis ready timeout')),
          REDIS_READY_TIMEOUT_MS,
        ),
      ),
    ])
    pinoLogger.info('Redis is ready.')
  } catch (err) {
    pinoLogger.error('Redis did not become ready: ' + (err as Error).message)
    // fail fast: graceful shutdown -> exit -> watchdog will restart the whole group
    await gracefulShutdown(err)
    return
  }

  // continue with fastify registration and start
  await configureFastify(app, isProd, config, redis)

  if (parseBoolean(process.env.SEED_MOD || '')) {
    await PrismaSeed().catch((e) => {
      throw new BadRequestException('Error seeding database', 'Prisma-Seed')
    })
    process.exit(0)
  }

  const port = config.get<number>('APPLICATION_PORT') ?? 3000
  Logger.log(`Starting on port ${port}`, 'Bootstrap')
  try {
    await app.listen(port, '0.0.0.0')
    Logger.log(`App listening on port ${port}`, 'Bootstrap')
  } catch (err) {
    // listen failed: log and shutdown to let supervisor/watchdog handle restarts
    Logger.error(`Failed to start app: ${(err as Error).message}`, 'Bootstrap')
    await gracefulShutdown(err)
  }
}

bootstrap().catch(async (err) => {
  Logger.error(err, 'Bootstrap Failure')
  // Try to perform graceful shutdown in case partial init succeeded
  try {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    // best-effort: call shutdown (we cannot access app object here cleanly)
  } finally {
    // exit with non-zero
    process.exit(1)
  }
})
