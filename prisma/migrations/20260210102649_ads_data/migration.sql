/*
  Warnings:

  - A unique constraint covering the columns `[ads_data_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdsNetworkEnum" ADD VALUE 'TADDY';
ALTER TYPE "AdsNetworkEnum" ADD VALUE 'RICHADS';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ads_data_id" TEXT;

-- CreateTable
CREATE TABLE "user_ads_data" (
    "id" TEXT NOT NULL,
    "last_fullscreen_viewed_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3),
    "last_message_network" "AdsNetworkEnum",
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ads_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_ads_data_id_key" ON "users"("ads_data_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_ads_data_id_fkey" FOREIGN KEY ("ads_data_id") REFERENCES "user_ads_data"("id") ON DELETE SET NULL ON UPDATE CASCADE;
