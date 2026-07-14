#!/bin/sh
set -eu

# Install runtime deps
apk add --no-cache curl ca-certificates

# Default CRON_SCHEDULE if not set
CRON_SCHEDULE="${CRON_SCHEDULE:-0 0 * * *}"

echo "Starting PostgreSQL Telegram backup cron (${CRON_SCHEDULE})..."

# Создаём временную директорию
mkdir -p /tmp/pgdump

escape_squotes() {
  printf "%s" "$1" | sed "s/'/'\"'\"'/g"
}

cat <<EOF > /tmp/backup-env.sh
export POSTGRES_HOST='$(escape_squotes "${POSTGRES_HOST}")'
export POSTGRES_USER='$(escape_squotes "${POSTGRES_USER}")'
export POSTGRES_PASSWORD='$(escape_squotes "${POSTGRES_PASSWORD}")'
export POSTGRES_DB='$(escape_squotes "${POSTGRES_DB}")'
export TELEGRAM_BOT_TOKEN='$(escape_squotes "${TELEGRAM_BOT_TOKEN}")'
export TELEGRAM_LOG_CHAT_ID='$(escape_squotes "${TELEGRAM_LOG_CHAT_ID}")'
export TELEGRAM_THREAD_ID_BACKUPS='$(escape_squotes "${TELEGRAM_THREAD_ID_BACKUPS:-}")'
export GRASPIL_PROXY_URL='$(escape_squotes "${GRASPIL_PROXY_URL:-}")'
EOF

chmod 600 /tmp/backup-env.sh

cat <<EOF > /etc/crontabs/root
${CRON_SCHEDULE} . /tmp/backup-env.sh && /bin/sh /tmp/backup-now.sh >> /proc/1/fd/1 2>> /proc/1/fd/2
EOF

# Создаём исполняемый файл для бэкапа
cat <<'EOF' > /tmp/backup-now.sh
#!/bin/sh
set -eu

require_var() {
  var_name="$1"
  eval "var_value=\${$var_name:-}"
  if [ -z "$var_value" ]; then
    echo "[ERROR] Required env var is empty: ${var_name}" >&2
    exit 1
  fi
}

require_var POSTGRES_HOST
require_var POSTGRES_USER
require_var POSTGRES_PASSWORD
require_var POSTGRES_DB
require_var TELEGRAM_BOT_TOKEN
require_var TELEGRAM_LOG_CHAT_ID

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="backup_${TIMESTAMP}.sql.gz"
TMP_BASE="$(mktemp /tmp/pgdump.XXXXXX)"
TMP_FILE="${TMP_BASE}.sql.gz"
RESP_FILE="$(mktemp /tmp/telegram-response.XXXXXX)"

cleanup() {
  rm -f "${TMP_BASE}"
  rm -f "${TMP_FILE}"
  rm -f "${RESP_FILE}"
}

trap cleanup EXIT INT TERM

echo "[INFO] Dumping PostgreSQL..."
if ! PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${POSTGRES_HOST}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-owner --no-privileges | gzip -9 > "${TMP_FILE}"; then
  echo "[ERROR] pg_dump failed" >&2
  exit 1
fi

echo "[INFO] Sending ${FILENAME} to Telegram..."
TELEGRAM_API_ROOT="${GRASPIL_PROXY_URL:-https://api.telegram.org}"
TELEGRAM_API_ROOT="${TELEGRAM_API_ROOT%/}"
TELEGRAM_SEND_URL="${TELEGRAM_API_ROOT}/bot${TELEGRAM_BOT_TOKEN}/sendDocument"

set -- curl -sS -f \
  --retry 5 \
  --retry-delay 3 \
  --retry-all-errors \
  --connect-timeout 20 \
  --max-time 300 \
  -F "chat_id=${TELEGRAM_LOG_CHAT_ID}"

if [ -n "${TELEGRAM_THREAD_ID_BACKUPS:-}" ]; then
  set -- "$@" -F "message_thread_id=${TELEGRAM_THREAD_ID_BACKUPS}"
fi

set -- "$@" \
  -F "document=@${TMP_FILE};filename=${FILENAME}" \
  "${TELEGRAM_SEND_URL}"

if ! "$@" > "${RESP_FILE}"; then
  echo "[ERROR] Telegram upload failed" >&2
  exit 1
fi

if ! grep -q '"ok":true' "${RESP_FILE}"; then
  echo "[ERROR] Telegram API returned non-ok response: $(cat "${RESP_FILE}")" >&2
  exit 1
fi

echo "[INFO] Telegram send OK"
EOF

chmod +x /tmp/backup-now.sh

# Небольшое ожидание БД на старте контейнера
echo "[INFO] Waiting for PostgreSQL..."
until PGPASSWORD="${POSTGRES_PASSWORD}" pg_isready -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
  sleep 2
done

# Первый запуск сразу
/bin/sh /tmp/backup-now.sh

# Запускаем cron в фоне
crond -f -L /dev/stdout
