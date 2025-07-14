FROM node:22-alpine AS builder

ARG POSTGRES_URL
ARG TELEGRAM_ADMIN_ID
ENV POSTGRES_URL=${POSTGRES_URL}
ENV TELEGRAM_ADMIN_ID=${TELEGRAM_ADMIN_ID}

WORKDIR /app

COPY package*.json ./
RUN npm ci --force

COPY . .

RUN npx prisma generate
RUN npm run build

# Проверка наличия нужного файла
RUN ls -la dist/src && echo "✅ Build completed"

# Сидинг
RUN npx cross-env SEED_MOD=true node dist/main.js

# === Production stage ===
FROM node:22-alpine

ARG POSTGRES_URL
ARG TELEGRAM_ADMIN_ID
ENV POSTGRES_URL=${POSTGRES_URL}
ENV TELEGRAM_ADMIN_ID=${TELEGRAM_ADMIN_ID}

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p logs

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]  
