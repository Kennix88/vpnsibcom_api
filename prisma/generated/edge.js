
Object.defineProperty(exports, "__esModule", { value: true });

const {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
  getPrismaClient,
  sqltag,
  empty,
  join,
  raw,
  skip,
  Decimal,
  Debug,
  objectEnumValues,
  makeStrictEnum,
  Extensions,
  warnOnce,
  defineDmmfProperty,
  Public,
  getRuntime,
  createParam,
} = require('./runtime/edge.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 6.5.0
 * Query Engine version: 173f8d54f8d52e692c7e27e72a88314ec7aeff60
 */
Prisma.prismaVersion = {
  client: "6.5.0",
  engine: "173f8d54f8d52e692c7e27e72a88314ec7aeff60"
}

Prisma.PrismaClientKnownRequestError = PrismaClientKnownRequestError;
Prisma.PrismaClientUnknownRequestError = PrismaClientUnknownRequestError
Prisma.PrismaClientRustPanicError = PrismaClientRustPanicError
Prisma.PrismaClientInitializationError = PrismaClientInitializationError
Prisma.PrismaClientValidationError = PrismaClientValidationError
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = sqltag
Prisma.empty = empty
Prisma.join = join
Prisma.raw = raw
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = Extensions.getExtensionContext
Prisma.defineExtension = Extensions.defineExtension

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}





/**
 * Enums
 */
exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.SettingsScalarFieldEnum = {
  key: 'key',
  tgStarsToUSD: 'tgStarsToUSD',
  priceSubscriptionStars: 'priceSubscriptionStars',
  comissionStarsToTon: 'comissionStarsToTon',
  adsRewardStars: 'adsRewardStars',
  adsTaskRewardStars: 'adsTaskRewardStars',
  hourRatioPayment: 'hourRatioPayment',
  dayRatioPayment: 'dayRatioPayment',
  threeMouthesRatioPayment: 'threeMouthesRatioPayment',
  sixMouthesRatioPayment: 'sixMouthesRatioPayment',
  oneYearRatioPayment: 'oneYearRatioPayment',
  twoYearRatioPayment: 'twoYearRatioPayment',
  threeYearRatioPayment: 'threeYearRatioPayment',
  referralOneLevelPercent: 'referralOneLevelPercent',
  referralTwoLevelPercent: 'referralTwoLevelPercent',
  referralThreeLevelPercent: 'referralThreeLevelPercent',
  referralInviteRewardStars: 'referralInviteRewardStars',
  referralInvitePremiumRewardStars: 'referralInvitePremiumRewardStars',
  limitDevices: 'limitDevices',
  freePlanDays: 'freePlanDays',
  freePlanDaysForReferrals: 'freePlanDaysForReferrals'
};

exports.Prisma.UserTelegramDataScalarFieldEnum = {
  id: 'id',
  isLive: 'isLive',
  isRtl: 'isRtl',
  isPremium: 'isPremium',
  isBot: 'isBot',
  firstName: 'firstName',
  lastName: 'lastName',
  username: 'username',
  languageCode: 'languageCode',
  photoUrl: 'photoUrl',
  addedToAttachmentMenu: 'addedToAttachmentMenu',
  allowsWriteToPm: 'allowsWriteToPm',
  updatedAt: 'updatedAt'
};

exports.Prisma.ReferralsScalarFieldEnum = {
  id: 'id',
  level: 'level',
  inviterId: 'inviterId',
  referralId: 'referralId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UsersScalarFieldEnum = {
  id: 'id',
  telegramId: 'telegramId',
  tonWallet: 'tonWallet',
  isFreePlanAvailable: 'isFreePlanAvailable',
  isBanned: 'isBanned',
  isDeleted: 'isDeleted',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  lastStartedAt: 'lastStartedAt',
  banExpiredAt: 'banExpiredAt',
  deletedAt: 'deletedAt',
  roleId: 'roleId',
  telegramDataId: 'telegramDataId',
  balanceId: 'balanceId',
  languageId: 'languageId'
};

exports.Prisma.AdsViewsScalarFieldEnum = {
  id: 'id',
  networkKey: 'networkKey',
  type: 'type',
  createdAt: 'createdAt',
  userId: 'userId'
};

exports.Prisma.AdsNetworksScalarFieldEnum = {
  key: 'key',
  isActive: 'isActive',
  name: 'name'
};

exports.Prisma.UserBalanceScalarFieldEnum = {
  id: 'id',
  paymentBalance: 'paymentBalance',
  holdBalance: 'holdBalance',
  totalEarnedWithdrawalBalance: 'totalEarnedWithdrawalBalance',
  withdrawalBalance: 'withdrawalBalance',
  isUseWithdrawalBalance: 'isUseWithdrawalBalance',
  updatedAt: 'updatedAt'
};

exports.Prisma.SubscriptionsScalarFieldEnum = {
  id: 'id',
  username: 'username',
  isActive: 'isActive',
  isAutoRenewal: 'isAutoRenewal',
  token: 'token',
  period: 'period',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  expiredAt: 'expiredAt',
  userId: 'userId'
};

exports.Prisma.RolesScalarFieldEnum = {
  key: 'key',
  name: 'name',
  discount: 'discount',
  limitSubscriptions: 'limitSubscriptions'
};

exports.Prisma.LanguageScalarFieldEnum = {
  id: 'id',
  name: 'name',
  nativeName: 'nativeName',
  iso6391: 'iso6391',
  iso6392: 'iso6392',
  iso6393: 'iso6393'
};

exports.Prisma.CurrencyScalarFieldEnum = {
  key: 'key',
  name: 'name',
  symbol: 'symbol',
  rate: 'rate',
  coinmarketcapUCID: 'coinmarketcapUCID',
  updatedAt: 'updatedAt'
};

exports.Prisma.TransactionsScalarFieldEnum = {
  id: 'id',
  amount: 'amount',
  isHold: 'isHold',
  type: 'type',
  reason: 'reason',
  balanceType: 'balanceType',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  holdExpiredAt: 'holdExpiredAt',
  balanceId: 'balanceId'
};

exports.Prisma.WithdrawalsScalarFieldEnum = {
  id: 'id',
  status: 'status',
  amountStars: 'amountStars',
  amountUSD: 'amountUSD',
  amountTON: 'amountTON',
  address: 'address',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  userId: 'userId',
  transactionId: 'transactionId'
};

exports.Prisma.PaymentsScalarFieldEnum = {
  id: 'id',
  status: 'status',
  amount: 'amount',
  exchangeRate: 'exchangeRate',
  token: 'token',
  linkPay: 'linkPay',
  details: 'details',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  userId: 'userId',
  currencyKey: 'currencyKey',
  SubscriptionId: 'SubscriptionId',
  methodKey: 'methodKey',
  transactionId: 'transactionId'
};

