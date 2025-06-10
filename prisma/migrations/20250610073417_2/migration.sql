/*
  Warnings:

  - You are about to drop the column `servers_select_types` on the `plans` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PlansServersSelectTypeEnum" AS ENUM ('ONE_BASE', 'ONE_BASE_OR_PREMIUM', 'CUSTOM', 'NOT_SELECTED');

-- AlterTable
ALTER TABLE "plans" DROP COLUMN "servers_select_types",
ADD COLUMN     "servers_select_type" "PlansServersSelectTypeEnum" NOT NULL DEFAULT 'NOT_SELECTED';

-- DropEnum
DROP TYPE "PlansServersSelectTypesEnum";
