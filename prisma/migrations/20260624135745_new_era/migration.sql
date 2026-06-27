-- CreateEnum
CREATE TYPE "SubscriptionExtensionsEnum" AS ENUM ('PREMIUM', 'CHANNEL', 'CHAT', 'BIO', 'NAME');

-- AlterEnum
ALTER TYPE "PlansEnum" ADD VALUE 'NEW_ERA';

-- AlterEnum
ALTER TYPE "SubscriptionPeriodEnum" ADD VALUE 'NEW_ERA';

-- AlterTable
ALTER TABLE "acquisitions" ADD COLUMN     "last_ip" TEXT,
ADD COLUMN     "last_telegram_platform" "TelegramPlatformEnum",
ADD COLUMN     "last_user_agent" TEXT;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "days" INTEGER,
ADD COLUMN     "is_no_ads" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_role_chat" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "devices_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_no_ads" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_premium_servers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_role_chat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_unlimit_traffic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "traffic_limit_gb" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "channel_id" TEXT NOT NULL DEFAULT '-1001695733492',
ADD COLUMN     "chat_id" TEXT NOT NULL DEFAULT '-1001670520580',
ADD COLUMN     "premium_status_discount_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
ADD COLUMN     "premium_status_price_stars" DOUBLE PRECISION NOT NULL DEFAULT 1499,
ADD COLUMN     "remove_old_subscriptions_after" TIMESTAMP(3),
ADD COLUMN     "subscription_removal_after_inactive_days" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "happ_crypto_url" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_channel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_chat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "premium_expired_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "subscription_extensions" (
    "key" "SubscriptionExtensionsEnum" NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 0,
    "devices_count" INTEGER NOT NULL DEFAULT 0,
    "traffic_limit_gb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_unlimit_traffic" BOOLEAN NOT NULL DEFAULT false,
    "is_premium_servers" BOOLEAN NOT NULL DEFAULT false,
    "is_no_ads" BOOLEAN NOT NULL DEFAULT false,
    "is_role_chat" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "subscription_extensions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "model" TEXT,
    "hwid" TEXT NOT NULL,
    "os_version" TEXT,
    "os" TEXT,
    "locale" TEXT,
    "happ_version" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "happ_crypto_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "subscription_id" TEXT NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_token_key" ON "devices"("token");

-- CreateIndex
CREATE INDEX "devices_token_idx" ON "devices"("token");

-- CreateIndex
CREATE INDEX "devices_hwid_idx" ON "devices"("hwid");

-- CreateIndex
CREATE UNIQUE INDEX "devices_subscription_id_hwid_key" ON "devices"("subscription_id", "hwid");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
