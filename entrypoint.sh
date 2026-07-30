#!/bin/sh

set -e

for var in $required_vars; do
    if [ -z "$(eval echo \$$var)" ]; then
        echo "❌ Error: Required environment variable $var is not set!"
        exit 1
    fi
done

# echo "📦 Running Prisma push..."
# npx prisma db push
echo "📦 Running Prisma migrations..."
npx prisma migrate deploy --config prisma.config.ts

if [ "$SEED_MOD" = "true" ]; then
    echo "🌱 Seeding DB..."
    node dist/main.js
fi


echo "🚀 Starting app..."
exec node dist/main.js
