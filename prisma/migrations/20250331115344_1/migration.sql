-- CreateEnum
CREATE TYPE "DefaultEnum" AS ENUM ('DEFAULT');

-- CreateEnum
CREATE TYPE "AdsNetworkEnum" AS ENUM ('YANDEX', 'ADSGRAM', 'ONCLICKA', 'ADSONAR', 'GIGA', 'MONETAG');

-- CreateEnum
CREATE TYPE "AdsViewTypeEnum" AS ENUM ('REWARD', 'TASK', 'VIEW');

-- CreateEnum
CREATE TYPE "SubscriptionPeriodEnum" AS ENUM ('TRIAL', 'HOUR', 'DAY', 'MONTH', 'THREE_MONTH', 'SIX_MONTH', 'YEAR', 'TWO_YEAR', 'THREE_YEAR');

-- CreateEnum
CREATE TYPE "UserRoleEnum" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'FRIEND', 'OLD_USER', 'USER');

-- CreateEnum
CREATE TYPE "CurrencyEnum" AS ENUM ('RUB', 'USD', 'EUR', 'KZT', 'TON', 'MAJOR', 'NOT', 'HMSTR', 'DOGS', 'CATI', 'USDT', 'XCH', 'JETTON', 'PX', 'GRAM', 'CATS');

-- CreateEnum
CREATE TYPE "TransactionTypeEnum" AS ENUM ('PLUS', 'MINUS');

