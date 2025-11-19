/*
  Warnings:

  - You are about to drop the column `ads_reward_traffic` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `ads_task_reward_traffic` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `min_withdrawal_stars` on the `settings` table. All the data in the column will be lost.
  - Added the required column `block_id` to the `ads_views` table without a default value. This is not possible if the table is not empty.
  - Added the required column `verify_key` to the `ads_views` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."AdsBlockPlaceEnum" AS ENUM ('TASK', 'REWARD_TASK');

-- AlterTable
ALTER TABLE "public"."ads_views" ADD COLUMN     "block_id" TEXT NOT NULL,
ADD COLUMN     "claimed_at" TIMESTAMP(3),
ADD COLUMN     "duration" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reward_stars" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reward_tickets" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reward_traffic" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "verify_key" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."settings" DROP COLUMN "ads_reward_traffic",
DROP COLUMN "ads_task_reward_traffic",
DROP COLUMN "min_withdrawal_stars",
ADD COLUMN     "min_withdrawal_ton" DOUBLE PRECISION NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "public"."ads_blocks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "place" "public"."AdsBlockPlaceEnum" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "reward_traffic" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reward_stars" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reward_tickets" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "network_key" "public"."AdsNetworkEnum" NOT NULL DEFAULT 'ADSGRAM',

    CONSTRAINT "ads_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reward_log" (
    "id" TEXT NOT NULL,
    "reward_stars" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reward_tickets" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reward_traffic" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "reference" TEXT,
    "ip" TEXT,
    "ua" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "reward_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ads_blocks_place_key" ON "public"."ads_blocks"("place");

-- CreateIndex
CREATE INDEX "ads_blocks_network_key_idx" ON "public"."ads_blocks"("network_key");

-- CreateIndex
CREATE UNIQUE INDEX "ads_blocks_id_place_key" ON "public"."ads_blocks"("id", "place");

-- CreateIndex
CREATE INDEX "ads_views_block_id_idx" ON "public"."ads_views"("block_id");

-- AddForeignKey
ALTER TABLE "public"."ads_views" ADD CONSTRAINT "ads_views_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "public"."ads_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ads_blocks" ADD CONSTRAINT "ads_blocks_network_key_fkey" FOREIGN KEY ("network_key") REFERENCES "public"."ads_networks"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reward_log" ADD CONSTRAINT "reward_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
