#!/bin/sh
# Watchdog for Docker Compose services
# Monitors container state and health, restarts a group of services together when one is unhealthy/down.
# Настройка через переменные окружения:
#  WATCH_SERVICES  - space-separated list of контейнеров (имена из `docker ps` / container_name)
#  CHECK_INTERVAL  - интервал проверки в секундах
#  COOLDOWN        - пауза после рестарта (сек)
#  MAX_RESTARTS_WINDOW - макс рестартов в окне
#  WINDOW_SEC      - окно времени (сек) для подсчёта рестартов
set -eu

SERVICES="${WATCH_SERVICES:-api postgres redis uptime-kuma xray-checker caddy grafana frontend}"
INTERVAL="${CHECK_INTERVAL:-15}"
COOLDOWN="${COOLDOWN:-60}"
MAX_RESTARTS_WINDOW="${MAX_RESTARTS_WINDOW:-5}"
WINDOW_SEC="${WINDOW_SEC:-300}"
HISTORY="/tmp/watchdog_restarts.log"

touch "$HISTORY" || true

echo "$(date -Is) [INFO] Watchdog starting. Monitoring: $SERVICES"
while true; do
    TRIGGER=0
    
    for svc in $SERVICES; do
        # Проверка наличия контейнера
        if ! docker ps -a --format "{{.Names}}" | grep -w "$svc" >/dev/null 2>&1; then
            echo "$(date -Is) [WARN] service not found: $svc"
            TRIGGER=1
            break
        fi
        
        # Получаем состояние и health (если есть)
        state=$(docker inspect --format '{{.State.Status}}' "$svc" 2>/dev/null || echo unknown)
        health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}nohealth{{end}}' "$svc" 2>/dev/null || echo nohealth)
        
        if [ "$state" != "running" ]; then
            echo "$(date -Is) [ALERT] $svc state=$state -> trigger restart"
            TRIGGER=1
            break
        fi
        
        if [ "$health" = "unhealthy" ]; then
            echo "$(date -Is) [ALERT] $svc health=unhealthy -> trigger restart"
            TRIGGER=1
            break
        fi
    done
    
    if [ "$TRIGGER" -eq 1 ]; then
        now=$(date +%s)
        # Оставляем в логе только записи за WINDOW_SEC
        if [ -f "$HISTORY" ]; then
            awk -v now="$now" -v win="$WINDOW_SEC" '$1 >= now - win {print $0}' "$HISTORY" > "${HISTORY}.tmp" || true
            mv "${HISTORY}.tmp" "$HISTORY" 2>/dev/null || true
        fi
        restarts=$(wc -l < "$HISTORY" 2>/dev/null || echo 0)
        
        if [ "$restarts" -ge "$MAX_RESTARTS_WINDOW" ]; then
            echo "$(date -Is) [WARN] too many restarts ($restarts in last $WINDOW_SEC s). Sleeping $COOLDOWN s before next check."
            sleep "$COOLDOWN"
        else
            echo "$(date -Is) [ACTION] restarting services: $SERVICES"
            # Попробуем docker restart (по контейнерным именам)
            if ! docker restart $SERVICES >/dev/null 2>&1; then
                echo "$(date -Is) [WARN] 'docker restart' failed, trying 'docker compose restart'"
                docker compose restart $SERVICES || true
            fi
            echo "$now" >> "$HISTORY" || true
            sleep "$COOLDOWN"
        fi
    fi
    
    sleep "$INTERVAL"
done
