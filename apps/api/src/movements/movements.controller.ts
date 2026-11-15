import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  MovementCreateSchema,
  PosSaleSchema,
  StopCompleteSchema,
  SyncBatchSchema,
  type MovementCreate,
  type PosSale,
  type StopComplete,
  type SyncBatch,
} from 'shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators.js';
import { MovementsService } from './movements.service.js';

const ListQuery = z.object({
  partyId: z.string().optional(),
  requestId: z.string().optional(),
  kind: z.enum(['GOODS', 'MONEY']).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});
const Lines = z.object({
  clientId: z.string().uuid(),
  lines: z.array(z.object({ itemId: z.string(), quantity: z.number().int().nonnegative() })),
});
const Send = z.object({ clientId: z.string().uuid(), toDriverId: z.string().nullable().optional() });
const Reverse = z.object({ reason: z.string().min(1).max(240) });
const Cheque = z.object({ status: z.enum(['DEPOSITED', 'CLEARED', 'BOUNCED']) });
const ClientId = z.object({ clientId: z.string().uuid() });

@Controller('movements')
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Get()
  list(@Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.movements.list(q);
  }

  @Post()
  record(@Body(new ZodPipe(MovementCreateSchema)) body: MovementCreate, @CurrentUser() user: AuthUser) {
    return this.movements.record(body, user);
  }

  @Roles('CASHIER', 'OFFICE', 'OWNER')
  @Post('pos-sale')
  posSale(@Body(new ZodPipe(PosSaleSchema)) body: PosSale, @CurrentUser() user: AuthUser) {
    return this.movements.posSale(body, user);
  }

  @Roles('DRIVER', 'OFFICE', 'OWNER')
  @Post('stops/:requestId/complete')
  completeStop(
    @Param('requestId') requestId: string,
    @Body(new ZodPipe(StopCompleteSchema)) body: StopComplete,
    @CurrentUser() user: AuthUser,
  ) {
    return this.movements.completeStop(requestId, body, user);
  }

  @Roles('WAREHOUSE', 'CASHIER', 'OFFICE', 'OWNER')
  @Post('receive/:requestId')
  receive(@Param('requestId') requestId: string, @Body(new ZodPipe(Lines)) body: z.infer<typeof Lines>, @CurrentUser() user: AuthUser) {
    return this.movements.receive(requestId, body.lines, user, body.clientId);
  }

  @Roles('WAREHOUSE', 'OFFICE', 'OWNER')
  @Post('send/:requestId')
  send(@Param('requestId') requestId: string, @Body(new ZodPipe(Send)) body: z.infer<typeof Send>, @CurrentUser() user: AuthUser) {
    return this.movements.send(requestId, body.toDriverId ?? null, user, body.clientId);
  }

  @Roles('DRIVER')
  @Post('load')
  load(@Body(new ZodPipe(Lines)) body: z.infer<typeof Lines>, @CurrentUser() user: AuthUser) {
    return this.movements.loadVehicle(body.lines, user, body.clientId);
  }

  @Roles('DRIVER')
  @Post('unload')
  unload(@Body(new ZodPipe(ClientId)) body: z.infer<typeof ClientId>, @CurrentUser() user: AuthUser) {
    return this.movements.unloadVehicle(user, body.clientId);
  }

  @Post('sync')
  sync(@Body(new ZodPipe(SyncBatchSchema)) body: SyncBatch, @CurrentUser() user: AuthUser) {
    return this.movements.sync(body, user);
  }

  @Roles('OFFICE', 'OWNER', 'CASHIER', 'WAREHOUSE')
  @Post(':id/reverse')
  reverse(@Param('id') id: string, @Body(new ZodPipe(Reverse)) body: z.infer<typeof Reverse>, @CurrentUser() user: AuthUser) {
    return this.movements.reverse(id, body.reason, user);
  }

  @Roles('OFFICE', 'OWNER')
  @Patch(':id/cheque')
  cheque(@Param('id') id: string, @Body(new ZodPipe(Cheque)) body: z.infer<typeof Cheque>, @CurrentUser() user: AuthUser) {
    return this.movements.setChequeStatus(id, body.status, user);
  }
}
