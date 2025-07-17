# --- STAGE 1: Builder ---
FROM node:22.17.0-alpine AS builder

WORKDIR /app

# Устанавливаем нужные зависимости для сборки нативных модулей
RUN apk add --no-cache libc6-compat openssl build-base python3

COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

COPY . .

# Генерация Prisma клиента и сборка проекта
RUN npx prisma generate
RUN npm run build

# Проверка сборки
RUN ls -la dist && echo "✅ Build completed"

# --- STAGE 2: Runtime ---
FROM node:22.17.0-alpine

WORKDIR /app

# Установка minimal зависимостей для рантайма
RUN apk add --no-cache dumb-init curl libc6-compat openssl

# Логи
RUN mkdir -p logs && chmod 777 logs

# Копируем артефакты сборки
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/prisma ./prisma

# Копируем скрипт запуска
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
	CMD curl -f http://localhost:4000/health || exit 1

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--", "./entrypoint.sh"]
