-- Очистка старых данных подписок (переход на новую систему подписок)

-- 1. Отвязываем пользователей от старых подписок
UPDATE "users"
SET "subscription_id" = NULL
WHERE "subscription_id" IS NOT NULL;

-- 2. Удаляем все старые подписки
DELETE FROM "subscriptions";
