-- Seed default AdsRewards row if missing
INSERT INTO "ads_rewards" ("key", "task_view", "updated_at")
VALUES ('DEFAULT', 0.125, NOW())
ON CONFLICT ("key") DO NOTHING;
