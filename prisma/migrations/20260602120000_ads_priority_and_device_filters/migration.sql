-- AlterTable
ALTER TABLE "ads_networks" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "ads_blocks"
ADD COLUMN "show_windows" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "show_android" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "show_ios" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "show_mac" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "show_linux" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "show_bot" BOOLEAN NOT NULL DEFAULT true;

-- Preserve previous Adsgram behavior: it was available only for Android/iOS TMA.
UPDATE "ads_blocks"
SET
  "show_windows" = false,
  "show_mac" = false,
  "show_linux" = false,
  "show_bot" = false
WHERE "network_key" = 'ADSGRAM';

