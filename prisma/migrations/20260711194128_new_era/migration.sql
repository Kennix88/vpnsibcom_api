/*
  Warnings:

  - The values [TRIAL,TRAFFIC,NEW_ERA] on the enum `SubscriptionPeriodEnum` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `subscription_id` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `isPremium` on the `referrals` table. All the data in the column will be lost.
  - You are about to drop the column `limit_subscriptions` on the `roles` table. All the data in the column will be lost.
  - You are about to drop the column `all_base_servers_price_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `all_premium_servers_price_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `devices_price_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `is_active_fake_ads` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `last_fake_ads_send` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `next_fake_ads_hours` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `partner_bot_link` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `partner_mini_app_link` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `partner_site_link` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `premium_servers_price_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `proxy_partner_link` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `remove_old_subscriptions_after` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `routing_url` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `servers_price_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `subscription_removal_after_inactive_days` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `traffic_gb_price_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `unlimit_traffic_price_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `announce` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `data_limit` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `days` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `devices_count` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `expired_at` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `is_all_base_servers` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `is_all_premium_servers` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `is_auto_renewal` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `is_premium` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `is_unlimit_traffic` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `last_user_agent` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `life_time_used_traffic` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `links` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `marzban_data` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `next_renewal_stars` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `online_at` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `period` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `period_multiplier` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `plan_key` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `removal_at` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `token` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `traffic_limit_gb` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `traffic_reset` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `used_traffic` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `is_free_plan_available` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `devices` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `green_list` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `plans` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `subscription_to_green_list` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `xray_inbounds` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[uuid]` on the table `subscriptions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[shortUuid]` on the table `subscriptions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[subscription_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "InternalSquadsEnum" AS ENUM ('FREE', 'PREMIUM', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "ExternalSquadEnum" AS ENUM ('GLOBAL', 'RU_ROUTING', 'RU_ROUTING_FRAGMENT');

-- AlterEnum
ALTER TYPE "PaymentTypeEnum" ADD VALUE 'PAY_PREMIUM_SUBSCRIPTION';

-- AlterEnum
ALTER TYPE "TransactionReasonEnum" ADD VALUE 'PREMIUM';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "UserRoleEnum" ADD VALUE 'SUPPORT';
ALTER TYPE "UserRoleEnum" ADD VALUE 'VOLUNTEER';

-- DropForeignKey
ALTER TABLE "devices" DROP CONSTRAINT "devices_subscription_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_subscription_id_fkey";

-- DropForeignKey
ALTER TABLE "subscription_to_green_list" DROP CONSTRAINT "subscription_to_green_list_green_list_id_fkey";

-- DropForeignKey
ALTER TABLE "subscription_to_green_list" DROP CONSTRAINT "subscription_to_green_list_subscription_id_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_plan_key_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_user_id_fkey";

-- DropIndex
DROP INDEX "subscriptions_token_idx";

-- DropIndex
DROP INDEX "subscriptions_token_key";

-- DropIndex
DROP INDEX "subscriptions_user_id_idx";

-- AlterTable: drop old "period" column from subscriptions BEFORE touching the enum,
-- so the enum-swap below no longer needs to convert any existing "period" columns.
ALTER TABLE "subscriptions" DROP COLUMN "announce",
DROP COLUMN "data_limit",
DROP COLUMN "days",
DROP COLUMN "deleted_at",
DROP COLUMN "devices_count",
DROP COLUMN "expired_at",
DROP COLUMN "is_active",
DROP COLUMN "is_all_base_servers",
DROP COLUMN "is_all_premium_servers",
DROP COLUMN "is_auto_renewal",
DROP COLUMN "is_premium",
DROP COLUMN "is_unlimit_traffic",
DROP COLUMN "last_user_agent",
DROP COLUMN "life_time_used_traffic",
DROP COLUMN "links",
DROP COLUMN "marzban_data",
DROP COLUMN "name",
DROP COLUMN "next_renewal_stars",
DROP COLUMN "online_at",
DROP COLUMN "period",
DROP COLUMN "period_multiplier",
DROP COLUMN "plan_key",
DROP COLUMN "removal_at",
DROP COLUMN "token",
DROP COLUMN "traffic_limit_gb",
DROP COLUMN "traffic_reset",
DROP COLUMN "used_traffic",
DROP COLUMN "user_id",
ADD COLUMN     "shortUuid" TEXT,
ADD COLUMN     "subscription_url" TEXT,
ADD COLUMN     "uuid" TEXT;

-- AlterEnum: rename SubscriptionPeriodEnum, drop removed values (TRIAL, TRAFFIC, NEW_ERA).
-- No existing column still references the old type at this point (subscriptions.period
-- was just dropped above; payments.period doesn't exist yet), so no USING-cast is needed.
BEGIN;
CREATE TYPE "SubscriptionPeriodEnum_new" AS ENUM ('HOUR', 'DAY', 'WEEK', 'MONTH', 'THREE_MONTH', 'SIX_MONTH', 'YEAR', 'TWO_YEAR', 'THREE_YEAR', 'INDEFINITELY');
ALTER TYPE "SubscriptionPeriodEnum" RENAME TO "SubscriptionPeriodEnum_old";
ALTER TYPE "SubscriptionPeriodEnum_new" RENAME TO "SubscriptionPeriodEnum";
DROP TYPE "public"."SubscriptionPeriodEnum_old";
COMMIT;

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "subscription_id",
ADD COLUMN     "period" "SubscriptionPeriodEnum";

-- AlterTable
ALTER TABLE "referrals" DROP COLUMN "isPremium";

-- AlterTable
ALTER TABLE "roles" DROP COLUMN "limit_subscriptions",
ADD COLUMN     "is_auto_renewing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role_name" TEXT;

-- AlterTable
ALTER TABLE "settings" DROP COLUMN "all_base_servers_price_stars",
DROP COLUMN "all_premium_servers_price_stars",
DROP COLUMN "devices_price_stars",
DROP COLUMN "is_active_fake_ads",
DROP COLUMN "last_fake_ads_send",
DROP COLUMN "next_fake_ads_hours",
DROP COLUMN "partner_bot_link",
DROP COLUMN "partner_mini_app_link",
DROP COLUMN "partner_site_link",
DROP COLUMN "premium_servers_price_stars",
DROP COLUMN "proxy_partner_link",
DROP COLUMN "remove_old_subscriptions_after",
DROP COLUMN "routing_url",
DROP COLUMN "servers_price_stars",
DROP COLUMN "subscription_removal_after_inactive_days",
DROP COLUMN "traffic_gb_price_stars",
DROP COLUMN "unlimit_traffic_price_stars";

-- AlterTable
ALTER TABLE "subscription_extensions" ADD COLUMN     "is_auto_renewing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role_name" TEXT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "is_free_plan_available",
ADD COLUMN     "subscription_id" TEXT;

-- DropTable
DROP TABLE "devices";

-- DropTable
DROP TABLE "green_list";

-- DropTable
DROP TABLE "plans";

-- DropTable
DROP TABLE "subscription_to_green_list";

-- DropTable
DROP TABLE "xray_inbounds";

-- DropEnum
DROP TYPE "PlansEnum";

-- DropEnum
DROP TYPE "PlansServersSelectTypeEnum";

-- DropEnum
DROP TYPE "TrafficResetEnum";

-- DropEnum
DROP TYPE "XrayInboundTypeEnum";

-- CreateTable
CREATE TABLE "internal_squads" (
    "key" "InternalSquadsEnum" NOT NULL,
    "uuid" TEXT NOT NULL,

    CONSTRAINT "internal_squads_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "external_squads" (
    "key" "ExternalSquadEnum" NOT NULL,
    "uuid" TEXT NOT NULL,

    CONSTRAINT "external_squads_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "default_sub_data" (
    "key" "DefaultEnum" NOT NULL DEFAULT 'DEFAULT',
    "devices_count" INTEGER NOT NULL DEFAULT 1,
    "is_premium_servers" BOOLEAN NOT NULL DEFAULT false,
    "traffic_limit_gb" DOUBLE PRECISION,
    "is_unlimit_traffic" BOOLEAN NOT NULL DEFAULT false,
    "days" INTEGER,
    "is_no_ads" BOOLEAN NOT NULL DEFAULT false,
    "is_role_chat" BOOLEAN NOT NULL DEFAULT false,
    "is_auto_renewing" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "default_sub_data_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_squads_uuid_key" ON "internal_squads"("uuid");

-- CreateIndex
CREATE INDEX "internal_squads_uuid_idx" ON "internal_squads"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "external_squads_uuid_key" ON "external_squads"("uuid");

-- CreateIndex
CREATE INDEX "external_squads_uuid_idx" ON "external_squads"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_uuid_key" ON "subscriptions"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_shortUuid_key" ON "subscriptions"("shortUuid");

-- CreateIndex
CREATE INDEX "subscriptions_shortUuid_idx" ON "subscriptions"("shortUuid");

-- CreateIndex
CREATE INDEX "subscriptions_uuid_idx" ON "subscriptions"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "users_subscription_id_key" ON "users"("subscription_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