exports.Prisma.PaymentMethodsScalarFieldEnum = {
  key: 'key',
  name: 'name',
  isActive: 'isActive',
  isTonBlockchain: 'isTonBlockchain',
  tonSmartContractAddress: 'tonSmartContractAddress',
  minAmount: 'minAmount',
  maxAmount: 'maxAmount',
  commission: 'commission',
  isPlusCommission: 'isPlusCommission',
  type: 'type',
  system: 'system',
  currencyKey: 'currencyKey'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.DefaultEnum = exports.$Enums.DefaultEnum = {
  DEFAULT: 'DEFAULT'
};

exports.AdsNetworkEnum = exports.$Enums.AdsNetworkEnum = {
  YANDEX: 'YANDEX',
  ADSGRAM: 'ADSGRAM',
  ONCLICKA: 'ONCLICKA',
  ADSONAR: 'ADSONAR',
  GIGA: 'GIGA',
  MONETAG: 'MONETAG'
};

exports.AdsViewTypeEnum = exports.$Enums.AdsViewTypeEnum = {
  REWARD: 'REWARD',
  TASK: 'TASK',
  VIEW: 'VIEW'
};

exports.SubscriptionPeriodEnum = exports.$Enums.SubscriptionPeriodEnum = {
  TRIAL: 'TRIAL',
  HOUR: 'HOUR',
  DAY: 'DAY',
  MONTH: 'MONTH',
  THREE_MONTH: 'THREE_MONTH',
  SIX_MONTH: 'SIX_MONTH',
  YEAR: 'YEAR',
  TWO_YEAR: 'TWO_YEAR',
  THREE_YEAR: 'THREE_YEAR'
};

exports.UserRoleEnum = exports.$Enums.UserRoleEnum = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  FRIEND: 'FRIEND',
  OLD_USER: 'OLD_USER',
  USER: 'USER'
};

exports.CurrencyEnum = exports.$Enums.CurrencyEnum = {
  RUB: 'RUB',
  USD: 'USD',
  EUR: 'EUR',
  KZT: 'KZT',
  TON: 'TON',
  MAJOR: 'MAJOR',
  NOT: 'NOT',
  HMSTR: 'HMSTR',
  DOGS: 'DOGS',
  CATI: 'CATI',
  USDT: 'USDT',
  XCH: 'XCH',
  JETTON: 'JETTON',
  PX: 'PX',
  GRAM: 'GRAM',
  CATS: 'CATS'
};

exports.TransactionTypeEnum = exports.$Enums.TransactionTypeEnum = {
  PLUS: 'PLUS',
  MINUS: 'MINUS'
};

exports.BalanceTypeEnum = exports.$Enums.BalanceTypeEnum = {
  PAYMENT: 'PAYMENT',
  WITHDRAWAL: 'WITHDRAWAL'
};

exports.TransactionReasonEnum = exports.$Enums.TransactionReasonEnum = {
  WITHDRAWAL: 'WITHDRAWAL',
  PAYMENT: 'PAYMENT',
  REWARD: 'REWARD',
  REFERRAL: 'REFERRAL'
};

exports.WithdrawalStatusEnum = exports.$Enums.WithdrawalStatusEnum = {
  CONSIDERATION: 'CONSIDERATION',
  REJECTED: 'REJECTED',
  SENT: 'SENT',
  EXPIRED: 'EXPIRED'
};

exports.PaymentStatusEnum = exports.$Enums.PaymentStatusEnum = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED',
  FAILED: 'FAILED'
};

exports.PaymentSystemEnum = exports.$Enums.PaymentSystemEnum = {
  PAYEER: 'PAYEER',
  VOLET: 'VOLET',
  WATA: 'WATA',
  TOME: 'TOME',
  TELEGRAM: 'TELEGRAM',
  CRYPTOMUS: 'CRYPTOMUS',
  CRYPTOBOT: 'CRYPTOBOT',
  TON_BLOCKCHAIN: 'TON_BLOCKCHAIN',
  PAYPALYCH: 'PAYPALYCH',
  SKINSBACK: 'SKINSBACK'
};

exports.PaymentMethodTypeEnum = exports.$Enums.PaymentMethodTypeEnum = {
  CRYPTOCURRENCY: 'CRYPTOCURRENCY',
  CARD: 'CARD',
  SBP: 'SBP',
  STARS: 'STARS',
  WALLET: 'WALLET',
  SKINS: 'SKINS'
};

exports.PaymentMethodEnum = exports.$Enums.PaymentMethodEnum = {
  STARS: 'STARS',
  TOME_CARD: 'TOME_CARD',
  TOME_SBP: 'TOME_SBP',
  PAYPALYCH_RUB: 'PAYPALYCH_RUB',
  PAYPALYCH_SBP: 'PAYPALYCH_SBP',
  PAYPALYCH_USD: 'PAYPALYCH_USD',
  PAYPALYCH_EUR: 'PAYPALYCH_EUR',
  WATA_RUB: 'WATA_RUB',
  WATA_USD: 'WATA_USD',
  WATA_EUR: 'WATA_EUR',
  PAYEER_RUB: 'PAYEER_RUB',
  PAYEER_USD: 'PAYEER_USD',
  PAYEER_EUR: 'PAYEER_EUR',
  VOLET_RUB: 'VOLET_RUB',
  VOLET_USD: 'VOLET_USD',
  VOLET_EUR: 'VOLET_EUR',
  CRYPTOMUS: 'CRYPTOMUS',
  CRYPTOBOT: 'CRYPTOBOT',
  XROCKET: 'XROCKET',
  TON_TON: 'TON_TON',
  USDT_TON: 'USDT_TON',
  NOT_TON: 'NOT_TON',
  MAJOR_TON: 'MAJOR_TON',
  HMSTR_TON: 'HMSTR_TON',
  DOGS_TON: 'DOGS_TON',
  CATI_TON: 'CATI_TON',
  JETTON_TON: 'JETTON_TON',
  PX_TON: 'PX_TON',
  GRAM_TON: 'GRAM_TON',
  CATS_TON: 'CATS_TON',
  SKINSBACK: 'SKINSBACK'
};

exports.Prisma.ModelName = {
  Settings: 'Settings',
  UserTelegramData: 'UserTelegramData',
  Referrals: 'Referrals',
  Users: 'Users',
  AdsViews: 'AdsViews',
  AdsNetworks: 'AdsNetworks',
  UserBalance: 'UserBalance',
  Subscriptions: 'Subscriptions',
  Roles: 'Roles',
  Language: 'Language',
  Currency: 'Currency',
  Transactions: 'Transactions',
  Withdrawals: 'Withdrawals',
  Payments: 'Payments',
  PaymentMethods: 'PaymentMethods'
};
/**
 * Create the Client
 */
