import { Module } from '@nestjs/common';
import { RulesController } from './rules.controller.js';
import { RulesService } from './rules.service.js';
import { RequestsModule } from '../requests/requests.module.js';
import { ViewsModule } from '../views/views.module.js';
import { RatesModule } from '../rates/rates.module.js';

@Module({
  imports: [RequestsModule, ViewsModule, RatesModule],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}
