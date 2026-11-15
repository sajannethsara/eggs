import { Module } from '@nestjs/common';
import { RatesController } from './rates.controller.js';
import { RatesService } from './rates.service.js';
import { SettingsService } from '../common/settings.service.js';

@Module({
  controllers: [RatesController],
  providers: [RatesService, SettingsService],
  exports: [RatesService, SettingsService],
})
export class RatesModule {}
