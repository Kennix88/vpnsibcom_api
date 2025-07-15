FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --force

COPY . .



RUN npx prisma generate
RUN npm run build

RUN ls -la dist && echo "✅ Build completed"

FROM node:22-alpine

WORKDIR /app
RUN apk add --no-cache dumb-init curl

# Создаем директорию для логов заранее
RUN mkdir -p logs && chmod 777 logs

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/prisma ./prisma

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Добавляем проверку здоровья
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
	CMD curl -f http://localhost:4000/health || exit 1

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--", "./entrypoint.sh"]
