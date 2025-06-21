-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_balance_id_fkey";

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "balance_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_balance_id_fkey" FOREIGN KEY ("balance_id") REFERENCES "user_balance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
