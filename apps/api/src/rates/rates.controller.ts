import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { RateCreateSchema, type RateCreate } from 'shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators.js';
import { RatesService } from './rates.service.js';
import { DEFAULT_SETTINGS, SettingsService, type SettingKey } from '../common/settings.service.js';

const SettingPut = z.object({
  key: z.enum(Object.keys(DEFAULT_SETTINGS) as [SettingKey, ...SettingKey[]]),
  value: z.number(),
});

@Controller('rates')
export class RatesController {
  constructor(
    private readonly rates: RatesService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  priceList() {
    return this.rates.priceList();
  }

  @Roles('OWNER', 'OFFICE')
  @Post()
  propose(@Body(new ZodPipe(RateCreateSchema)) body: RateCreate, @CurrentUser() user: AuthUser) {
    return this.rates.propose(body, user);
  }

  @Get('settings')
  allSettings() {
    return this.settings.all();
  }

  @Roles('OWNER', 'OFFICE')
  @Put('settings')
  setSetting(@Body(new ZodPipe(SettingPut)) body: z.infer<typeof SettingPut>) {
    return this.settings.set(body.key, body.value);
  }
}
