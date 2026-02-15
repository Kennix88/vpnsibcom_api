/*
  Warnings:

  - You are about to drop the column `totalWithdrawalsRewarded` on the `referrals` table. All the data in the column will be lost.
  - You are about to drop the column `ads_reward_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `ads_task_reward_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `commission_stars_to_usdt` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `fixed_price_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `free_plan_days` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `free_plan_days_for_referrals` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `referral_invite_premiumreward_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `referral_invite_reward_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `fixed_price_stars` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `is_fixed_price` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `is_hold` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `exchange_limit` on the `user_balance` table. All the data in the column will be lost.
  - You are about to drop the column `is_use_withdrawal_balance` on the `user_balance` table. All the data in the column will be lost.
  - You are about to drop the column `tickets_balance` on the `user_balance` table. All the data in the column will be lost.
  - You are about to drop the column `total_earned_withdrawal_balance` on the `user_balance` table. All the data in the column will be lost.
  - You are about to drop the column `withdrawal_balance` on the `user_balance` table. All the data in the column will be lost.
  - You are about to drop the column `amount_usdt` on the `withdrawals` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."TrafficResetEnum" AS ENUM ('NO_RESET', 'DAY', 'WEEK', 'MONTH', 'YEAR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."BalanceTypeEnum" ADD VALUE 'WAGER';
ALTER TYPE "public"."BalanceTypeEnum" ADD VALUE 'HOLD';
ALTER TYPE "public"."BalanceTypeEnum" ADD VALUE 'TRAFFIC';

-- AlterEnum
ALTER TYPE "public"."PlansEnum" ADD VALUE 'TRAFFIC';

-- AlterEnum
ALTER TYPE "public"."SubscriptionPeriodEnum" ADD VALUE 'TRAFFIC';

-- AlterEnum
ALTER TYPE "public"."TransactionReasonEnum" ADD VALUE 'SYSTEM';

-- DropIndex
DROP INDEX "public"."transactions_is_hold_idx";

-- DropIndex
DROP INDEX "public"."transactions_reason_idx";

-- DropIndex
DROP INDEX "public"."transactions_type_idx";

-- AlterTable
ALTER TABLE "public"."referrals" DROP COLUMN "totalWithdrawalsRewarded",
ADD COLUMN     "totalTrafficRewarded" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."settings" DROP COLUMN "ads_reward_stars",
DROP COLUMN "ads_task_reward_stars",
DROP COLUMN "commission_stars_to_usdt",
DROP COLUMN "fixed_price_stars",
DROP COLUMN "free_plan_days",
DROP COLUMN "free_plan_days_for_referrals",
DROP COLUMN "referral_invite_premiumreward_stars",
DROP COLUMN "referral_invite_reward_stars",
ADD COLUMN     "ads_reward_traffic" DOUBLE PRECISION NOT NULL DEFAULT 102,
ADD COLUMN     "ads_task_reward_traffic" DOUBLE PRECISION NOT NULL DEFAULT 10240,
ADD COLUMN     "referral_invite_premium_reward_gb" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "referral_invite_reward_gb" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "trial_gb" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "trial_gb_for_premium_referrals" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "trial_gb_for_referrals" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "public"."subscriptions" DROP COLUMN "fixed_price_stars",
DROP COLUMN "is_fixed_price",
ADD COLUMN     "announce" TEXT,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Subscription',
ADD COLUMN     "traffic_reset" "public"."TrafficResetEnum" NOT NULL DEFAULT 'DAY';

-- AlterTable
ALTER TABLE "public"."transactions" DROP COLUMN "is_hold";

-- AlterTable
ALTER TABLE "public"."user_balance" DROP COLUMN "exchange_limit",
DROP COLUMN "is_use_withdrawal_balance",
DROP COLUMN "tickets_balance",
DROP COLUMN "total_earned_withdrawal_balance",
DROP COLUMN "withdrawal_balance",
ADD COLUMN     "tickets" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "total_earned" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "traffic" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "wager" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."withdrawals" DROP COLUMN "amount_usdt",
ADD COLUMN     "amount_ton" DOUBLE PRECISION NOT NULL DEFAULT 0;
