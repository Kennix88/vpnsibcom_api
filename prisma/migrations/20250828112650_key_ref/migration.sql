/*
  Warnings:

  - A unique constraint covering the columns `[inviter_id,referral_id,level]` on the table `referrals` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "referrals_inviter_id_referral_id_level_key" ON "referrals"("inviter_id", "referral_id", "level");
