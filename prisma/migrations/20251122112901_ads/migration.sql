-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."AdsBlockPlaceEnum" ADD VALUE 'BANNER_2';
ALTER TYPE "public"."AdsBlockPlaceEnum" ADD VALUE 'BANNER_3';
ALTER TYPE "public"."AdsBlockPlaceEnum" ADD VALUE 'BANNER_4';
ALTER TYPE "public"."AdsBlockPlaceEnum" ADD VALUE 'BANNER_5';
ALTER TYPE "public"."AdsBlockPlaceEnum" ADD VALUE 'BANNER_6';
ALTER TYPE "public"."AdsBlockPlaceEnum" ADD VALUE 'BANNER_7';
ALTER TYPE "public"."AdsBlockPlaceEnum" ADD VALUE 'BANNER_8';
