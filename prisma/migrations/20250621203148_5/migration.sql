-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "is_created" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_invoicing" BOOLEAN NOT NULL DEFAULT false;