const config = {
  "generator": {
    "name": "client",
    "provider": {
      "fromEnvVar": null,
      "value": "prisma-client-js"
    },
    "output": {
      "value": "C:\\Users\\shell\\WebstormProjects\\vpnsibcom_api\\prisma\\generated",
      "fromEnvVar": null
    },
    "config": {
      "engineType": "library"
    },
    "binaryTargets": [
      {
        "fromEnvVar": null,
        "value": "windows",
        "native": true
      }
    ],
    "previewFeatures": [],
    "sourceFilePath": "C:\\Users\\shell\\WebstormProjects\\vpnsibcom_api\\prisma\\schema.prisma",
    "isCustomOutput": true
  },
  "relativeEnvPaths": {
    "rootEnvPath": null
  },
  "relativePath": "..",
  "clientVersion": "6.5.0",
  "engineVersion": "173f8d54f8d52e692c7e27e72a88314ec7aeff60",
  "datasourceNames": [
    "db"
  ],
  "activeProvider": "postgresql",
  "postinstall": false,
  "inlineDatasources": {
    "db": {
      "url": {
        "fromEnvVar": "POSTGRES_URI",
        "value": null
      }
    }
  },
  "inlineSchema": "generator client {\n  provider = \"prisma-client-js\"\n  output   = \"./generated\"\n}\n\ndatasource db {\n  provider = \"postgresql\"\n  url      = env(\"POSTGRES_URI\")\n}\n\nenum DefaultEnum {\n  DEFAULT\n}\n\nmodel Settings {\n  key                              DefaultEnum @id @default(DEFAULT)\n  tgStarsToUSD                     Float       @default(0.013) @map(\"tg_stars_to_usd\")\n  priceSubscriptionStars           Int         @default(699) @map(\"price_subscription_stars\")\n  comissionStarsToTon              Float       @default(0.90) @map(\"comission_stars_to_ton\")\n  adsRewardStars                   Float       @default(0.1) @map(\"ads_reward_stars\")\n  adsTaskRewardStars               Float       @default(10) @map(\"ads_task_reward_stars\")\n  hourRatioPayment                 Float       @default(1.39) @map(\"hour_ratio_payment\")\n  dayRatioPayment                  Float       @default(1.31) @map(\"day_ratio_payment\")\n  threeMouthesRatioPayment         Float       @default(0.97) @map(\"three_mouthes_ratio_payment\")\n  sixMouthesRatioPayment           Float       @default(0.94) @map(\"six_mouthes_ratio_payment\")\n  oneYearRatioPayment              Float       @default(0.88) @map(\"one_year_ratio_payment\")\n  twoYearRatioPayment              Float       @default(0.76) @map(\"two_year_ratio_payment\")\n  threeYearRatioPayment            Float       @default(0.64) @map(\"three_year_ratio_payment\")\n  referralOneLevelPercent          Float       @default(0.1) @map(\"referral_one_level_percent\")\n  referralTwoLevelPercent          Float       @default(0.05) @map(\"referral_two_level_percent\")\n  referralThreeLevelPercent        Float       @default(0.01) @map(\"referral_three_level_percent\")\n  referralInviteRewardStars        Float       @default(10) @map(\"referral_invite_reward_stars\")\n  referralInvitePremiumRewardStars Float       @default(50) @map(\"referral_invite_premiumreward_stars\")\n  limitDevices                     Int         @default(10) @map(\"limit_devices\")\n  freePlanDays                     Int         @default(7) @map(\"free_plan_days\")\n  freePlanDaysForReferrals         Int         @default(14) @map(\"free_plan_days_for_referrals\")\n\n  @@map(\"settings\")\n}\n\nmodel UserTelegramData {\n  id                    String   @id @default(uuid())\n  isLive                Boolean  @default(false) @map(\"is_live\")\n  isRtl                 Boolean  @default(false) @map(\"is_rtl\")\n  isPremium             Boolean  @default(false) @map(\"is_premium\")\n  isBot                 Boolean  @default(false) @map(\"is_bot\")\n  firstName             String   @map(\"first_name\")\n  lastName              String?  @map(\"last_name\")\n  username              String?\n  languageCode          String   @map(\"language_code\")\n  photoUrl              String?  @map(\"photo_url\")\n  addedToAttachmentMenu Boolean  @default(false) @map(\"added_to_attachment_menu\")\n  allowsWriteToPm       Boolean  @default(false) @map(\"allows_write_to_pm\")\n  updatedAt             DateTime @updatedAt @map(\"updated_at\")\n\n  user Users?\n\n  @@map(\"user_telegram_data\")\n}\n\nmodel Referrals {\n  id         String @id @default(uuid())\n  level      Int    @default(1)\n  inviter    Users  @relation(\"inviter\", fields: [inviterId], references: [id])\n  inviterId  String @map(\"inviter_id\")\n  referral   Users  @relation(\"referral\", fields: [referralId], references: [id])\n  referralId String @map(\"referral_id\")\n\n  createdAt DateTime @default(now()) @map(\"created_at\")\n  updatedAt DateTime @updatedAt @map(\"updated_at\")\n\n  @@map(\"referrals\")\n}\n\nmodel Users {\n  id                  String  @id @default(uuid())\n  telegramId          String  @unique @map(\"telegram_id\")\n  tonWallet           String? @unique @map(\"ton_wallet\")\n  isFreePlanAvailable Boolean @default(true) @map(\"is_free_plan_available\")\n  isBanned            Boolean @default(false) @map(\"is_banned\")\n  isDeleted           Boolean @default(false) @map(\"is_deleted\")\n\n  createdAt     DateTime  @default(now()) @map(\"created_at\")\n  updatedAt     DateTime  @updatedAt @map(\"updated_at\")\n  lastStartedAt DateTime? @map(\"last_started_at\")\n  banExpiredAt  DateTime? @map(\"banned_expired_at\")\n  deletedAt     DateTime? @map(\"deleted_at\")\n\n  role           Roles             @relation(fields: [roleId], references: [key])\n  roleId         UserRoleEnum      @default(USER) @map(\"role_id\")\n  payments       Payments[]\n  referrals      Referrals[]       @relation(\"referral\")\n  inviters       Referrals[]       @relation(\"inviter\")\n  telegramData   UserTelegramData? @relation(fields: [telegramDataId], references: [id])\n  telegramDataId String?           @unique @map(\"telegram_data_id\")\n  balance        UserBalance?      @relation(fields: [balanceId], references: [id])\n  balanceId      String?           @unique @map(\"balance_id\")\n  language       Language          @relation(fields: [languageId], references: [id])\n  languageId     String            @map(\"language_id\")\n  subscriptions  Subscriptions[]\n  withdrawals    Withdrawals[]\n  adsViews       AdsViews[]\n\n  @@map(\"users\")\n}\n\nmodel AdsViews {\n  id         String          @id @default(uuid())\n  network    AdsNetworks     @relation(fields: [networkKey], references: [key])\n  networkKey AdsNetworkEnum  @default(ADSGRAM) @map(\"network_key\")\n  type       AdsViewTypeEnum @default(REWARD)\n  createdAt  DateTime        @default(now()) @map(\"created_at\")\n\n  user   Users  @relation(fields: [userId], references: [id])\n  userId String @map(\"user_id\")\n\n  @@map(\"ads_views\")\n}\n\nmodel AdsNetworks {\n  key      AdsNetworkEnum @id\n  isActive Boolean        @map(\"is_active\")\n  name     String\n  adsViews AdsViews[]\n\n  @@map(\"ads_networks\")\n}\n\nenum AdsNetworkEnum {\n  YANDEX\n  ADSGRAM\n  ONCLICKA\n  ADSONAR\n  GIGA\n  MONETAG\n}\n\nenum AdsViewTypeEnum {\n  REWARD\n  TASK\n  VIEW\n}\n\nmodel UserBalance {\n  id                           String         @id @default(uuid())\n  paymentBalance               Float          @default(0) @map(\"payment_balance\")\n  holdBalance                  Float          @default(0) @map(\"hold_balance\")\n  totalEarnedWithdrawalBalance Float          @default(0) @map(\"total_earned_withdrawal_balance\")\n  withdrawalBalance            Float          @default(0) @map(\"withdrawal_balance\")\n  isUseWithdrawalBalance       Boolean        @default(true) @map(\"is_use_withdrawal_balance\")\n  updatedAt                    DateTime       @updatedAt @map(\"updated_at\")\n  user                         Users?\n  transactions                 Transactions[]\n\n  @@map(\"user_balance\")\n}\n\nmodel Subscriptions {\n  id            String                 @id @default(uuid())\n  username      String                 @unique\n  isActive      Boolean                @default(false) @map(\"is_active\")\n  isAutoRenewal Boolean                @default(true) @map(\"is_auto_renewal\")\n  token         String                 @unique @map(\"token\")\n  period        SubscriptionPeriodEnum @default(MONTH)\n\n  createdAt DateTime  @default(now()) @map(\"created_at\")\n  updatedAt DateTime  @updatedAt @map(\"updated_at\")\n  expiredAt DateTime? @map(\"expired_at\")\n\n  user     Users      @relation(fields: [userId], references: [id])\n  userId   String     @unique @map(\"user_id\")\n  payments Payments[]\n\n  @@map(\"subscriptions\")\n}\n\nenum SubscriptionPeriodEnum {\n  TRIAL\n  HOUR\n  DAY\n  MONTH\n  THREE_MONTH\n  SIX_MONTH\n  YEAR\n  TWO_YEAR\n  THREE_YEAR\n}\n\nmodel Roles {\n  key                UserRoleEnum @id\n  name               String\n  discount           Float        @default(1)\n  limitSubscriptions Int          @default(10) @map(\"limit_subscriptions\")\n\n  users Users[]\n\n  @@map(\"roles\")\n}\n\nenum UserRoleEnum {\n  SUPER_ADMIN\n  ADMIN\n  FRIEND\n  OLD_USER\n  USER\n}\n\nmodel Language {\n  id         String @id @default(uuid())\n  name       String\n  nativeName String @map(\"native_name\")\n  iso6391    String @unique @map(\"iso_639_1\")\n  iso6392    String @unique @map(\"iso_639_2\")\n  iso6393    String @unique @map(\"iso_639_3\")\n\n  users Users[]\n\n  @@map(\"language\")\n}\n\nmodel Currency {\n  key               CurrencyEnum @id\n  name              String\n  symbol            String\n  rate              Float        @default(1)\n  coinmarketcapUCID String?      @unique @map(\"coinmarketcap_ucid\")\n  updatedAt         DateTime     @updatedAt @map(\"updated_at\")\n\n  payments       Payments[]\n  paymentMethods PaymentMethods[]\n\n  @@map(\"currency\")\n}\n\nenum CurrencyEnum {\n  RUB\n  USD\n  EUR\n  KZT\n  TON\n  MAJOR\n  NOT\n  HMSTR\n  DOGS\n  CATI\n  USDT\n  XCH\n  JETTON\n  PX\n  GRAM\n  CATS\n}\n\nmodel Transactions {\n  id            String                @id @default(uuid())\n  amount        Float                 @default(0)\n  isHold        Boolean               @default(false) @map(\"is_hold\")\n  type          TransactionTypeEnum   @default(PLUS)\n  reason        TransactionReasonEnum @default(PAYMENT)\n  balanceType   BalanceTypeEnum       @default(PAYMENT) @map(\"balance_type\")\n  createdAt     DateTime              @default(now()) @map(\"created_at\")\n  updatedAt     DateTime              @updatedAt @map(\"updated_at\")\n  holdExpiredAt DateTime?             @map(\"hold_expired_at\")\n\n  balance    UserBalance  @relation(fields: [balanceId], references: [id])\n  balanceId  String       @map(\"balance_id\")\n  withdrawal Withdrawals?\n  payment    Payments?\n\n  @@map(\"transactions\")\n}\n\nenum TransactionTypeEnum {\n  PLUS\n  MINUS\n}\n\nenum BalanceTypeEnum {\n  PAYMENT\n  WITHDRAWAL\n}\n\nenum TransactionReasonEnum {\n  WITHDRAWAL\n  PAYMENT\n  REWARD\n  REFERRAL\n}\n\nmodel Withdrawals {\n  id          String               @id @default(uuid())\n  status      WithdrawalStatusEnum @default(CONSIDERATION)\n  amountStars Float                @default(0) @map(\"amount_stars\")\n  amountUSD   Float                @default(0) @map(\"amount_usd\")\n  amountTON   Float                @default(0) @map(\"amount_ton\")\n  address     String\n  createdAt   DateTime             @default(now()) @map(\"created_at\")\n  updatedAt   DateTime             @updatedAt @map(\"updated_at\")\n\n  user          Users        @relation(fields: [userId], references: [id])\n  userId        String       @map(\"user_id\")\n  transacrion   Transactions @relation(fields: [transactionId], references: [id])\n  transactionId String       @unique @map(\"transaction_id\")\n\n  @@map(\"withdrawals\")\n}\n\nenum WithdrawalStatusEnum {\n  CONSIDERATION\n  REJECTED\n  SENT\n  EXPIRED\n}\n\nmodel Payments {\n  id           String            @id @default(uuid())\n  status       PaymentStatusEnum @default(PENDING)\n  amount       String            @default(\"0\")\n  exchangeRate String            @default(\"0\")\n  token        String            @unique\n  linkPay      String?\n  details      Json?             @db.JsonB\n\n  createdAt DateTime @default(now()) @map(\"created_at\")\n  updatedAt DateTime @updatedAt @map(\"updated_at\")\n\n  user           Users             @relation(fields: [userId], references: [id])\n  userId         String            @map(\"user_id\")\n  currency       Currency          @relation(fields: [currencyKey], references: [key])\n  currencyKey    CurrencyEnum      @map(\"currency_key\")\n  Subscription   Subscriptions?    @relation(fields: [SubscriptionId], references: [id])\n  SubscriptionId String?           @map(\"subscription_id\")\n  method         PaymentMethods    @relation(fields: [methodKey], references: [key])\n  methodKey      PaymentMethodEnum @map(\"method_key\")\n  transacrion    Transactions?     @relation(fields: [transactionId], references: [id])\n  transactionId  String?           @unique @map(\"transaction_id\")\n\n  @@map(\"payments\")\n}\n\nenum PaymentStatusEnum {\n  PENDING\n  COMPLETED\n  CANCELED\n  FAILED\n}\n\nmodel PaymentMethods {\n  key                     PaymentMethodEnum     @id\n  name                    String\n  isActive                Boolean               @default(false)\n  isTonBlockchain         Boolean               @default(false) @map(\"is_ton_blockchain\")\n  tonSmartContractAddress String?               @unique @map(\"ton_smart_contract_address\")\n  minAmount               Float                 @default(0) @map(\"min_amount\")\n  maxAmount               Float                 @default(10000) @map(\"max_amount\")\n  commission              Float                 @default(1)\n  isPlusCommission        Boolean               @default(false) @map(\"is_plus_commission\")\n  type                    PaymentMethodTypeEnum @default(CARD)\n  system                  PaymentSystemEnum     @default(TELEGRAM)\n\n  payments    Payments[]\n  currency    Currency     @relation(fields: [currencyKey], references: [key])\n  currencyKey CurrencyEnum @map(\"currency_key\")\n\n  @@map(\"payment_methods\")\n}\n\nenum PaymentSystemEnum {\n  PAYEER\n  VOLET\n  WATA\n  TOME\n  TELEGRAM\n  CRYPTOMUS\n  CRYPTOBOT\n  TON_BLOCKCHAIN\n  PAYPALYCH\n  SKINSBACK\n}\n\nenum PaymentMethodTypeEnum {\n  CRYPTOCURRENCY\n  CARD\n  SBP\n  STARS\n  WALLET\n  SKINS\n}\n\nenum PaymentMethodEnum {\n  STARS\n  TOME_CARD\n  TOME_SBP\n  PAYPALYCH_RUB\n  PAYPALYCH_SBP\n  PAYPALYCH_USD\n  PAYPALYCH_EUR\n  WATA_RUB\n  WATA_USD\n  WATA_EUR\n  PAYEER_RUB\n  PAYEER_USD\n  PAYEER_EUR\n  VOLET_RUB\n  VOLET_USD\n  VOLET_EUR\n  CRYPTOMUS\n  CRYPTOBOT\n  XROCKET\n  TON_TON\n  USDT_TON\n  NOT_TON\n  MAJOR_TON\n  HMSTR_TON\n  DOGS_TON\n  CATI_TON\n  JETTON_TON\n  PX_TON\n  GRAM_TON\n  CATS_TON\n  SKINSBACK\n}\n",
  "inlineSchemaHash": "10f675b12089321f1507d57e7588c6f56b5f269cb0be144ec6ecbcd1b6a326ca",
  "copyEngine": true
}
config.dirname = '/'

