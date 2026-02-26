import { Module } from '@nestjs/common'
import { GeoUpdaterService } from './geo-updater.service'
import { GeoController } from './geo.controller'
import { GeoService } from './geo.service'

@Module({
  imports: [],
  providers: [GeoService, GeoUpdaterService],
  controllers: [GeoController],
  exports: [GeoService, GeoUpdaterService],
})
export class GeoModule {}
