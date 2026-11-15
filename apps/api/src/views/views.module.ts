import { Module } from '@nestjs/common';
import { ViewsController } from './views.controller.js';
import { ViewsService } from './views.service.js';
import { RatesModule } from '../rates/rates.module.js';

@Module({
  imports: [RatesModule],
  controllers: [ViewsController],
  providers: [ViewsService],
  exports: [ViewsService],
})
export class ViewsModule {}