config.runtimeDataModel = JSON.parse("{\"models\":{\"Settings\":{\"dbName\":\"settings\",\"schema\":null,\"fields\":[{\"name\":\"key\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DefaultEnum\",\"nativeType\":null,\"default\":\"DEFAULT\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"tgStarsToUSD\",\"dbName\":\"tg_stars_to_usd\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0.013000000000000001,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"priceSubscriptionStars\",\"dbName\":\"price_subscription_stars\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Int\",\"nativeType\":null,\"default\":699,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"comissionStarsToTon\",\"dbName\":\"comission_stars_to_ton\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0.9,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"adsRewardStars\",\"dbName\":\"ads_reward_stars\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0.1,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"adsTaskRewardStars\",\"dbName\":\"ads_task_reward_stars\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":10,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"hourRatioPayment\",\"dbName\":\"hour_ratio_payment\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":1.3900000000000001,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"dayRatioPayment\",\"dbName\":\"day_ratio_payment\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":1.31,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"threeMouthesRatioPayment\",\"dbName\":\"three_mouthes_ratio_payment\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0.97,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"sixMouthesRatioPayment\",\"dbName\":\"six_mouthes_ratio_payment\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0.9400000000000001,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"oneYearRatioPayment\",\"dbName\":\"one_year_ratio_payment\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0.88,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"twoYearRatioPayment\",\"dbName\":\"two_year_ratio_payment\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0.76,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"threeYearRatioPayment\",\"dbName\":\"three_year_ratio_payment\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0.64,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"referralOneLevelPercent\",\"dbName\":\"referral_one_level_percent\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0.1,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"referralTwoLevelPercent\",\"dbName\":\"referral_two_level_percent\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0.05,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"referralThreeLevelPercent\",\"dbName\":\"referral_three_level_percent\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0.01,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"referralInviteRewardStars\",\"dbName\":\"referral_invite_reward_stars\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":10,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"referralInvitePremiumRewardStars\",\"dbName\":\"referral_invite_premiumreward_stars\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":50,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"limitDevices\",\"dbName\":\"limit_devices\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Int\",\"nativeType\":null,\"default\":10,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"freePlanDays\",\"dbName\":\"free_plan_days\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Int\",\"nativeType\":null,\"default\":7,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"freePlanDaysForReferrals\",\"dbName\":\"free_plan_days_for_referrals\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Int\",\"nativeType\":null,\"default\":14,\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"UserTelegramData\":{\"dbName\":\"user_telegram_data\",\"schema\":null,\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"nativeType\":null,\"default\":{\"name\":\"uuid\",\"args\":[4]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isLive\",\"dbName\":\"is_live\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isRtl\",\"dbName\":\"is_rtl\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isPremium\",\"dbName\":\"is_premium\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isBot\",\"dbName\":\"is_bot\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"firstName\",\"dbName\":\"first_name\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"lastName\",\"dbName\":\"last_name\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"username\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"languageCode\",\"dbName\":\"language_code\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"photoUrl\",\"dbName\":\"photo_url\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"addedToAttachmentMenu\",\"dbName\":\"added_to_attachment_menu\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"allowsWriteToPm\",\"dbName\":\"allows_write_to_pm\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"user\",\"kind\":\"object\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Users\",\"nativeType\":null,\"relationName\":\"UserTelegramDataToUsers\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"Referrals\":{\"dbName\":\"referrals\",\"schema\":null,\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"nativeType\":null,\"default\":{\"name\":\"uuid\",\"args\":[4]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"level\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Int\",\"nativeType\":null,\"default\":1,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"inviter\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Users\",\"nativeType\":null,\"relationName\":\"inviter\",\"relationFromFields\":[\"inviterId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"inviterId\",\"dbName\":\"inviter_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"referral\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Users\",\"nativeType\":null,\"relationName\":\"referral\",\"relationFromFields\":[\"referralId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"referralId\",\"dbName\":\"referral_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"nativeType\":null,\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":true}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"Users\":{\"dbName\":\"users\",\"schema\":null,\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"nativeType\":null,\"default\":{\"name\":\"uuid\",\"args\":[4]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"telegramId\",\"dbName\":\"telegram_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":true,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"tonWallet\",\"dbName\":\"ton_wallet\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":true,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isFreePlanAvailable\",\"dbName\":\"is_free_plan_available\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":true,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isBanned\",\"dbName\":\"is_banned\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isDeleted\",\"dbName\":\"is_deleted\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"nativeType\":null,\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"lastStartedAt\",\"dbName\":\"last_started_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"banExpiredAt\",\"dbName\":\"banned_expired_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"deletedAt\",\"dbName\":\"deleted_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"role\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Roles\",\"nativeType\":null,\"relationName\":\"RolesToUsers\",\"relationFromFields\":[\"roleId\"],\"relationToFields\":[\"key\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"roleId\",\"dbName\":\"role_id\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":true,\"type\":\"UserRoleEnum\",\"nativeType\":null,\"default\":\"USER\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"payments\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Payments\",\"nativeType\":null,\"relationName\":\"PaymentsToUsers\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"referrals\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Referrals\",\"nativeType\":null,\"relationName\":\"referral\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"inviters\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Referrals\",\"nativeType\":null,\"relationName\":\"inviter\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"telegramData\",\"kind\":\"object\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"UserTelegramData\",\"nativeType\":null,\"relationName\":\"UserTelegramDataToUsers\",\"relationFromFields\":[\"telegramDataId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"telegramDataId\",\"dbName\":\"telegram_data_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":true,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"balance\",\"kind\":\"object\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"UserBalance\",\"nativeType\":null,\"relationName\":\"UserBalanceToUsers\",\"relationFromFields\":[\"balanceId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"balanceId\",\"dbName\":\"balance_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":true,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"language\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Language\",\"nativeType\":null,\"relationName\":\"LanguageToUsers\",\"relationFromFields\":[\"languageId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"languageId\",\"dbName\":\"language_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"subscriptions\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Subscriptions\",\"nativeType\":null,\"relationName\":\"SubscriptionsToUsers\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"withdrawals\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Withdrawals\",\"nativeType\":null,\"relationName\":\"UsersToWithdrawals\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"adsViews\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"AdsViews\",\"nativeType\":null,\"relationName\":\"AdsViewsToUsers\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"AdsViews\":{\"dbName\":\"ads_views\",\"schema\":null,\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"nativeType\":null,\"default\":{\"name\":\"uuid\",\"args\":[4]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"network\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"AdsNetworks\",\"nativeType\":null,\"relationName\":\"AdsNetworksToAdsViews\",\"relationFromFields\":[\"networkKey\"],\"relationToFields\":[\"key\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"networkKey\",\"dbName\":\"network_key\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":true,\"type\":\"AdsNetworkEnum\",\"nativeType\":null,\"default\":\"ADSGRAM\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"type\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"AdsViewTypeEnum\",\"nativeType\":null,\"default\":\"REWARD\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"nativeType\":null,\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"user\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Users\",\"nativeType\":null,\"relationName\":\"AdsViewsToUsers\",\"relationFromFields\":[\"userId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"userId\",\"dbName\":\"user_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"AdsNetworks\":{\"dbName\":\"ads_networks\",\"schema\":null,\"fields\":[{\"name\":\"key\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"AdsNetworkEnum\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isActive\",\"dbName\":\"is_active\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Boolean\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"name\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"adsViews\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"AdsViews\",\"nativeType\":null,\"relationName\":\"AdsNetworksToAdsViews\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"UserBalance\":{\"dbName\":\"user_balance\",\"schema\":null,\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"nativeType\":null,\"default\":{\"name\":\"uuid\",\"args\":[4]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"paymentBalance\",\"dbName\":\"payment_balance\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"holdBalance\",\"dbName\":\"hold_balance\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"totalEarnedWithdrawalBalance\",\"dbName\":\"total_earned_withdrawal_balance\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"withdrawalBalance\",\"dbName\":\"withdrawal_balance\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isUseWithdrawalBalance\",\"dbName\":\"is_use_withdrawal_balance\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":true,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"user\",\"kind\":\"object\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Users\",\"nativeType\":null,\"relationName\":\"UserBalanceToUsers\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"transactions\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Transactions\",\"nativeType\":null,\"relationName\":\"TransactionsToUserBalance\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"Subscriptions\":{\"dbName\":\"subscriptions\",\"schema\":null,\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"nativeType\":null,\"default\":{\"name\":\"uuid\",\"args\":[4]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"username\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":true,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isActive\",\"dbName\":\"is_active\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isAutoRenewal\",\"dbName\":\"is_auto_renewal\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":true,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"token\",\"dbName\":\"token\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":true,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"period\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"SubscriptionPeriodEnum\",\"nativeType\":null,\"default\":\"MONTH\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"nativeType\":null,\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"expiredAt\",\"dbName\":\"expired_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"user\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Users\",\"nativeType\":null,\"relationName\":\"SubscriptionsToUsers\",\"relationFromFields\":[\"userId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"userId\",\"dbName\":\"user_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":true,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"payments\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Payments\",\"nativeType\":null,\"relationName\":\"PaymentsToSubscriptions\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"Roles\":{\"dbName\":\"roles\",\"schema\":null,\"fields\":[{\"name\":\"key\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"UserRoleEnum\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"name\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"discount\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":1,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"limitSubscriptions\",\"dbName\":\"limit_subscriptions\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Int\",\"nativeType\":null,\"default\":10,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"users\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Users\",\"nativeType\":null,\"relationName\":\"RolesToUsers\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"Language\":{\"dbName\":\"language\",\"schema\":null,\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"nativeType\":null,\"default\":{\"name\":\"uuid\",\"args\":[4]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"name\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"nativeName\",\"dbName\":\"native_name\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"iso6391\",\"dbName\":\"iso_639_1\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":true,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"iso6392\",\"dbName\":\"iso_639_2\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":true,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"iso6393\",\"dbName\":\"iso_639_3\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":true,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"users\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Users\",\"nativeType\":null,\"relationName\":\"LanguageToUsers\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"Currency\":{\"dbName\":\"currency\",\"schema\":null,\"fields\":[{\"name\":\"key\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"CurrencyEnum\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"name\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"symbol\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"rate\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":1,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"coinmarketcapUCID\",\"dbName\":\"coinmarketcap_ucid\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":true,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"payments\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Payments\",\"nativeType\":null,\"relationName\":\"CurrencyToPayments\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"paymentMethods\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"PaymentMethods\",\"nativeType\":null,\"relationName\":\"CurrencyToPaymentMethods\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"Transactions\":{\"dbName\":\"transactions\",\"schema\":null,\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"nativeType\":null,\"default\":{\"name\":\"uuid\",\"args\":[4]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"amount\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isHold\",\"dbName\":\"is_hold\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"type\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"TransactionTypeEnum\",\"nativeType\":null,\"default\":\"PLUS\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"reason\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"TransactionReasonEnum\",\"nativeType\":null,\"default\":\"PAYMENT\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"balanceType\",\"dbName\":\"balance_type\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"BalanceTypeEnum\",\"nativeType\":null,\"default\":\"PAYMENT\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"nativeType\":null,\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"holdExpiredAt\",\"dbName\":\"hold_expired_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"balance\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"UserBalance\",\"nativeType\":null,\"relationName\":\"TransactionsToUserBalance\",\"relationFromFields\":[\"balanceId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"balanceId\",\"dbName\":\"balance_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"withdrawal\",\"kind\":\"object\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Withdrawals\",\"nativeType\":null,\"relationName\":\"TransactionsToWithdrawals\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"payment\",\"kind\":\"object\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Payments\",\"nativeType\":null,\"relationName\":\"PaymentsToTransactions\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"Withdrawals\":{\"dbName\":\"withdrawals\",\"schema\":null,\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"nativeType\":null,\"default\":{\"name\":\"uuid\",\"args\":[4]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"status\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"WithdrawalStatusEnum\",\"nativeType\":null,\"default\":\"CONSIDERATION\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"amountStars\",\"dbName\":\"amount_stars\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"amountUSD\",\"dbName\":\"amount_usd\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"amountTON\",\"dbName\":\"amount_ton\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"address\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"nativeType\":null,\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"user\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Users\",\"nativeType\":null,\"relationName\":\"UsersToWithdrawals\",\"relationFromFields\":[\"userId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"userId\",\"dbName\":\"user_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"transacrion\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Transactions\",\"nativeType\":null,\"relationName\":\"TransactionsToWithdrawals\",\"relationFromFields\":[\"transactionId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"transactionId\",\"dbName\":\"transaction_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":true,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"Payments\":{\"dbName\":\"payments\",\"schema\":null,\"fields\":[{\"name\":\"id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"nativeType\":null,\"default\":{\"name\":\"uuid\",\"args\":[4]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"status\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"PaymentStatusEnum\",\"nativeType\":null,\"default\":\"PENDING\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"amount\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"nativeType\":null,\"default\":\"0\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"exchangeRate\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"String\",\"nativeType\":null,\"default\":\"0\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"token\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":true,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"linkPay\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"details\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Json\",\"nativeType\":[\"JsonB\",[]],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"createdAt\",\"dbName\":\"created_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"DateTime\",\"nativeType\":null,\"default\":{\"name\":\"now\",\"args\":[]},\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"updatedAt\",\"dbName\":\"updated_at\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"DateTime\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":true},{\"name\":\"user\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Users\",\"nativeType\":null,\"relationName\":\"PaymentsToUsers\",\"relationFromFields\":[\"userId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"userId\",\"dbName\":\"user_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"currency\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Currency\",\"nativeType\":null,\"relationName\":\"CurrencyToPayments\",\"relationFromFields\":[\"currencyKey\"],\"relationToFields\":[\"key\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"currencyKey\",\"dbName\":\"currency_key\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"CurrencyEnum\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"Subscription\",\"kind\":\"object\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Subscriptions\",\"nativeType\":null,\"relationName\":\"PaymentsToSubscriptions\",\"relationFromFields\":[\"SubscriptionId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"SubscriptionId\",\"dbName\":\"subscription_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"method\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"PaymentMethods\",\"nativeType\":null,\"relationName\":\"PaymentMethodsToPayments\",\"relationFromFields\":[\"methodKey\"],\"relationToFields\":[\"key\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"methodKey\",\"dbName\":\"method_key\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"PaymentMethodEnum\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"transacrion\",\"kind\":\"object\",\"isList\":false,\"isRequired\":false,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Transactions\",\"nativeType\":null,\"relationName\":\"PaymentsToTransactions\",\"relationFromFields\":[\"transactionId\"],\"relationToFields\":[\"id\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"transactionId\",\"dbName\":\"transaction_id\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":true,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false},\"PaymentMethods\":{\"dbName\":\"payment_methods\",\"schema\":null,\"fields\":[{\"name\":\"key\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":true,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"PaymentMethodEnum\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"name\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isActive\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isTonBlockchain\",\"dbName\":\"is_ton_blockchain\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"tonSmartContractAddress\",\"dbName\":\"ton_smart_contract_address\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":false,\"isUnique\":true,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"String\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"minAmount\",\"dbName\":\"min_amount\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":0,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"maxAmount\",\"dbName\":\"max_amount\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":10000,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"commission\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Float\",\"nativeType\":null,\"default\":1,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"isPlusCommission\",\"dbName\":\"is_plus_commission\",\"kind\":\"scalar\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"Boolean\",\"nativeType\":null,\"default\":false,\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"type\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"PaymentMethodTypeEnum\",\"nativeType\":null,\"default\":\"CARD\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"system\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":true,\"type\":\"PaymentSystemEnum\",\"nativeType\":null,\"default\":\"TELEGRAM\",\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"payments\",\"kind\":\"object\",\"isList\":true,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Payments\",\"nativeType\":null,\"relationName\":\"PaymentMethodsToPayments\",\"relationFromFields\":[],\"relationToFields\":[],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"currency\",\"kind\":\"object\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":false,\"hasDefaultValue\":false,\"type\":\"Currency\",\"nativeType\":null,\"relationName\":\"CurrencyToPaymentMethods\",\"relationFromFields\":[\"currencyKey\"],\"relationToFields\":[\"key\"],\"isGenerated\":false,\"isUpdatedAt\":false},{\"name\":\"currencyKey\",\"dbName\":\"currency_key\",\"kind\":\"enum\",\"isList\":false,\"isRequired\":true,\"isUnique\":false,\"isId\":false,\"isReadOnly\":true,\"hasDefaultValue\":false,\"type\":\"CurrencyEnum\",\"nativeType\":null,\"isGenerated\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueFields\":[],\"uniqueIndexes\":[],\"isGenerated\":false}},\"enums\":{\"DefaultEnum\":{\"values\":[{\"name\":\"DEFAULT\",\"dbName\":null}],\"dbName\":null},\"AdsNetworkEnum\":{\"values\":[{\"name\":\"YANDEX\",\"dbName\":null},{\"name\":\"ADSGRAM\",\"dbName\":null},{\"name\":\"ONCLICKA\",\"dbName\":null},{\"name\":\"ADSONAR\",\"dbName\":null},{\"name\":\"GIGA\",\"dbName\":null},{\"name\":\"MONETAG\",\"dbName\":null}],\"dbName\":null},\"AdsViewTypeEnum\":{\"values\":[{\"name\":\"REWARD\",\"dbName\":null},{\"name\":\"TASK\",\"dbName\":null},{\"name\":\"VIEW\",\"dbName\":null}],\"dbName\":null},\"SubscriptionPeriodEnum\":{\"values\":[{\"name\":\"TRIAL\",\"dbName\":null},{\"name\":\"HOUR\",\"dbName\":null},{\"name\":\"DAY\",\"dbName\":null},{\"name\":\"MONTH\",\"dbName\":null},{\"name\":\"THREE_MONTH\",\"dbName\":null},{\"name\":\"SIX_MONTH\",\"dbName\":null},{\"name\":\"YEAR\",\"dbName\":null},{\"name\":\"TWO_YEAR\",\"dbName\":null},{\"name\":\"THREE_YEAR\",\"dbName\":null}],\"dbName\":null},\"UserRoleEnum\":{\"values\":[{\"name\":\"SUPER_ADMIN\",\"dbName\":null},{\"name\":\"ADMIN\",\"dbName\":null},{\"name\":\"FRIEND\",\"dbName\":null},{\"name\":\"OLD_USER\",\"dbName\":null},{\"name\":\"USER\",\"dbName\":null}],\"dbName\":null},\"CurrencyEnum\":{\"values\":[{\"name\":\"RUB\",\"dbName\":null},{\"name\":\"USD\",\"dbName\":null},{\"name\":\"EUR\",\"dbName\":null},{\"name\":\"KZT\",\"dbName\":null},{\"name\":\"TON\",\"dbName\":null},{\"name\":\"MAJOR\",\"dbName\":null},{\"name\":\"NOT\",\"dbName\":null},{\"name\":\"HMSTR\",\"dbName\":null},{\"name\":\"DOGS\",\"dbName\":null},{\"name\":\"CATI\",\"dbName\":null},{\"name\":\"USDT\",\"dbName\":null},{\"name\":\"XCH\",\"dbName\":null},{\"name\":\"JETTON\",\"dbName\":null},{\"name\":\"PX\",\"dbName\":null},{\"name\":\"GRAM\",\"dbName\":null},{\"name\":\"CATS\",\"dbName\":null}],\"dbName\":null},\"TransactionTypeEnum\":{\"values\":[{\"name\":\"PLUS\",\"dbName\":null},{\"name\":\"MINUS\",\"dbName\":null}],\"dbName\":null},\"BalanceTypeEnum\":{\"values\":[{\"name\":\"PAYMENT\",\"dbName\":null},{\"name\":\"WITHDRAWAL\",\"dbName\":null}],\"dbName\":null},\"TransactionReasonEnum\":{\"values\":[{\"name\":\"WITHDRAWAL\",\"dbName\":null},{\"name\":\"PAYMENT\",\"dbName\":null},{\"name\":\"REWARD\",\"dbName\":null},{\"name\":\"REFERRAL\",\"dbName\":null}],\"dbName\":null},\"WithdrawalStatusEnum\":{\"values\":[{\"name\":\"CONSIDERATION\",\"dbName\":null},{\"name\":\"REJECTED\",\"dbName\":null},{\"name\":\"SENT\",\"dbName\":null},{\"name\":\"EXPIRED\",\"dbName\":null}],\"dbName\":null},\"PaymentStatusEnum\":{\"values\":[{\"name\":\"PENDING\",\"dbName\":null},{\"name\":\"COMPLETED\",\"dbName\":null},{\"name\":\"CANCELED\",\"dbName\":null},{\"name\":\"FAILED\",\"dbName\":null}],\"dbName\":null},\"PaymentSystemEnum\":{\"values\":[{\"name\":\"PAYEER\",\"dbName\":null},{\"name\":\"VOLET\",\"dbName\":null},{\"name\":\"WATA\",\"dbName\":null},{\"name\":\"TOME\",\"dbName\":null},{\"name\":\"TELEGRAM\",\"dbName\":null},{\"name\":\"CRYPTOMUS\",\"dbName\":null},{\"name\":\"CRYPTOBOT\",\"dbName\":null},{\"name\":\"TON_BLOCKCHAIN\",\"dbName\":null},{\"name\":\"PAYPALYCH\",\"dbName\":null},{\"name\":\"SKINSBACK\",\"dbName\":null}],\"dbName\":null},\"PaymentMethodTypeEnum\":{\"values\":[{\"name\":\"CRYPTOCURRENCY\",\"dbName\":null},{\"name\":\"CARD\",\"dbName\":null},{\"name\":\"SBP\",\"dbName\":null},{\"name\":\"STARS\",\"dbName\":null},{\"name\":\"WALLET\",\"dbName\":null},{\"name\":\"SKINS\",\"dbName\":null}],\"dbName\":null},\"PaymentMethodEnum\":{\"values\":[{\"name\":\"STARS\",\"dbName\":null},{\"name\":\"TOME_CARD\",\"dbName\":null},{\"name\":\"TOME_SBP\",\"dbName\":null},{\"name\":\"PAYPALYCH_RUB\",\"dbName\":null},{\"name\":\"PAYPALYCH_SBP\",\"dbName\":null},{\"name\":\"PAYPALYCH_USD\",\"dbName\":null},{\"name\":\"PAYPALYCH_EUR\",\"dbName\":null},{\"name\":\"WATA_RUB\",\"dbName\":null},{\"name\":\"WATA_USD\",\"dbName\":null},{\"name\":\"WATA_EUR\",\"dbName\":null},{\"name\":\"PAYEER_RUB\",\"dbName\":null},{\"name\":\"PAYEER_USD\",\"dbName\":null},{\"name\":\"PAYEER_EUR\",\"dbName\":null},{\"name\":\"VOLET_RUB\",\"dbName\":null},{\"name\":\"VOLET_USD\",\"dbName\":null},{\"name\":\"VOLET_EUR\",\"dbName\":null},{\"name\":\"CRYPTOMUS\",\"dbName\":null},{\"name\":\"CRYPTOBOT\",\"dbName\":null},{\"name\":\"XROCKET\",\"dbName\":null},{\"name\":\"TON_TON\",\"dbName\":null},{\"name\":\"USDT_TON\",\"dbName\":null},{\"name\":\"NOT_TON\",\"dbName\":null},{\"name\":\"MAJOR_TON\",\"dbName\":null},{\"name\":\"HMSTR_TON\",\"dbName\":null},{\"name\":\"DOGS_TON\",\"dbName\":null},{\"name\":\"CATI_TON\",\"dbName\":null},{\"name\":\"JETTON_TON\",\"dbName\":null},{\"name\":\"PX_TON\",\"dbName\":null},{\"name\":\"GRAM_TON\",\"dbName\":null},{\"name\":\"CATS_TON\",\"dbName\":null},{\"name\":\"SKINSBACK\",\"dbName\":null}],\"dbName\":null}},\"types\":{}}")
defineDmmfProperty(exports.Prisma, config.runtimeDataModel)
config.engineWasm = undefined
config.compilerWasm = undefined

config.injectableEdgeEnv = () => ({
  parsed: {
    POSTGRES_URI: typeof globalThis !== 'undefined' && globalThis['POSTGRES_URI'] || typeof process !== 'undefined' && process.env && process.env.POSTGRES_URI || undefined
  }
})

if (typeof globalThis !== 'undefined' && globalThis['DEBUG'] || typeof process !== 'undefined' && process.env && process.env.DEBUG || undefined) {
  Debug.enable(typeof globalThis !== 'undefined' && globalThis['DEBUG'] || typeof process !== 'undefined' && process.env && process.env.DEBUG || undefined)
}

const PrismaClient = getPrismaClient(config)
exports.PrismaClient = PrismaClient
Object.assign(exports, Prisma)

