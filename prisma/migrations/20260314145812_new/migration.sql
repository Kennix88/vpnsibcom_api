/*
  Warnings:

  - You are about to drop the column `reward_ad` on the `ads_blocks` table. All the data in the column will be lost.
  - You are about to drop the column `reward_stars` on the `ads_blocks` table. All the data in the column will be lost.
  - You are about to drop the column `reward_tickets` on the `ads_blocks` table. All the data in the column will be lost.
  - You are about to drop the column `reward_traffic` on the `ads_blocks` table. All the data in the column will be lost.
  - You are about to drop the column `reward_ad` on the `ads_views` table. All the data in the column will be lost.
  - You are about to drop the column `reward_tickets` on the `ads_views` table. All the data in the column will be lost.
  - You are about to drop the column `reward_traffic` on the `ads_views` table. All the data in the column will be lost.
  - You are about to drop the column `totalPaymentsRewarded` on the `referrals` table. All the data in the column will be lost.
  - You are about to drop the column `totalTrafficRewarded` on the `referrals` table. All the data in the column will be lost.
  - You are about to drop the column `ad_price_stars` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `min_withdrawal_ton` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `referral_invite_premium_reward_gb` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `referral_invite_reward_gb` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `trial_gb` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `trial_gb_for_premium_referrals` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `trial_gb_for_referrals` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `ad` on the `user_balance` table. All the data in the column will be lost.
  - You are about to drop the column `tickets` on the `user_balance` table. All the data in the column will be lost.
  - You are about to drop the column `traffic` on the `user_balance` table. All the data in the column will be lost.
  - You are about to alter the column `payment_balance` on the `user_balance` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,6)`.
  - You are about to alter the column `hold_balance` on the `user_balance` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,6)`.
  - You are about to drop the column `amount_ton` on the `withdrawals` table. All the data in the column will be lost.
  - You are about to alter the column `amount_stars` on the `withdrawals` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(16,8)`.

*/
-- AlterEnum
ALTER TYPE "AdsBlockPlaceEnum" ADD VALUE 'MESSAGE';

-- AlterEnum
ALTER TYPE "BalanceTypeEnum" ADD VALUE 'USDT';

-- AlterTable
ALTER TABLE "ads_blocks" DROP COLUMN "reward_ad",
DROP COLUMN "reward_stars",
DROP COLUMN "reward_tickets",
DROP COLUMN "reward_traffic";

-- AlterTable
ALTER TABLE "ads_views" DROP COLUMN "reward_ad",
DROP COLUMN "reward_tickets",
DROP COLUMN "reward_traffic";

-- AlterTable
ALTER TABLE "referrals" DROP COLUMN "totalPaymentsRewarded",
DROP COLUMN "totalTrafficRewarded",
ADD COLUMN     "totalUsdtRewarded" DECIMAL(18,6) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "settings" DROP COLUMN "ad_price_stars",
DROP COLUMN "min_withdrawal_ton",
DROP COLUMN "referral_invite_premium_reward_gb",
DROP COLUMN "referral_invite_reward_gb",
DROP COLUMN "trial_gb",
DROP COLUMN "trial_gb_for_premium_referrals",
DROP COLUMN "trial_gb_for_referrals",
ADD COLUMN     "min_withdrawal_usdt" DOUBLE PRECISION NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "user_balance" DROP COLUMN "ad",
DROP COLUMN "tickets",
DROP COLUMN "traffic",
ADD COLUMN     "usdt" DECIMAL(18,6) NOT NULL DEFAULT 0,
ALTER COLUMN "payment_balance" SET DATA TYPE DECIMAL(18,6),
ALTER COLUMN "hold_balance" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "withdrawals" DROP COLUMN "amount_ton",
ADD COLUMN     "amount_usdt" DECIMAL(16,8) NOT NULL DEFAULT 0,
ALTER COLUMN "amount_stars" SET DATA TYPE DECIMAL(16,8);

-- CreateTable
CREATE TABLE "ads_rewards" (
    "key" "DefaultEnum" NOT NULL DEFAULT 'DEFAULT',
    "task_view" DECIMAL(18,6) NOT NULL DEFAULT 0.125,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ads_rewards_pkey" PRIMARY KEY ("key")
);
