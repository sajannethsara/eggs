import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators.js';
import { ViewsService } from './views.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addDays, endOfDay, parseDay, startOfDay } from '../common/dates.js';

const Range = z.object({ from: z.string().optional(), to: z.string().optional() });
const ChequeQuery = z.object({ status: z.enum(['PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED']).optional() });

@Controller('views')
export class ViewsController {
  constructor(
    private readonly views: ViewsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('stock')
  async stock() {
    const [cells, holders, items] = await Promise.all([
      this.views.stock(),
      this.prisma.party.findMany({
        where: { type: { in: ['WAREHOUSE', 'OUTLET', 'EMPLOYEE'] } },
        select: { id: true, name: true, type: true, user: { select: { role: true } } },
        orderBy: [{ type: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.item.findMany({ where: { active: true }, orderBy: [{ posOrder: 'asc' }, { name: 'asc' }] }),
    ]);
    // Only employees who are drivers hold stock (their vehicle load).
    const holderRows = holders.filter((h) => h.type !== 'EMPLOYEE' || h.user?.role === 'DRIVER');
    return { holders: holderRows.map(({ user: _u, ...h }) => h), items, cells };
  }

  @Get('balances')
  async balances() {
    const m = await this.views.balances();
    return Object.fromEntries(m);
  }

  @Get('driver-cash')
  driverCash(@CurrentUser() user: AuthUser) {
    return this.views.driverCash(user.partyId).then((cashCents) => ({ cashCents }));
  }

  @Get('outlet-cash')
  async outletCash(@CurrentUser() user: AuthUser, @Query('outletId') outletId?: string) {
    const id = outletId ?? user.outletId;
    if (!id) return { expectedCents: 0 };
    return { expectedCents: await this.views.outletCashToday(id) };
  }

  @Roles('OWNER', 'OFFICE')
  @Get('owner-today')
  ownerToday() {
    return this.views.ownerToday();
  }

  @Roles('OWNER', 'OFFICE')
  @Get('profit')
  profit(@Query(new ZodPipe(Range)) q: z.infer<typeof Range>) {
    const to = q.to ? endOfDay(new Date(q.to)) : endOfDay();
    const from = q.from ? startOfDay(new Date(q.from)) : startOfDay(addDays(to, -30));
    return this.views.profit(from, to);
  }

  @Roles('OWNER', 'OFFICE')
  @Get('sales-trend')
  salesTrend() {
    return this.views.salesTrend(12);
  }

  @Roles('OWNER', 'OFFICE')
  @Get('receivables')
  receivables() {
    return this.views.receivables();
  }

  @Roles('OWNER', 'OFFICE')
  @Get('payables')
  payables() {
    return this.views.payables();
  }

  @Roles('OWNER', 'OFFICE')
  @Get('cheques')
  cheques(@Query(new ZodPipe(ChequeQuery)) q: z.infer<typeof ChequeQuery>) {
    return this.views.cheques(q.status);
  }

  @Roles('OWNER', 'OFFICE')
  @Get('late')
  late(@Query('day') day?: string) {
    return this.views.lateStops(parseDay(day));
  }
}
