-- AlterTable
ALTER TABLE "user_telegram_data" ADD COLUMN     "birth_day" INTEGER,
ADD COLUMN     "birth_month" INTEGER,
ADD COLUMN     "birth_year" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "country_registration" TEXT;
