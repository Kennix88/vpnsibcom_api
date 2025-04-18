import { RatesController } from '@modules/rates/rates.controller'
import { RatesService } from '@modules/rates/rates.service'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
  imports: [],
  controllers: [RatesController],
  providers: [RatesService],
  exports: [RatesService],
})
export class RatesModule {}
