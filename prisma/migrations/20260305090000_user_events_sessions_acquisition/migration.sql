/*
  Warnings:

  - A unique constraint covering the columns `[acquisition_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "EventTypeEnum" AS ENUM ('REGISTRATION', 'ACTIVATION', 'FIRST_PAYMENT', 'RELOAD_PAYMENT');

-- CreateEnum
CREATE TYPE "SessionPlaceEnum" AS ENUM ('WEB', 'BOT', 'TELEGRAM_MINIAPP');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "acquisition_id" TEXT;

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "event_type" "EventTypeEnum" NOT NULL,
    "amount_stars" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "source" TEXT,
    "referral_id" TEXT,
    "start_params" TEXT,
    "compaing_id" TEXT,
    "record_id" TEXT,
    "other_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acquisitions" (
    "id" TEXT NOT NULL,
    "first_source" TEXT,
    "first_referral_id" TEXT,
    "first_start_params" TEXT,
    "first_compaing_id" TEXT,
    "first_record_id" TEXT,
    "first_other_data" JSONB,
    "first_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_source" TEXT,
    "last_referral_id" TEXT,
    "last_start_params" TEXT,
    "last_compaing_id" TEXT,
    "last_record_id" TEXT,
    "last_other_data" JSONB,
    "last_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acquisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "place" "SessionPlaceEnum" NOT NULL DEFAULT 'WEB',
    "ip" TEXT,
    "user_agent" TEXT,
    "browser" JSONB,
    "device" JSONB,
    "os" JSONB,
    "country" TEXT,
    "source" TEXT,
    "referral_id" TEXT,
    "start_params" TEXT,
    "compaing_id" TEXT,
    "record_id" TEXT,
    "other_data" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_acquisition_id_key" ON "users"("acquisition_id");

-- CreateIndex
CREATE INDEX "events_user_id_idx" ON "events"("user_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- Backfill acquisitions for existing users
DO $$
DECLARE
    user_row RECORD;
    new_id TEXT;
    inviter_telegram_id TEXT;
BEGIN
    FOR user_row IN SELECT id FROM "users" WHERE "acquisition_id" IS NULL LOOP
        SELECT inviter_user."telegram_id"
        INTO inviter_telegram_id
        FROM "referrals" r
        JOIN "users" inviter_user ON inviter_user."id" = r."inviter_id"
        WHERE r."referral_id" = user_row.id
          AND r."level" = 1
        ORDER BY r."created_at" ASC, r."inviter_id" ASC
        LIMIT 1;

        new_id := (SELECT md5(random()::text || clock_timestamp()::text || user_row.id)::uuid::text);

        INSERT INTO "acquisitions" (
            "id",
            "first_referral_id",
            "last_referral_id",
            "last_at"
        )
        VALUES (
            new_id,
            inviter_telegram_id,
            inviter_telegram_id,
            NOW()
        );

        UPDATE "users"
        SET "acquisition_id" = new_id
        WHERE "id" = user_row.id;
    END LOOP;
END $$;

-- Backfill registration events for all users
WITH inviter_l1 AS (
    SELECT
        r."referral_id" AS "user_id",
        inviter_user."telegram_id" AS "inviter_telegram_id",
        ROW_NUMBER() OVER (
            PARTITION BY r."referral_id"
            ORDER BY r."created_at" ASC, r."inviter_id" ASC
        ) AS "rn"
    FROM "referrals" r
    JOIN "users" inviter_user ON inviter_user."id" = r."inviter_id"
    WHERE r."level" = 1
)
INSERT INTO "events" ("id", "event_type", "referral_id", "user_id")
SELECT
    md5(random()::text || clock_timestamp()::text || u."id" || 'REGISTRATION')::uuid::text,
    'REGISTRATION'::"EventTypeEnum",
    il."inviter_telegram_id",
    u."id"
FROM "users" u
LEFT JOIN inviter_l1 il
    ON il."user_id" = u."id"
   AND il."rn" = 1;

-- Backfill activation events:
-- 1) if user has at least one subscription
-- 2) or has at least one completed payment
WITH inviter_l1 AS (
    SELECT
        r."referral_id" AS "user_id",
        inviter_user."telegram_id" AS "inviter_telegram_id",
        ROW_NUMBER() OVER (
            PARTITION BY r."referral_id"
            ORDER BY r."created_at" ASC, r."inviter_id" ASC
        ) AS "rn"
    FROM "referrals" r
    JOIN "users" inviter_user ON inviter_user."id" = r."inviter_id"
    WHERE r."level" = 1
)
INSERT INTO "events" ("id", "event_type", "referral_id", "user_id")
SELECT
    md5(random()::text || clock_timestamp()::text || u."id" || 'ACTIVATION')::uuid::text,
    'ACTIVATION'::"EventTypeEnum",
    il."inviter_telegram_id",
    u."id"
FROM "users" u
LEFT JOIN inviter_l1 il
    ON il."user_id" = u."id"
   AND il."rn" = 1
WHERE EXISTS (
    SELECT 1
    FROM "subscriptions" s
    WHERE s."user_id" = u."id"
)
OR EXISTS (
    SELECT 1
    FROM "payments" p
    WHERE p."user_id" = u."id"
      AND p."status" = 'COMPLETED'
);

-- Backfill first payment events from first completed payment
WITH completed_payments AS (
    SELECT
        p.*,
        ROW_NUMBER() OVER (
            PARTITION BY p."user_id"
            ORDER BY p."created_at" ASC, p."id" ASC
        ) AS "rn"
    FROM "payments" p
    WHERE p."status" = 'COMPLETED'
),
inviter_l1 AS (
    SELECT
        r."referral_id" AS "user_id",
        inviter_user."telegram_id" AS "inviter_telegram_id",
        ROW_NUMBER() OVER (
            PARTITION BY r."referral_id"
            ORDER BY r."created_at" ASC, r."inviter_id" ASC
        ) AS "rn"
    FROM "referrals" r
    JOIN "users" inviter_user ON inviter_user."id" = r."inviter_id"
    WHERE r."level" = 1
)
INSERT INTO "events" (
    "id",
    "event_type",
    "amount_stars",
    "referral_id",
    "created_at",
    "user_id"
)
SELECT
    md5(random()::text || clock_timestamp()::text || p."id" || 'FIRST_PAYMENT')::uuid::text,
    'FIRST_PAYMENT'::"EventTypeEnum",
    p."amount_stars"::numeric(18, 6),
    il."inviter_telegram_id",
    p."created_at",
    p."user_id"
FROM completed_payments p
LEFT JOIN inviter_l1 il
    ON il."user_id" = p."user_id"
   AND il."rn" = 1
WHERE p."rn" = 1;

-- Backfill reload payment events from all subsequent completed payments
WITH completed_payments AS (
    SELECT
        p.*,
        ROW_NUMBER() OVER (
            PARTITION BY p."user_id"
            ORDER BY p."created_at" ASC, p."id" ASC
        ) AS "rn"
    FROM "payments" p
    WHERE p."status" = 'COMPLETED'
),
inviter_l1 AS (
    SELECT
        r."referral_id" AS "user_id",
        inviter_user."telegram_id" AS "inviter_telegram_id",
        ROW_NUMBER() OVER (
            PARTITION BY r."referral_id"
            ORDER BY r."created_at" ASC, r."inviter_id" ASC
        ) AS "rn"
    FROM "referrals" r
    JOIN "users" inviter_user ON inviter_user."id" = r."inviter_id"
    WHERE r."level" = 1
)
INSERT INTO "events" (
    "id",
    "event_type",
    "amount_stars",
    "referral_id",
    "created_at",
    "user_id"
)
SELECT
    md5(random()::text || clock_timestamp()::text || p."id" || 'RELOAD_PAYMENT')::uuid::text,
    'RELOAD_PAYMENT'::"EventTypeEnum",
    p."amount_stars"::numeric(18, 6),
    il."inviter_telegram_id",
    p."created_at",
    p."user_id"
FROM completed_payments p
LEFT JOIN inviter_l1 il
    ON il."user_id" = p."user_id"
   AND il."rn" = 1
WHERE p."rn" > 1;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_acquisition_id_fkey" FOREIGN KEY ("acquisition_id") REFERENCES "acquisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
