import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { Roles } from '../auth/decorators.js';
import { RulesService } from './rules.service.js';
import { parseDay } from '../common/dates.js';

const RulePatch = z.object({ enabled: z.boolean().optional(), settings: z.record(z.string(), z.unknown()).optional() });

@Roles('OWNER', 'OFFICE')
@Controller('rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  list() {
    return this.rules.list();
  }

  @Post('run')
  run() {
    return this.rules.runAll();
  }

  @Patch(':code')
  patch(@Param('code') code: string, @Body(new ZodPipe(RulePatch)) body: z.infer<typeof RulePatch>) {
    return this.rules.setRule(code, body);
  }

  @Get('route-plan')
  routePlan(@Query('day') day?: string) {
    return this.rules.proposeRoutePlan(parseDay(day));
  }
}
