import { IsEnum, IsOptional } from 'class-validator'

export enum PayPremiumMethodsEnum {
  BALANCE_STARS = 'BALANCE_STARS',
  BALANCE_USDT = 'BALANCE_USDT',
}

export enum PayPremiumPeriodEnum {
  MONTH = 'MONTH',
  THREE_MONTH = 'THREE_MONTH',
  SIX_MONTH = 'SIX_MONTH',
  YEAR = 'YEAR',
  TWO_YEAR = 'TWO_YEAR',
  THREE_YEAR = 'THREE_YEAR',
  INDEFINITELY = 'INDEFINITELY',
}

export class PayPremiumDto {
  @IsOptional()
  @IsEnum(PayPremiumMethodsEnum)
  method?: PayPremiumMethodsEnum

  @IsOptional()
  @IsEnum(PayPremiumPeriodEnum)
  period?: PayPremiumPeriodEnum
}
