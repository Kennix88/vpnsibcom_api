
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


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

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

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

exports.UserRoleEnum = exports.$Enums.UserRoleEnum = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  FRIEND: 'FRIEND',
  OLD_USER: 'OLD_USER',
  USER: 'USER'
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

exports.TransactionReasonEnum = exports.$Enums.TransactionReasonEnum = {
  WITHDRAWAL: 'WITHDRAWAL',
  PAYMENT: 'PAYMENT',
  REWARD: 'REWARD',
  REFERRAL: 'REFERRAL'
};

exports.BalanceTypeEnum = exports.$Enums.BalanceTypeEnum = {
  PAYMENT: 'PAYMENT',
  WITHDRAWAL: 'WITHDRAWAL'
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

exports.PaymentMethodTypeEnum = exports.$Enums.PaymentMethodTypeEnum = {
  CRYPTOCURRENCY: 'CRYPTOCURRENCY',
  CARD: 'CARD',
  SBP: 'SBP',
  STARS: 'STARS',
  WALLET: 'WALLET',
  SKINS: 'SKINS'
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
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
