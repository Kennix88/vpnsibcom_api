-- CreateEnum
CREATE TYPE "CurrencyTypeEnum" AS ENUM ('FIAT', 'CRYPTO', 'TELEGRAM');

-- AlterTable
ALTER TABLE "currency" ADD COLUMN     "type" "CurrencyTypeEnum" NOT NULL DEFAULT 'FIAT';
