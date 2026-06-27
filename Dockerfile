# --- STAGE 1: Deps (только prod-зависимости) ---
FROM node:24.11.1-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --omit=dev

# --- STAGE 2: Builder ---
FROM node:24.11.1-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl build-base python3 make g++ git
COPY package*.json ./
RUN npm ci --no-audit --prefer-offline
COPY . .
RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build 2>&1 | tee /tmp/build.log \
    && find /app/dist -type f -name '*.js' -print -quit | grep -q . \
    || (tail -n 200 /tmp/build.log && exit 1)

# --- STAGE 3: Runtime ---
FROM node:24.11.1-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache dumb-init curl libc6-compat openssl ca-certificates bash \
    && update-ca-certificates
ENV NODE_ENV=production PORT=4000
RUN mkdir -p /app/data/geo /app/logs /app/src/core/i18n \
    && chown -R node:node /app

COPY --from=deps    --chown=node:node /app/node_modules   ./node_modules
COPY --from=builder --chown=node:node /app/dist           ./dist
COPY --from=builder --chown=node:node /app/package*.json  ./
COPY --from=builder --chown=node:node /app/assets         ./assets
COPY --from=builder --chown=node:node /app/prisma         ./prisma
COPY --from=builder --chown=node:node /app/src/core/i18n  ./src/core/i18n
COPY --chown=node:node entrypoint.sh ./entrypoint.sh

RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f --max-time 10 http://localhost:${PORT}/health || exit 1

EXPOSE ${PORT}
USER node
ENTRYPOINT ["dumb-init", "--", "./entrypoint.sh"]
