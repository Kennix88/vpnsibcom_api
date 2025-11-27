/*
  Warnings:

  - A unique constraint covering the columns `[verify_key]` on the table `ads_views` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ads_blocks" ADD COLUMN     "key" TEXT NOT NULL DEFAULT 'KEY';

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "ads_reward_next_completion_in_minute" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "adsgram_task_next_completion_in_minute" INTEGER NOT NULL DEFAULT 360;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "next_ads_reward_at" TIMESTAMP(3),
ADD COLUMN     "next_adsgram_task_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "ads_views_verify_key_key" ON "ads_views"("verify_key");
