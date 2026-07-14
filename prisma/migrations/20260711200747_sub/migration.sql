/*
  Warnings:

  - Made the column `shortUuid` on table `subscriptions` required. This step will fail if there are existing NULL values in that column.
  - Made the column `uuid` on table `subscriptions` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "shortUuid" SET NOT NULL,
ALTER COLUMN "uuid" SET NOT NULL;
