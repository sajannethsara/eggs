import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { RequestType } from 'shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestsService } from '../requests/requests.service.js';
import { ViewsService } from '../views/views.service.js';
import { SettingsService } from '../common/settings.service.js';
import { addDays, daysBetween, startOfDay } from '../common/dates.js';

/** Starting rule set (spec §5). Rules only ever create PROPOSED requests. */
export const RULES = [
  { code: 'LOW_STOCK', name: 'Low stock', description: 'Stock at a holder falls below the reorder level → transfer from the warehouse, or a purchase if the warehouse is also low.' },
  { code: 'FRESHNESS', name: 'Freshness', description: 'A batch reaches 75% of its holding period → transfer to a busier outlet, or a discount on that batch.' },
  { code: 'REGULAR_ORDER', name: 'Regular order', description: 'Usual order day for a B2B customer → sale order with the usual lines, confirmed by call.' },
  { code: 'SUPPLIER_ORDER_DAY', name: 'Supplier order day', description: 'Usual purchase day for a supplier → purchase with suggested quantities.' },
  { code: 'QUIET_BIG_CUSTOMER', name: 'Quiet big customer', description: 'A big customer has not ordered for 10 days → call task.' },
  { code: 'CHEQUE_DUE', name: 'Cheque due', description: 'Cheque date is 2 days away → bank-deposit task.' },
  { code: 'OVERDUE_CREDIT', name: 'Overdue credit', description: 'Balance is past its credit days → call task and "hold credit" flag.' },
  { code: 'PRICE_CHANGE', name: 'Price change', description: 'A supplier buy price goes up → new sell rates keeping the margin.' },
  { code: 'LEAVE_CHECK', name: 'Leave check', description: 'Leave on a busy day is marked "leaves day short" with a suggested cover.' },
  { code: 'ROUTE_PLAN', name: 'Route plan', description: 'Approved orders for tomorrow → stop list per driver in route order.' },
  { code: 'CASH_HANDOVER', name: 'Cash handover', description: 'Driver ends the route → handover request for the cash in hand.' },
] as const;

