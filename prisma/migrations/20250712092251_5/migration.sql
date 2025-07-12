-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "amount_stars_fee_tg_partner" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "is_tg_partner_program" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "commission_ratio_tg_partner_program" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
ADD COLUMN     "is_active_tg_partner_program" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mouthes_count_tg_partner_program" INTEGER,
ADD COLUMN     "telegram_partner_program_ratio" DOUBLE PRECISION NOT NULL DEFAULT 1.3;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_tg_program_partner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tg_program_partner_expired_at" TIMESTAMP(3);
