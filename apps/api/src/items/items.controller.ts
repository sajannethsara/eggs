import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { Roles } from '../auth/decorators.js';
import { ItemsService } from './items.service.js';

const ItemCreate = z.object({
  name: z.string().min(1),
  unit: z.string().default('piece'),
  packSize: z.number().int().positive().default(1),
  packName: z.string().optional(),
  category: z.string().default('general'),
  holdingDays: z.number().int().positive().default(30),
  perishable: z.boolean().default(false),
  barcode: z.string().optional(),
  color: z.string().default('grey'),
  posOrder: z.number().int().optional(),
});
const ItemPatch = ItemCreate.partial().extend({ active: z.boolean().optional() });
const Reorder = z.object({ holderId: z.string(), quantity: z.number().int().nonnegative() });

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  list(@Query('partyId') partyId?: string) {
    return this.items.listWithRates(partyId || undefined);
  }

  @Roles('OWNER', 'OFFICE')
  @Post()
  create(@Body(new ZodPipe(ItemCreate)) body: z.infer<typeof ItemCreate>) {
    return this.items.create(body);
  }

  @Roles('OWNER', 'OFFICE')
  @Patch(':id')
  patch(@Param('id') id: string, @Body(new ZodPipe(ItemPatch)) body: z.infer<typeof ItemPatch>) {
    return this.items.patch(id, body);
  }

  @Roles('OWNER', 'OFFICE')
  @Put(':id/reorder')
  reorder(@Param('id') id: string, @Body(new ZodPipe(Reorder)) body: z.infer<typeof Reorder>) {
    return this.items.setReorderLevel(id, body.holderId, body.quantity);
  }
}