-- CreateEnum
CREATE TYPE "BalanceTypeEnum" AS ENUM ('PAYMENT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "TransactionReasonEnum" AS ENUM ('WITHDRAWAL', 'PAYMENT', 'REWARD', 'REFERRAL');

-- CreateEnum
CREATE TYPE "WithdrawalStatusEnum" AS ENUM ('CONSIDERATION', 'REJECTED', 'SENT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatusEnum" AS ENUM ('PENDING', 'COMPLETED', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentSystemEnum" AS ENUM ('PAYEER', 'VOLET', 'WATA', 'TOME', 'TELEGRAM', 'CRYPTOMUS', 'CRYPTOBOT', 'TON_BLOCKCHAIN', 'PAYPALYCH', 'SKINSBACK');

-- CreateEnum
CREATE TYPE "PaymentMethodTypeEnum" AS ENUM ('CRYPTOCURRENCY', 'CARD', 'SBP', 'STARS', 'WALLET', 'SKINS');

-- CreateEnum
CREATE TYPE "PaymentMethodEnum" AS ENUM ('STARS', 'TOME_CARD', 'TOME_SBP', 'PAYPALYCH_RUB', 'PAYPALYCH_SBP', 'PAYPALYCH_USD', 'PAYPALYCH_EUR', 'WATA_RUB', 'WATA_USD', 'WATA_EUR', 'PAYEER_RUB', 'PAYEER_USD', 'PAYEER_EUR', 'VOLET_RUB', 'VOLET_USD', 'VOLET_EUR', 'CRYPTOMUS', 'CRYPTOBOT', 'XROCKET', 'TON_TON', 'USDT_TON', 'NOT_TON', 'MAJOR_TON', 'HMSTR_TON', 'DOGS_TON', 'CATI_TON', 'JETTON_TON', 'PX_TON', 'GRAM_TON', 'CATS_TON', 'SKINSBACK');

-- CreateTable
CREATE TABLE "settings" (
    "key" "DefaultEnum" NOT NULL DEFAULT 'DEFAULT',
    "tg_stars_to_usd" DOUBLE PRECISION NOT NULL DEFAULT 0.013,
    "price_subscription_stars" INTEGER NOT NULL DEFAULT 699,
    "comission_stars_to_ton" DOUBLE PRECISION NOT NULL DEFAULT 0.90,
    "ads_reward_stars" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "ads_task_reward_stars" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "hour_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 1.39,
    "day_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 1.31,
    "three_mouthes_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 0.97,
    "six_mouthes_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 0.94,
    "one_year_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 0.88,
    "two_year_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 0.76,
    "three_year_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 0.64,
    "referral_one_level_percent" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "referral_two_level_percent" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "referral_three_level_percent" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "referral_invite_reward_stars" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "referral_invite_premiumreward_stars" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "limit_devices" INTEGER NOT NULL DEFAULT 10,
    "free_plan_days" INTEGER NOT NULL DEFAULT 7,
    "free_plan_days_for_referrals" INTEGER NOT NULL DEFAULT 14,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "user_telegram_data" (
    "id" TEXT NOT NULL,
    "is_live" BOOLEAN NOT NULL DEFAULT false,
    "is_rtl" BOOLEAN NOT NULL DEFAULT false,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "username" TEXT,
    "language_code" TEXT NOT NULL,
    "photo_url" TEXT,
    "added_to_attachment_menu" BOOLEAN NOT NULL DEFAULT false,
    "allows_write_to_pm" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_telegram_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "inviter_id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegram_id" TEXT NOT NULL,
    "ton_wallet" TEXT,
    "is_free_plan_available" BOOLEAN NOT NULL DEFAULT true,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_started_at" TIMESTAMP(3),
    "banned_expired_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "role_id" "UserRoleEnum" NOT NULL DEFAULT 'USER',
    "telegram_data_id" TEXT,
    "balance_id" TEXT,
    "language_id" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads_views" (
    "id" TEXT NOT NULL,
    "network_key" "AdsNetworkEnum" NOT NULL DEFAULT 'ADSGRAM',
    "type" "AdsViewTypeEnum" NOT NULL DEFAULT 'REWARD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "ads_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads_networks" (
    "key" "AdsNetworkEnum" NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ads_networks_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "user_balance" (
    "id" TEXT NOT NULL,
    "payment_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hold_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_earned_withdrawal_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "withdrawal_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_use_withdrawal_balance" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_auto_renewal" BOOLEAN NOT NULL DEFAULT true,
    "token" TEXT NOT NULL,
    "period" "SubscriptionPeriodEnum" NOT NULL DEFAULT 'MONTH',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expired_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "key" "UserRoleEnum" NOT NULL,
    "name" TEXT NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "limit_subscriptions" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "language" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "native_name" TEXT NOT NULL,
    "iso_639_1" TEXT NOT NULL,
    "iso_639_2" TEXT NOT NULL,
    "iso_639_3" TEXT NOT NULL,

    CONSTRAINT "language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency" (
    "key" "CurrencyEnum" NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "coinmarketcap_ucid" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currency_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_hold" BOOLEAN NOT NULL DEFAULT false,
    "type" "TransactionTypeEnum" NOT NULL DEFAULT 'PLUS',
    "reason" "TransactionReasonEnum" NOT NULL DEFAULT 'PAYMENT',
    "balance_type" "BalanceTypeEnum" NOT NULL DEFAULT 'PAYMENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "hold_expired_at" TIMESTAMP(3),
    "balance_id" TEXT NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "status" "WithdrawalStatusEnum" NOT NULL DEFAULT 'CONSIDERATION',
    "amount_stars" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount_ton" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "status" "PaymentStatusEnum" NOT NULL DEFAULT 'PENDING',
    "amount" TEXT NOT NULL DEFAULT '0',
    "exchangeRate" TEXT NOT NULL DEFAULT '0',
    "token" TEXT NOT NULL,
    "linkPay" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "currency_key" "CurrencyEnum" NOT NULL,
    "subscription_id" TEXT,
    "method_key" "PaymentMethodEnum" NOT NULL,
    "transaction_id" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "key" "PaymentMethodEnum" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "is_ton_blockchain" BOOLEAN NOT NULL DEFAULT false,
    "ton_smart_contract_address" TEXT,
    "min_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_amount" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "is_plus_commission" BOOLEAN NOT NULL DEFAULT false,
    "type" "PaymentMethodTypeEnum" NOT NULL DEFAULT 'CARD',
    "system" "PaymentSystemEnum" NOT NULL DEFAULT 'TELEGRAM',
    "currency_key" "CurrencyEnum" NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_ton_wallet_key" ON "users"("ton_wallet");

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_data_id_key" ON "users"("telegram_data_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_balance_id_key" ON "users"("balance_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_username_key" ON "subscriptions"("username");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_token_key" ON "subscriptions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "language_iso_639_1_key" ON "language"("iso_639_1");

-- CreateIndex
CREATE UNIQUE INDEX "language_iso_639_2_key" ON "language"("iso_639_2");

-- CreateIndex
CREATE UNIQUE INDEX "language_iso_639_3_key" ON "language"("iso_639_3");

-- CreateIndex
CREATE UNIQUE INDEX "currency_coinmarketcap_ucid_key" ON "currency"("coinmarketcap_ucid");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_transaction_id_key" ON "withdrawals"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_token_key" ON "payments"("token");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_id_key" ON "payments"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_ton_smart_contract_address_key" ON "payment_methods"("ton_smart_contract_address");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_telegram_data_id_fkey" FOREIGN KEY ("telegram_data_id") REFERENCES "user_telegram_data"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_balance_id_fkey" FOREIGN KEY ("balance_id") REFERENCES "user_balance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads_views" ADD CONSTRAINT "ads_views_network_key_fkey" FOREIGN KEY ("network_key") REFERENCES "ads_networks"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads_views" ADD CONSTRAINT "ads_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_balance_id_fkey" FOREIGN KEY ("balance_id") REFERENCES "user_balance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_key_fkey" FOREIGN KEY ("currency_key") REFERENCES "currency"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_key_fkey" FOREIGN KEY ("method_key") REFERENCES "payment_methods"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_currency_key_fkey" FOREIGN KEY ("currency_key") REFERENCES "currency"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
