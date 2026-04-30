-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "is_active_check_users" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_active_import_users" BOOLEAN NOT NULL DEFAULT false;
