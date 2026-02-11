-- Populate UserAdsData for existing users
DO $$
DECLARE
    user_row RECORD;
    new_id TEXT;
BEGIN
    FOR user_row IN SELECT id FROM "users" WHERE "ads_data_id" IS NULL LOOP
        -- Generate a new UUID for the ads data
        new_id := (SELECT md5(random()::text || clock_timestamp()::text || user_row.id)::uuid::text);
        
        -- Insert into user_ads_data
        INSERT INTO "user_ads_data" ("id", "updated_at")
        VALUES (new_id, NOW());
        
        -- Link user to ads data
        UPDATE "users" SET "ads_data_id" = new_id WHERE id = user_row.id;
    END LOOP;
END $$;