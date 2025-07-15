#!/bin/sh

set -e

# Проверка наличия необходимых переменных окружения
required_vars="XRAY_MARZBAN_URL XRAY_MARZBAN_LOGIN XRAY_MARZBAN_PASSWORD"
for var in $required_vars; do
  if [ -z "$(eval echo \$$var)" ]; then
    echo "❌ Error: Required environment variable $var is not set!"
    exit 1
  fi
done

# echo "📦 Running Prisma push..."
# npx prisma db push
echo "📦 Running Prisma migrations..."
npx prisma migrate deploy

if [ "$SEED_MOD" = "true" ]; then
  echo "🌱 Seeding DB..."
  node dist/main.js
fi

# Проверка доступности Marzban API с повторными попытками
echo "🔍 Checking Marzban API availability..."

MAX_RETRIES=${XRAY_MARZBAN_MAX_RETRIES:-5}
RETRY_DELAY=${XRAY_MARZBAN_RETRY_DELAY:-5}
RETRIES=0
API_AVAILABLE=false

while [ $RETRIES -lt $MAX_RETRIES ] && [ "$API_AVAILABLE" = "false" ]; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "$XRAY_MARZBAN_URL" || echo "000")
  
  if echo "$HTTP_CODE" | grep -q "\(200\|301\|302\|307\|308\)"; then
    echo "✅ Marzban API is available at $XRAY_MARZBAN_URL (HTTP $HTTP_CODE)"
    API_AVAILABLE=true
  else
    RETRIES=$((RETRIES+1))
    if [ $RETRIES -lt $MAX_RETRIES ]; then
      echo "⏳ Attempt $RETRIES/$MAX_RETRIES: Marzban API at $XRAY_MARZBAN_URL returned HTTP $HTTP_CODE. Retrying in ${RETRY_DELAY}s..."
      sleep $RETRY_DELAY
    else
      echo "⚠️ Warning: Marzban API at $XRAY_MARZBAN_URL might not be available after $MAX_RETRIES attempts. Continuing anyway..."
    fi
  fi
done

echo "🚀 Starting app..."
exec node dist/main.js

