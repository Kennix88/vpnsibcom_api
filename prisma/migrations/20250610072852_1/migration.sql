-- CreateEnum
CREATE TYPE "DefaultEnum" AS ENUM ('DEFAULT');

-- CreateEnum
CREATE TYPE "AdsNetworkEnum" AS ENUM ('YANDEX', 'ADSGRAM', 'ONCLICKA', 'ADSONAR', 'GIGA', 'MONETAG');

-- CreateEnum
CREATE TYPE "AdsViewTypeEnum" AS ENUM ('REWARD', 'TASK', 'VIEW');

-- CreateEnum
CREATE TYPE "PlansServersSelectTypesEnum" AS ENUM ('ONE_BASE', 'ONE_BASE_OR_PREMIUM', 'CUSTOM', 'NOT_SELECTED');

-- CreateEnum
CREATE TYPE "PlansEnum" AS ENUM ('START', 'BASE', 'PLUS', 'PRO', 'PREMIUM', 'ULTIMATE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SubscriptionPeriodEnum" AS ENUM ('TRIAL', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'THREE_MONTH', 'SIX_MONTH', 'YEAR', 'TWO_YEAR', 'THREE_YEAR', 'INDEFINITELY');

-- CreateEnum
CREATE TYPE "UserRoleEnum" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'FRIEND', 'OLD_USER', 'USER');

-- CreateEnum
CREATE TYPE "CurrencyTypeEnum" AS ENUM ('FIAT', 'CRYPTO', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "CurrencyEnum" AS ENUM ('RUB', 'USD', 'EUR', 'KZT', 'AED', 'ARS', 'AUD', 'AZN', 'AMD', 'BDT', 'BYN', 'BGN', 'BHD', 'BOB', 'BRL', 'CAD', 'CHF', 'CNY', 'COP', 'CZK', 'DKK', 'EGP', 'GBP', 'HKD', 'HUF', 'INR', 'IDR', 'JPY', 'KES', 'KWD', 'MAD', 'MNT', 'MXN', 'NGN', 'NZD', 'OMR', 'PEN', 'PHP', 'PKR', 'PLN', 'QAR', 'RON', 'SAR', 'SEK', 'THB', 'TRY', 'TWD', 'UAH', 'UGX', 'VND', 'ZAR', 'GEL', 'KGS', 'MDL', 'NOK', 'XDR', 'SGD', 'TJS', 'TMT', 'UZS', 'RSD', 'KRW', 'TON', 'MAJOR', 'NOT', 'HMSTR', 'DOGS', 'CATI', 'USDT', 'XTR', 'JETTON', 'PX', 'GRAM', 'CATS');

-- CreateEnum
CREATE TYPE "TransactionTypeEnum" AS ENUM ('PLUS', 'MINUS');

-- CreateEnum
CREATE TYPE "BalanceTypeEnum" AS ENUM ('PAYMENT', 'WITHDRAWAL', 'TICKETS');

-- CreateEnum
CREATE TYPE "TransactionReasonEnum" AS ENUM ('WITHDRAWAL', 'SUBSCRIPTIONS', 'PAYMENT', 'REWARD', 'REFERRAL', 'FINE', 'EXCHANGE', 'GAME');

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
    "telegram_premium_ratio" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "devices_price_stars" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "servers_price_stars" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "premium_servers_price_stars" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "all_base_servers_price_stars" DOUBLE PRECISION NOT NULL DEFAULT 17,
    "all_premium_servers_price_stars" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "traffic_gb_price_stars" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "unlimit_traffic_price_stars" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "hour_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 1.39,
    "day_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 1.31,
    "week_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 1.25,
    "three_mouthes_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 0.97,
    "six_mouthes_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 0.94,
    "one_year_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 0.88,
    "two_year_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 0.76,
    "three_year_ratio_payment" DOUBLE PRECISION NOT NULL DEFAULT 0.64,
    "indefinitely_ratio" DOUBLE PRECISION NOT NULL DEFAULT 120,
    "fixed_price_stars" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "min_withdrawal_stars" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "commission_stars_to_usdt" DOUBLE PRECISION NOT NULL DEFAULT 0.90,
    "ads_reward_stars" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "ads_task_reward_stars" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "referral_one_level_percent" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "referral_two_level_percent" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "referral_three_level_percent" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "referral_invite_reward_stars" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "referral_invite_premiumreward_stars" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "free_plan_days" INTEGER NOT NULL DEFAULT 3,
    "free_plan_days_for_referrals" INTEGER NOT NULL DEFAULT 7,

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
    "totalPaymentsRewarded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWithdrawalsRewarded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActivated" BOOLEAN NOT NULL DEFAULT false,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegram_id" TEXT NOT NULL,
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
    "currency_key" "CurrencyEnum" NOT NULL DEFAULT 'USD',

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
    "tickets_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchange_limit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "green_list" (
    "green" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "code" TEXT NOT NULL,
    "flag_key" TEXT NOT NULL,
    "flag_emoji" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "network" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "green_list_pkey" PRIMARY KEY ("green")
);

