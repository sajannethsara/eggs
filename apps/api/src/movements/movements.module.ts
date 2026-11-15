import { Module } from '@nestjs/common';
import { MovementsController } from './movements.controller.js';
import { MovementsService } from './movements.service.js';
import { RatesModule } from '../rates/rates.module.js';
import { ViewsModule } from '../views/views.module.js';
import { RequestsModule } from '../requests/requests.module.js';

@Module({
  imports: [RatesModule, ViewsModule, RequestsModule],
  controllers: [MovementsController],
  providers: [MovementsService],
  exports: [MovementsService],
})
export class MovementsModule {}
