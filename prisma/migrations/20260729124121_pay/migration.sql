-- CreateEnum
CREATE TYPE "PaymentMethodCategoryEnum" AS ENUM ('MAIN', 'RUS', 'RESERVE', 'CRYPTO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethodEnum" ADD VALUE 'AURAPAY_CARD';
ALTER TYPE "PaymentMethodEnum" ADD VALUE 'AURAPAY_SBP';
ALTER TYPE "PaymentMethodEnum" ADD VALUE 'PLATEGA_CARD';
ALTER TYPE "PaymentMethodEnum" ADD VALUE 'PLATEGA_SBP';
ALTER TYPE "PaymentMethodEnum" ADD VALUE 'HELEKET';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentSystemEnum" ADD VALUE 'XROCKET';
ALTER TYPE "PaymentSystemEnum" ADD VALUE 'AURAPAY';
ALTER TYPE "PaymentSystemEnum" ADD VALUE 'PLATEGA';
ALTER TYPE "PaymentSystemEnum" ADD VALUE 'HELEKET';

-- AlterTable
ALTER TABLE "payment_methods" ADD COLUMN     "bridge" TEXT,
ADD COLUMN     "category" "PaymentMethodCategoryEnum" NOT NULL DEFAULT 'RESERVE',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "is_visible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "key_in_system" TEXT;
