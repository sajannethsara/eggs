import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PARTY_TYPES, PartyCreateSchema, PartyPatchSchema, type PartyCreate } from 'shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { Roles } from '../auth/decorators.js';
import { PartiesService } from './parties.service.js';

const ListQuery = z.object({
  type: z.enum(PARTY_TYPES).optional(),
  q: z.string().optional(),
  tier: z.string().optional(),
  segment: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
  red: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

@Controller('parties')
export class PartiesController {
  constructor(private readonly parties: PartiesService) {}

  @Get()
  list(@Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.parties.list(q);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.parties.get(id);
  }

  @Roles('OWNER', 'OFFICE')
  @Post()
  create(@Body(new ZodPipe(PartyCreateSchema)) body: PartyCreate) {
    return this.parties.create(body);
  }

  @Roles('OWNER', 'OFFICE')
  @Patch(':id')
  patch(@Param('id') id: string, @Body(new ZodPipe(PartyPatchSchema)) body: z.infer<typeof PartyPatchSchema>) {
    return this.parties.patch(id, body);
  }
}