@Injectable()
export class RulesService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Rules');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: RequestsService,
    private readonly views: ViewsService,
    private readonly settings: SettingsService,
  ) {}

  async onModuleInit() {
    for (const r of RULES) {
      await this.prisma.rule.upsert({ where: { code: r.code }, create: { ...r }, update: { name: r.name, description: r.description } });
    }
    if (process.env.RULES_INTERVAL_MS !== '0') {
      const every = Number(process.env.RULES_INTERVAL_MS ?? 5 * 60_000);
      this.timer = setInterval(() => void this.runAll().catch((e) => this.log.error(e)), every);
      setTimeout(() => void this.runAll().catch((e) => this.log.error(e)), 5_000);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  list() {
    return this.prisma.rule.findMany({ orderBy: { name: 'asc' } });
  }

  async setRule(code: string, data: { enabled?: boolean; settings?: Record<string, unknown> }) {
    return this.prisma.rule.update({ where: { code }, data: { enabled: data.enabled, settings: data.settings as never } });
  }

  async runAll() {
    const rules = await this.prisma.rule.findMany({ where: { enabled: true } });
    const summary: Record<string, number> = {};
    for (const rule of rules) {
      try {
        const n = await this.run(rule.code);
        summary[rule.code] = n;
        await this.prisma.rule.update({ where: { code: rule.code }, data: { lastRunAt: new Date(), proposedCount: { increment: n } } });
      } catch (e) {
        this.log.error(`Rule ${rule.code} failed: ${(e as Error).message}`);
      }
    }
    return summary;
  }

  private async run(code: string): Promise<number> {
    switch (code) {
      case 'LOW_STOCK': return this.lowStock();
      case 'FRESHNESS': return this.freshness();
      case 'REGULAR_ORDER': return this.regularOrder();
      case 'SUPPLIER_ORDER_DAY': return this.supplierOrderDay();
      case 'QUIET_BIG_CUSTOMER': return this.quietBigCustomer();
      case 'CHEQUE_DUE': return this.chequeDue();
      case 'OVERDUE_CREDIT': return this.overdueCredit();
      default: return 0; // PRICE_CHANGE, LEAVE_CHECK, CASH_HANDOVER and ROUTE_PLAN fire from events, not the timer.
    }
  }

  /** Don't propose twice: an open proposal of the same type, rule and target already exists. */
  private async alreadyOpen(type: RequestType, rule: string, where: { toPartyId?: string | null; fromPartyId?: string | null; itemId?: string }) {
    const n = await this.prisma.request.count({
      where: {
        type,
        createdByRule: rule,
        status: { in: ['PROPOSED', 'APPROVED', 'IN_PROGRESS'] },
        ...(where.toPartyId !== undefined ? { toPartyId: where.toPartyId } : {}),
        ...(where.fromPartyId !== undefined ? { fromPartyId: where.fromPartyId } : {}),
        ...(where.itemId ? { lines: { some: { itemId: where.itemId } } } : {}),
      },
    });
    return n > 0;
  }

  private async lowStock() {
    const stock = await this.views.stock();
    const wh = await this.prisma.party.findFirst({ where: { type: 'WAREHOUSE' } });
    if (!wh) return 0;
    const items = await this.prisma.item.findMany();
    const holders = await this.prisma.party.findMany({ where: { type: { in: ['OUTLET', 'WAREHOUSE'] } } });
    let n = 0;
    for (const c of stock.filter((c) => c.belowReorder && c.reorderLevel !== null)) {
      const item = items.find((i) => i.id === c.itemId);
      const holder = holders.find((h) => h.id === c.holderId);
      if (!item || !holder) continue;
      const need = c.reorderLevel! * 2 - c.quantity;
      const whCell = stock.find((s) => s.holderId === wh.id && s.itemId === c.itemId);
      const whQty = whCell?.quantity ?? 0;
      if (holder.id !== wh.id && whQty >= need) {
        if (await this.alreadyOpen('TRANSFER', 'LOW_STOCK', { toPartyId: holder.id, itemId: item.id })) continue;
        await this.requests.create(
          {
            type: 'TRANSFER', fromPartyId: wh.id, toPartyId: holder.id, lines: [{ itemId: item.id, quantity: need }],
            dueAt: addDays(startOfDay(), 1),
            reason: `${holder.name} has ${c.quantity} ${item.unit}${c.quantity === 1 ? '' : 's'} of ${item.name}, below the reorder level of ${c.reorderLevel}. Warehouse has ${whQty}.`,
          },
          { rule: 'LOW_STOCK' },
        );
        n++;
      } else {
        // Warehouse is low too (or this is the warehouse): propose a purchase from the usual supplier.
        const supplierRate = await this.prisma.rate.findFirst({ where: { itemId: item.id, direction: 'BUY', partyId: { not: null } }, orderBy: { validFrom: 'desc' }, include: { party: true } });
        const supplier = supplierRate?.party ?? (await this.prisma.party.findFirst({ where: { type: 'SUPPLIER' } }));
        if (!supplier) continue;
        if (await this.alreadyOpen('PURCHASE', 'LOW_STOCK', { fromPartyId: supplier.id, itemId: item.id })) continue;
        const qty = Math.max(need, (c.reorderLevel ?? 0) * 2);
        await this.requests.create(
          {
            type: 'PURCHASE', fromPartyId: supplier.id, toPartyId: wh.id, lines: [{ itemId: item.id, quantity: qty }],
            dueAt: addDays(startOfDay(), 1),
            reason: `${holder.name} is low on ${item.name} (${c.quantity}) and the warehouse has only ${whQty}. Buy ${qty} from ${supplier.name}.`,
          },
          { rule: 'LOW_STOCK' },
        );
        n++;
      }
    }
    return n;
  }

  private async freshness() {
    const threshold = await this.settings.get('freshnessPercent');
    const stock = await this.views.stock();
    const items = await this.prisma.item.findMany({ where: { perishable: true } });
    const outlets = await this.prisma.party.findMany({ where: { type: 'OUTLET' } });
    const wh = await this.prisma.party.findFirst({ where: { type: 'WAREHOUSE' } });
    const sales = await this.views.salesByHolder(addDays(startOfDay(), -7), new Date());
    let n = 0;
    for (const c of stock) {
      if (c.agePercent === null || c.agePercent < threshold || c.quantity <= 0) continue;
      const item = items.find((i) => i.id === c.itemId);
      if (!item) continue;
      const holder = [...outlets, ...(wh ? [wh] : [])].find((h) => h.id === c.holderId);
      if (!holder) continue;
      // Busiest outlet for this item in the last week, other than the holder.
      const busiest = outlets
        .filter((o) => o.id !== holder.id)
        .map((o) => ({ o, s: sales.byHolder.get(o.id) ?? 0 }))
        .sort((a, b) => b.s - a.s)[0]?.o;
      if (busiest && holder.type === 'WAREHOUSE') {
        if (await this.alreadyOpen('TRANSFER', 'FRESHNESS', { toPartyId: busiest.id, itemId: item.id })) continue;
        await this.requests.create(
          {
            type: 'TRANSFER', fromPartyId: holder.id, toPartyId: busiest.id, lines: [{ itemId: item.id, quantity: c.quantity }],
            dueAt: startOfDay(),
            reason: `${item.name} at ${holder.name} is ${c.agePercent}% through its ${item.holdingDays}-day holding period. ${busiest.name} sells the most; move it there today.`,
          },
          { rule: 'FRESHNESS' },
        );
        n++;
      } else {
        // Propose a discount on the aging stock (goes to the owner: PRICE_CHANGE is owner-only).
        const sell = await this.prisma.rate.findFirst({ where: { itemId: item.id, direction: 'SELL', partyId: null }, orderBy: { validFrom: 'desc' } });
        if (!sell) continue;
        if (await this.alreadyOpen('PRICE_CHANGE', 'FRESHNESS', { toPartyId: null, itemId: undefined })) continue;
        const discounted = Math.round(sell.priceCents * 0.9);
        await this.requests.create(
          {
            type: 'PRICE_CHANGE', lines: [],
            reason: `${item.name} at ${holder.name} is ${c.agePercent}% through its holding period (${c.quantity} ${item.unit}s). A 10% discount, Rs ${(sell.priceCents / 100).toFixed(2)} → Rs ${(discounted / 100).toFixed(2)}, helps it sell today.`,
            payload: { itemId: item.id, partyId: null, direction: 'SELL', priceCents: discounted, previousCents: sell.priceCents, validFrom: new Date().toISOString(), sourceNote: 'freshness rule' },
          },
          { rule: 'FRESHNESS' },
        );
        n++;
      }
    }
    return n;
  }

  private async regularOrder() {
    const tomorrow = addDays(startOfDay(), 1);
    const customers = await this.prisma.party.findMany({
      where: { type: 'CUSTOMER', status: 'ACTIVE', segment: { in: ['B2B_REGULAR', 'B2B_BIG'] }, usualDays: { has: tomorrow.getDay() } },
    });
    const outlet = await this.prisma.party.findFirst({ where: { type: 'WAREHOUSE' } });
    let n = 0;
    for (const c of customers) {
      const usual = (c.usualOrder as { itemId: string; quantity: number }[] | null) ?? [];
      if (!usual.length) continue;
      const exists = await this.prisma.request.count({
        where: { type: 'SALE_ORDER', toPartyId: c.id, status: { not: 'REJECTED' }, dueAt: { gte: tomorrow, lt: addDays(tomorrow, 1) } },
      });
      if (exists) continue;
      await this.requests.create(
        {
          type: 'SALE_ORDER', fromPartyId: outlet?.id ?? null, toPartyId: c.id, lines: usual, dueAt: tomorrow,
          windowStart: c.windowStart ?? undefined, windowEnd: c.windowEnd ?? undefined,
          reason: `${c.name} usually orders on ${tomorrow.toLocaleDateString('en-GB', { weekday: 'long' })}s. Confirm by call.`,
        },
        { rule: 'REGULAR_ORDER' },
      );
      n++;
    }
    return n;
  }

  private async supplierOrderDay() {
    const tomorrow = addDays(startOfDay(), 1);
    const suppliers = await this.prisma.party.findMany({ where: { type: 'SUPPLIER', status: 'ACTIVE', usualDays: { has: tomorrow.getDay() } } });
    const wh = await this.prisma.party.findFirst({ where: { type: 'WAREHOUSE' } });
    if (!wh) return 0;
    let n = 0;
    for (const s of suppliers) {
      const usual = (s.usualOrder as { itemId: string; quantity: number }[] | null) ?? [];
      if (!usual.length) continue;
      const exists = await this.prisma.request.count({
        where: { type: 'PURCHASE', fromPartyId: s.id, status: { not: 'REJECTED' }, dueAt: { gte: tomorrow, lt: addDays(tomorrow, 1) } },
      });
      if (exists) continue;
      await this.requests.create(
        {
          type: 'PURCHASE', fromPartyId: s.id, toPartyId: wh.id, lines: usual, dueAt: tomorrow,
          reason: `Usual purchase day for ${s.name}${s.contactTier === 'OWNER_ONLY' ? ' (owner-only supplier)' : ''}.`,
        },
        { rule: 'SUPPLIER_ORDER_DAY' },
      );
      n++;
    }
    return n;
  }

  private async quietBigCustomer() {
    const quietDays = await this.settings.get('quietBigCustomerDays');
    const bigs = await this.prisma.party.findMany({ where: { type: 'CUSTOMER', segment: 'B2B_BIG', status: 'ACTIVE' } });
    const owner = await this.prisma.user.findFirst({ where: { role: 'OWNER', active: true } });
    let n = 0;
    for (const c of bigs) {
      const last = await this.prisma.request.findFirst({ where: { type: 'SALE_ORDER', toPartyId: c.id, status: { not: 'REJECTED' } }, orderBy: { createdAt: 'desc' } });
      const days = last ? daysBetween(last.createdAt, new Date()) : 999;
      if (days < quietDays) continue;
      if (await this.alreadyOpen('CALL_TASK', 'QUIET_BIG_CUSTOMER', { toPartyId: c.id })) continue;
      await this.requests.create(
        {
          type: 'CALL_TASK', toPartyId: c.id, lines: [], dueAt: startOfDay(),
          assignedToId: c.contactTier === 'OWNER_ONLY' ? owner?.id ?? null : null,
          reason: `${c.name} has not ordered for ${last ? days : 'over 30'} days. Call to check in.`,
        },
        { rule: 'QUIET_BIG_CUSTOMER' },
      );
      n++;
    }
    return n;
  }

  private async chequeDue() {
    const days = await this.settings.get('chequeDueDays');
    const until = addDays(startOfDay(), days);
    const cheques = await this.prisma.movement.findMany({
      where: { method: 'CHEQUE', chequeStatus: 'PENDING', chequeDate: { lte: until } },
      include: { fromParty: true },
    });
    const bank = await this.prisma.party.findUnique({ where: { systemCode: 'BANK' } });
    let n = 0;
    for (const ch of cheques) {
      const exists = await this.prisma.request.count({
        where: { type: 'COLLECTION', createdByRule: 'CHEQUE_DUE', status: { not: 'REJECTED' }, payload: { path: ['movementId'], equals: ch.id } },
      });
      if (exists) continue;
      await this.requests.create(
        {
          type: 'COLLECTION', fromPartyId: ch.fromPartyId, toPartyId: bank?.id ?? null, lines: [], dueAt: ch.chequeDate ?? startOfDay(),
          reason: `Cheque ${ch.chequeNumber ?? ''} from ${ch.fromParty.name} for Rs ${((ch.amountCents ?? 0) / 100).toLocaleString('en-LK')} is dated ${ch.chequeDate?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. Deposit it.`,
          payload: { movementId: ch.id, amountCents: ch.amountCents },
        },
        { rule: 'CHEQUE_DUE' },
      );
      n++;
    }
    return n;
  }

  private async overdueCredit() {
    const balances = await this.views.balances();
    const customers = await this.prisma.party.findMany({ where: { type: 'CUSTOMER', creditDays: { gt: 0 } } });
    const owner = await this.prisma.user.findFirst({ where: { role: 'OWNER', active: true } });
    let n = 0;
    for (const c of customers) {
      const bal = balances.get(c.id) ?? 0;
      if (bal <= 0) continue;
      const oldest = await this.prisma.movement.findFirst({ where: { kind: 'GOODS', toPartyId: c.id }, orderBy: { occurredAt: 'asc' } });
      if (!oldest || daysBetween(oldest.occurredAt, new Date()) <= c.creditDays) continue;
      if (await this.alreadyOpen('CALL_TASK', 'OVERDUE_CREDIT', { toPartyId: c.id })) continue;
      await this.requests.create(
        {
          type: 'CALL_TASK', toPartyId: c.id, lines: [], dueAt: startOfDay(),
          assignedToId: c.segment === 'B2B_BIG' ? owner?.id ?? null : null,
          reason: `${c.name} owes Rs ${(bal / 100).toLocaleString('en-LK')}, past ${c.creditDays} credit days. Call, and consider holding credit.`,
          payload: { holdCredit: true, balanceCents: bal },
        },
        { rule: 'OVERDUE_CREDIT' },
      );
      n++;
    }
    return n;
  }

  /** Route plan (spec §9.4): propose a stop order per driver for a day. Not a Request; staff adjust and send. */
  async proposeRoutePlan(day: Date) {
    const plan = await this.requests.routePlan(day);
    const drivers = plan.drivers;
    if (!drivers.length) return plan;
    // Group unassigned stops by route name, then deal round-robin to drivers in routePosition order.
    const unassigned = [...plan.unassigned].sort((a, b) => {
      const pa = (a.type === 'SALE_ORDER' ? a.toParty : a.fromParty)?.routePosition ?? 999;
      const pb = (b.type === 'SALE_ORDER' ? b.toParty : b.fromParty)?.routePosition ?? 999;
      return pa - pb;
    });
    const counts = drivers.map((d) => d.stops.length);
    const assignments: { requestId: string; driverId: string; position: number }[] = [];
    for (const s of unassigned) {
      const i = counts.indexOf(Math.min(...counts));
      counts[i]++;
      assignments.push({ requestId: s.id, driverId: drivers[i].id, position: counts[i] });
    }
    return { ...plan, proposedAssignments: assignments };
  }
}
