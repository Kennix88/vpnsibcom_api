/*
  Warnings:

  - You are about to drop the column `is_created` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `is_invoicing` on the `subscriptions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."subscriptions" DROP COLUMN "is_created",
DROP COLUMN "is_invoicing";
