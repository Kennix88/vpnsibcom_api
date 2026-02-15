/*
  Warnings:

  - The values [BANNER_2,BANNER_3,BANNER_4,BANNER_5,BANNER_6,BANNER_7,BANNER_8] on the enum `AdsBlockPlaceEnum` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `total_earned` on the `user_balance` table. All the data in the column will be lost.
  - You are about to drop the column `wager` on the `user_balance` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AdsBlockPlaceEnum_new" AS ENUM ('TASK', 'REWARD_TASK', 'BANNER', 'FULLSCREEN');
ALTER TABLE "ads_blocks" ALTER COLUMN "place" TYPE "AdsBlockPlaceEnum_new" USING ("place"::text::"AdsBlockPlaceEnum_new");
ALTER TYPE "AdsBlockPlaceEnum" RENAME TO "AdsBlockPlaceEnum_old";
ALTER TYPE "AdsBlockPlaceEnum_new" RENAME TO "AdsBlockPlaceEnum";
DROP TYPE "public"."AdsBlockPlaceEnum_old";
COMMIT;

-- AlterEnum
ALTER TYPE "BalanceTypeEnum" ADD VALUE 'AD';

-- AlterTable
ALTER TABLE "ads_blocks" ADD COLUMN     "reward_ad" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "ad_price_stars" DOUBLE PRECISION NOT NULL DEFAULT 0.125;

-- AlterTable
ALTER TABLE "user_balance" DROP COLUMN "total_earned",
DROP COLUMN "wager",
ADD COLUMN     "ad" DOUBLE PRECISION NOT NULL DEFAULT 0;
