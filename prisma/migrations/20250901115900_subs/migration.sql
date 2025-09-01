-- CreateEnum
CREATE TYPE "TrafficResetEnum" AS ENUM ('no_reset', 'day', 'week', 'month', 'year');

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "announce" TEXT,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Subscription',
ADD COLUMN     "traffic_reset" "TrafficResetEnum" NOT NULL DEFAULT 'day';
