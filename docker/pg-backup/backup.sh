#!/bin/sh
set -e

# Install curl
apk add curl --no-cache

# Default CRON_SCHEDULE if not set
CRON_SCHEDULE="${CRON_SCHEDULE:-0 0 * * *}"

echo "Starting PostgreSQL Telegram backup cron (${CRON_SCHEDULE})..."

# Создаём временную директорию
mkdir -p /tmp/pgdump

cat <<EOF > /etc/crontabs/root
${CRON_SCHEDULE} /bin/sh /tmp/backup-now.sh >> /var/log/pgbackup.log 2>&1
EOF

# Создаём исполняемый файл для бэкапа
cat <<'EOF' > /tmp/backup-now.sh
#!/bin/sh
set -e

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="backup_${TIMESTAMP}.sql"

echo "[INFO] Dumping PostgreSQL..."
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${POSTGRES_HOST}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-owner --no-privileges \
  > "/tmp/${FILENAME}"

if [ $? -eq 0 ]; then
  echo "[INFO] Sending ${FILENAME} to Telegram..."
  curl -s -F chat_id="${TELEGRAM_LOG_CHAT_ID}" \
       -F message_thread_id="${TELEGRAM_THREAD_ID_BACKUPS}" \
       -F document="@/tmp/${FILENAME}" \
       "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" >/dev/null

  echo "[INFO] Telegram send OK"
else
  echo "[ERROR] pg_dump failed"
fi

rm -f "/tmp/${FILENAME}"
EOF

chmod +x /tmp/backup-now.sh

# Первый запуск сразу
/bin/sh /tmp/backup-now.sh

# Запускаем cron в фоне
crond -f -L /var/log/cron.log
