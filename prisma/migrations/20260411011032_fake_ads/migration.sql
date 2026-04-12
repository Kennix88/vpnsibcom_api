-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "is_active_fake_ads" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_fake_ads_send" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "next_fake_ads_hours" INTEGER NOT NULL DEFAULT 6;
