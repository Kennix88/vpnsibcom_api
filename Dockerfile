# --- STAGE 1: Builder ---
FROM node:24.11.1-alpine AS builder
WORKDIR /app

# build deps (для сборки и нативных модулей)
RUN apk add --no-cache libc6-compat openssl build-base python3 make g++ git

# кешируем установку зависимостей
COPY package*.json ./
RUN npm ci --no-audit --prefer-offline --production=false

# копируем исходники
COPY . .

# prisma (если есть схема в prisma/schema.prisma)
RUN npx prisma generate --schema=./prisma/schema.prisma || true

# debug info (полезно при CI)
RUN node -v && npm -v && pwd && ls -la

# билд и проверка результата
RUN npm run build 2>&1 | tee /tmp/build.log \
	&& if [ -z "$(find /app/dist -type f -name '*.js' -print -quit)" ]; then echo "ERROR: no .js in /app/dist" && tail -n 200 /tmp/build.log && exit 1; fi

# для диагностики (опционально)
RUN echo "=== /app listing ===" && ls -la /app
RUN find /app -maxdepth 4 -type d -print
RUN find /app -type f -name "*.js" -print | sed -n '1,200p'

# --- STAGE 2: Runtime ---
FROM node:24.11.1-alpine AS runtime
WORKDIR /app

# runtime deps
RUN apk add --no-cache dumb-init curl libc6-compat openssl ca-certificates bash && update-ca-certificates

# создаём небезопасного, но полезного non-root пользователя node (если ещё нет)
RUN id -u node >/dev/null 2>&1 || (addgroup -S node && adduser -S node -G node)

# дефолтные переменные окружения
ENV NODE_ENV=production
ENV PORT=4000
ENV NPM_CONFIG_LOGLEVEL=warn

# копируем артефакты сборки, node_modules и entrypoint
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/assets ./assets
COPY --from=builder --chown=node:node /app/prisma.config.ts ./
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/src/core/i18n ./src/core/i18n
# Копируем твой существующий entrypoint.sh (предполагаем, что он в корне репо)
COPY --chown=node:node entrypoint.sh ./entrypoint.sh

# простая проверка и права
RUN [ -d "./dist" ] || (echo "ERROR: dist directory missing" && exit 1)
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh && ls -la entrypoint.sh

# HEALTHCHECK (использует PORT)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
	CMD curl -f --max-time 10 http://localhost:${PORT}/health || exit 1

EXPOSE ${PORT}

# запускаем от non-root пользователя node (entrypoint также будет выполняться от node)
USER node

ENTRYPOINT ["dumb-init", "--", "./entrypoint.sh"]
