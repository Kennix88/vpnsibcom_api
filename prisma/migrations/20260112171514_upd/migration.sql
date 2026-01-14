-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "min_pay_stars" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "settings" ALTER COLUMN "ads_reward_next_completion_in_minute" SET DEFAULT 1,
ALTER COLUMN "ads_reward_next_completion_in_minute" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "adsgram_task_next_completion_in_minute" SET DEFAULT 360,
ALTER COLUMN "adsgram_task_next_completion_in_minute" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "deleted_at" TIMESTAMP(3);
