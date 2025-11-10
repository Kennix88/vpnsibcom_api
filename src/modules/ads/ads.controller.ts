import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Req,
} from '@nestjs/common'
import { FastifyRequest } from 'fastify'

@Controller('ads')
export class AdsController {
  constructor() {}

  @Get('adsgram/reward/traffic/:userId')
  @HttpCode(HttpStatus.OK)
  async adsgramRewardTraffic(
    @Param('userId') userId: string,
    @Req() req: FastifyRequest,
  ) {
    try {
      console.log('=== Adsgram Reward Traffic ===')
      console.log('UserID:', userId)
      console.log('URL:', req.url)
      console.log('Method:', req.method)
      console.log('IP:', req.ip)
      console.log('Headers:', JSON.stringify(req.headers, null, 2))
      console.log('Query:', JSON.stringify(req.query, null, 2))
      console.log('Body:', JSON.stringify(req.body, null, 2))
      console.log('==============================')
      return 'OK'
    } catch (error) {
      console.error('Error handling Adsgram reward traffic:', error)
      return 'ERROR'
    }
  }

  @Get('adsgram/task/traffic/:userId')
  @HttpCode(HttpStatus.OK)
  async adsgramTaskTraffic(
    @Param('userId') userId: string,
    @Req() req: FastifyRequest,
  ) {
    try {
      console.log('=== Adsgram Task Traffic ===')
      console.log('UserID:', userId)
      console.log('URL:', req.url)
      console.log('Method:', req.method)
      console.log('IP:', req.ip)
      console.log('Headers:', JSON.stringify(req.headers, null, 2))
      console.log('Query:', JSON.stringify(req.query, null, 2))
      console.log('Body:', JSON.stringify(req.body, null, 2))
      console.log('============================')
      return 'OK'
    } catch (error) {
      console.error('Error handling Adsgram task traffic:', error)
      return 'ERROR'
    }
  }
}
