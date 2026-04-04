/*
  Warnings:

  - You are about to drop the `reward_log` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "reward_log" DROP CONSTRAINT "reward_log_user_id_fkey";

-- AlterTable
ALTER TABLE "ads_views" ADD COLUMN     "ip" TEXT,
ADD COLUMN     "reward_ad" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ua" TEXT;

-- DropTable
DROP TABLE "reward_log";
