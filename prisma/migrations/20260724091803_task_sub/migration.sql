/*
  Warnings:

  - You are about to drop the column `default_announce` on the `settings` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventTypeEnum" ADD VALUE 'WEEK_SUB';
ALTER TYPE "EventTypeEnum" ADD VALUE 'REACTIVATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubscriptionExtensionsEnum" ADD VALUE 'REFERRAL_3';
ALTER TYPE "SubscriptionExtensionsEnum" ADD VALUE 'REFERRAL_5';
ALTER TYPE "SubscriptionExtensionsEnum" ADD VALUE 'REFERRAL_10';
ALTER TYPE "SubscriptionExtensionsEnum" ADD VALUE 'REFERRAL_25';
ALTER TYPE "SubscriptionExtensionsEnum" ADD VALUE 'REFERRAL_50';
ALTER TYPE "SubscriptionExtensionsEnum" ADD VALUE 'REFERRAL_100';
ALTER TYPE "SubscriptionExtensionsEnum" ADD VALUE 'REFERRAL_REACTIVATION_10';
ALTER TYPE "SubscriptionExtensionsEnum" ADD VALUE 'REFERRAL_REACTIVATION_50';
ALTER TYPE "SubscriptionExtensionsEnum" ADD VALUE 'REFERRAL_REACTIVATION_100';

-- AlterTable
ALTER TABLE "referrals" ADD COLUMN     "is_week_sub" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "settings" DROP COLUMN "default_announce",
ADD COLUMN     "reactivation_days" INTEGER NOT NULL DEFAULT 90;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "reactivation_at" TIMESTAMP(3),
ADD COLUMN     "referral_reactivations" INTEGER NOT NULL DEFAULT 0;