-- CreateTable
CREATE TABLE "plans" (
    "key" "PlansEnum" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "price_stars" DOUBLE PRECISION DEFAULT 0,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "devices_count" INTEGER NOT NULL DEFAULT 1,
    "is_all_base_servers" BOOLEAN NOT NULL DEFAULT false,
    "is_all_premium_servers" BOOLEAN NOT NULL DEFAULT false,
    "traffic_limit_gb" DOUBLE PRECISION,
    "is_unlimit_traffic" BOOLEAN NOT NULL DEFAULT false,
    "servers_select_types" "PlansServersSelectTypesEnum" NOT NULL DEFAULT 'NOT_SELECTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "plan_key" "PlansEnum" NOT NULL DEFAULT 'CUSTOM',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_auto_renewal" BOOLEAN NOT NULL DEFAULT true,
    "token" TEXT NOT NULL,
    "period" "SubscriptionPeriodEnum" NOT NULL DEFAULT 'MONTH',
    "period_multiplier" INTEGER NOT NULL DEFAULT 1,
    "next_renewal_stars" DOUBLE PRECISION,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "is_fixed_price" BOOLEAN NOT NULL DEFAULT false,
    "fixed_price_stars" DOUBLE PRECISION,
    "devices_count" INTEGER NOT NULL DEFAULT 1,
    "is_all_base_servers" BOOLEAN NOT NULL DEFAULT false,
    "is_all_premium_servers" BOOLEAN NOT NULL DEFAULT false,
    "traffic_limit_gb" DOUBLE PRECISION,
    "is_unlimit_traffic" BOOLEAN NOT NULL DEFAULT false,
    "links" JSONB,
    "last_user_agent" TEXT,
    "data_limit" INTEGER NOT NULL DEFAULT 0,
    "used_traffic" INTEGER NOT NULL DEFAULT 0,
    "life_time_used_traffic" INTEGER NOT NULL DEFAULT 0,
    "marzban_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expired_at" TIMESTAMP(3),
    "online_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_to_green_list" (
    "subscription_id" TEXT NOT NULL,
    "green_list_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_to_green_list_pkey" PRIMARY KEY ("subscription_id","green_list_id")
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
    "type" "CurrencyTypeEnum" NOT NULL DEFAULT 'FIAT',
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
    "amount_usdt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 1,
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
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount_stars" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchange_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "token" TEXT NOT NULL,
    "link_pay" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "currency_key" "CurrencyEnum" NOT NULL,
    "method_key" "PaymentMethodEnum" NOT NULL,
    "transaction_id" TEXT,
    "subscription_id" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "key" "PaymentMethodEnum" NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
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
CREATE INDEX "referrals_inviter_id_idx" ON "referrals"("inviter_id");

-- CreateIndex
CREATE INDEX "referrals_referral_id_idx" ON "referrals"("referral_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_data_id_key" ON "users"("telegram_data_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_balance_id_key" ON "users"("balance_id");

-- CreateIndex
CREATE INDEX "users_telegram_id_idx" ON "users"("telegram_id");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "users_language_id_idx" ON "users"("language_id");

-- CreateIndex
CREATE INDEX "users_currency_key_idx" ON "users"("currency_key");

-- CreateIndex
CREATE INDEX "ads_views_user_id_idx" ON "ads_views"("user_id");

-- CreateIndex
CREATE INDEX "ads_views_network_key_idx" ON "ads_views"("network_key");

-- CreateIndex
CREATE UNIQUE INDEX "green_list_code_key" ON "green_list"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_username_key" ON "subscriptions"("username");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_token_key" ON "subscriptions"("token");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_token_idx" ON "subscriptions"("token");

-- CreateIndex
CREATE INDEX "subscriptions_username_idx" ON "subscriptions"("username");

-- CreateIndex
CREATE INDEX "subscription_to_green_list_subscription_id_idx" ON "subscription_to_green_list"("subscription_id");

-- CreateIndex
CREATE INDEX "subscription_to_green_list_green_list_id_idx" ON "subscription_to_green_list"("green_list_id");

-- CreateIndex
CREATE UNIQUE INDEX "language_iso_639_1_key" ON "language"("iso_639_1");

-- CreateIndex
CREATE UNIQUE INDEX "language_iso_639_2_key" ON "language"("iso_639_2");

-- CreateIndex
CREATE UNIQUE INDEX "language_iso_639_3_key" ON "language"("iso_639_3");

-- CreateIndex
CREATE UNIQUE INDEX "currency_coinmarketcap_ucid_key" ON "currency"("coinmarketcap_ucid");

-- CreateIndex
CREATE INDEX "transactions_balance_id_idx" ON "transactions"("balance_id");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "transactions_reason_idx" ON "transactions"("reason");

-- CreateIndex
CREATE INDEX "transactions_is_hold_idx" ON "transactions"("is_hold");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_transaction_id_key" ON "withdrawals"("transaction_id");

-- CreateIndex
CREATE INDEX "withdrawals_user_id_idx" ON "withdrawals"("user_id");

-- CreateIndex
CREATE INDEX "withdrawals_status_idx" ON "withdrawals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_token_key" ON "payments"("token");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_id_key" ON "payments"("transaction_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_token_idx" ON "payments"("token");

-- CreateIndex
CREATE INDEX "payments_currency_key_idx" ON "payments"("currency_key");

-- CreateIndex
CREATE INDEX "payments_method_key_idx" ON "payments"("method_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_ton_smart_contract_address_key" ON "payment_methods"("ton_smart_contract_address");

-- CreateIndex
CREATE INDEX "payment_methods_is_active_idx" ON "payment_methods"("is_active");

-- CreateIndex
CREATE INDEX "payment_methods_currency_key_idx" ON "payment_methods"("currency_key");

-- CreateIndex
CREATE INDEX "payment_methods_type_idx" ON "payment_methods"("type");

-- CreateIndex
CREATE INDEX "payment_methods_system_idx" ON "payment_methods"("system");

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
ALTER TABLE "users" ADD CONSTRAINT "users_currency_key_fkey" FOREIGN KEY ("currency_key") REFERENCES "currency"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads_views" ADD CONSTRAINT "ads_views_network_key_fkey" FOREIGN KEY ("network_key") REFERENCES "ads_networks"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads_views" ADD CONSTRAINT "ads_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_key_fkey" FOREIGN KEY ("plan_key") REFERENCES "plans"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_to_green_list" ADD CONSTRAINT "subscription_to_green_list_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_to_green_list" ADD CONSTRAINT "subscription_to_green_list_green_list_id_fkey" FOREIGN KEY ("green_list_id") REFERENCES "green_list"("green") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_key_fkey" FOREIGN KEY ("method_key") REFERENCES "payment_methods"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_currency_key_fkey" FOREIGN KEY ("currency_key") REFERENCES "currency"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
