export interface ReferralsInterface {
  id: string
  createdAt: Date
  updatedAt: Date
  level: number
  inviterId: string
  referralId: string
  isPremium: boolean
  isActivated: boolean
  totalPaymentsRewarded: number
  totalWithdrawalsRewarded: number
}
