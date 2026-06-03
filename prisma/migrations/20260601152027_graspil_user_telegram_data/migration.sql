-- AlterTable
ALTER TABLE "user_telegram_data" ADD COLUMN     "fake" BOOLEAN,
ADD COLUMN     "gender" INTEGER,
ADD COLUMN     "personal_channel_id" TEXT,
ADD COLUMN     "scam" BOOLEAN,
ADD COLUMN     "stargifts_count" INTEGER,
ADD COLUMN     "verified" BOOLEAN;
