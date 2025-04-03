import { RatesService } from '@modules/rates/services/rates.service'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [RatesService],
  exports: [RatesService],
})
export class RatesModule {}
