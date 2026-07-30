/*
  Warnings:

  - You are about to drop the column `key_in_system` on the `payment_methods` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "payment_methods" DROP COLUMN "key_in_system";
