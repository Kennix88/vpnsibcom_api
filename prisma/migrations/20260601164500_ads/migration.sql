-- CreateIndex
CREATE INDEX "ads_views_user_id_created_at_idx" ON "ads_views"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ads_views_user_id_claimed_at_idx" ON "ads_views"("user_id", "claimed_at");
