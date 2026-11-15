import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RequestCreateSchema,
  RequestDecisionSchema,
  StopProblemSchema,
  type RequestCreate,
  type RequestDecision,
} from 'shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators.js';
import { RequestsService } from './requests.service.js';
import { parseDay } from '../common/dates.js';

const InboxQuery = z.object({ tab: z.enum(['mine', 'owner', 'all']).default('mine') });
const DayQuery = z.object({ day: z.string().optional(), outletId: z.string().optional(), driverId: z.string().optional() });
const Reassign = z.object({ assignedToId: z.string().nullable() });
const AssignStops = z.object({
  assignments: z.array(z.object({ requestId: z.string(), driverId: z.string().nullable(), position: z.number().int() })),
});

@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get('inbox')
  inbox(@CurrentUser() user: AuthUser, @Query(new ZodPipe(InboxQuery)) q: z.infer<typeof InboxQuery>) {
    return this.requests.inbox(user, q.tab);
  }

  @Roles('OWNER')
  @Get('owner-queue')
  ownerQueue(@CurrentUser() user: AuthUser) {
    return this.requests.ownerQueue(user);
  }

  @Get('my-work')
  myWork(@CurrentUser() user: AuthUser) {
    return this.requests.myWork(user);
  }

  @Get('delegated')
  delegated(@CurrentUser() user: AuthUser) {
    return this.requests.delegated(user);
  }

  @Get('orders')
  orders(@Query(new ZodPipe(DayQuery)) q: z.infer<typeof DayQuery>) {
    return this.requests.orders(parseDay(q.day), q.outletId);
  }

  @Get('route')
  route(@CurrentUser() user: AuthUser, @Query(new ZodPipe(DayQuery)) q: z.infer<typeof DayQuery>) {
    return this.requests.route(parseDay(q.day), q.driverId ?? user.id);
  }

  @Roles('OWNER', 'OFFICE', 'DRIVER')
  @Get('route-plan')
  routePlan(@Query(new ZodPipe(DayQuery)) q: z.infer<typeof DayQuery>) {
    return this.requests.routePlan(parseDay(q.day));
  }

  @Roles('OWNER', 'OFFICE', 'DRIVER')
  @Post('route-plan/assign')
  assignStops(@Body(new ZodPipe(AssignStops)) body: z.infer<typeof AssignStops>, @CurrentUser() user: AuthUser) {
    return this.requests.assignStops(body.assignments, user);
  }

  @Get('warehouse-todo')
  warehouseTodo() {
    return this.requests.warehouseTodo();
  }

  @Get('pending-transfers')
  pendingTransfers(@CurrentUser() user: AuthUser, @Query('toPartyId') toPartyId?: string) {
    const id = toPartyId || user.outletId;
    return id ? this.requests.pendingTransfers(id) : [];
  }

  @Roles('DRIVER')
  @Post('end-of-day')
  endOfDay(@CurrentUser() user: AuthUser) {
    return this.requests.endOfDay(user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.requests.get(id);
  }

  @Post()
  create(@Body(new ZodPipe(RequestCreateSchema)) body: RequestCreate, @CurrentUser() user: AuthUser) {
    return this.requests.create(body, { user });
  }

  @Post(':id/decide')
  decide(
    @Param('id') id: string,
    @Body(new ZodPipe(RequestDecisionSchema)) body: RequestDecision,
    @CurrentUser() user: AuthUser,
  ) {
    return this.requests.decide(id, body, user);
  }

  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.requests.start(id, user);
  }

  @Post(':id/finish')
  finish(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: { note?: string }) {
    return this.requests.finish(id, user, body?.note);
  }

  @Patch(':id/assign')
  reassign(@Param('id') id: string, @Body(new ZodPipe(Reassign)) body: z.infer<typeof Reassign>, @CurrentUser() user: AuthUser) {
    return this.requests.reassign(id, body.assignedToId, user);
  }

  @Post(':id/problem')
  problem(
    @Param('id') id: string,
    @Body(new ZodPipe(StopProblemSchema)) body: z.infer<typeof StopProblemSchema>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.requests.stopProblem(id, body.problem, body.note, user);
  }

  @Post(':id/skip')
  skip(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.requests.skipStop(id, user);
  }
}
