import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller.js';
import { RequestsService } from './requests.service.js';
import { RatesModule } from '../rates/rates.module.js';
import { ViewsModule } from '../views/views.module.js';

@Module({
  imports: [RatesModule, ViewsModule],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
