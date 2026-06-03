/*
  Warnings:

  - You are about to drop the column `show_linux` on the `ads_blocks` table. All the data in the column will be lost.
  - You are about to drop the column `show_mac` on the `ads_blocks` table. All the data in the column will be lost.
  - You are about to drop the column `show_windows` on the `ads_blocks` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ads_blocks" DROP COLUMN "show_linux",
DROP COLUMN "show_mac",
DROP COLUMN "show_windows",
ADD COLUMN     "show_desktop" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_web" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ads_rewards" ADD COLUMN     "bot_message" DECIMAL(18,6) NOT NULL DEFAULT 2,
ADD COLUMN     "task_adsgram" DECIMAL(18,6) NOT NULL DEFAULT 2,
ALTER COLUMN "task_view" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "ads_views" ADD COLUMN     "redirect_url" TEXT;
