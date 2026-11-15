import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RatesService } from '../rates/rates.service.js';
import { SettingsService } from '../common/settings.service.js';
import { addDays, atTime, endOfDay, hoursBetween, startOfDay } from '../common/dates.js';

export type StockCell = {
  holderId: string;
  itemId: string;
  quantity: number;
  oldestBatchAt: Date | null;
  freshness: 'green' | 'amber' | 'red' | null;
  agePercent: number | null;
  belowReorder: boolean;
  reorderLevel: number | null;
};

/** Calculated views (spec §4): never stored, always derived from Movements. */
@Injectable()
export class ViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RatesService,
    private readonly settings: SettingsService,
  ) {}

  /** Stock at every holder: goods in minus goods out, with freshness and reorder flags. */
  async stock(): Promise<StockCell[]> {
    const [ins, outs, levels, items] = await Promise.all([
      this.prisma.movement.groupBy({ by: ['toPartyId', 'itemId'], where: { kind: 'GOODS' }, _sum: { quantity: true } }),
      this.prisma.movement.groupBy({ by: ['fromPartyId', 'itemId'], where: { kind: 'GOODS' }, _sum: { quantity: true } }),
      this.prisma.reorderLevel.findMany(),
      this.prisma.item.findMany({ where: { active: true } }),
    ]);
    const map = new Map<string, StockCell>();
    const key = (h: string, i: string) => `${h}:${i}`;
    const ensure = (h: string, i: string) => {
      const k = key(h, i);
      let c = map.get(k);
      if (!c) {
        c = { holderId: h, itemId: i, quantity: 0, oldestBatchAt: null, freshness: null, agePercent: null, belowReorder: false, reorderLevel: null };
        map.set(k, c);
      }
      return c;
    };
    for (const r of ins) if (r.itemId) ensure(r.toPartyId, r.itemId).quantity += r._sum.quantity ?? 0;
    for (const r of outs) if (r.itemId) ensure(r.fromPartyId, r.itemId).quantity -= r._sum.quantity ?? 0;
    for (const l of levels) {
      const c = ensure(l.holderId, l.itemId);
      c.reorderLevel = l.quantity;
      c.belowReorder = c.quantity < l.quantity;
    }

    // Freshness: age of the oldest batch still at the holder, against the item's holding period.
    const perishable = items.filter((i) => i.perishable);
    if (perishable.length) {
      const batchIns = await this.prisma.movement.findMany({
        where: { kind: 'GOODS', batchId: { not: null }, itemId: { in: perishable.map((i) => i.id) } },
        select: { toPartyId: true, fromPartyId: true, itemId: true, batchId: true, quantity: true, batch: { select: { receivedAt: true } } },
        orderBy: { occurredAt: 'asc' },
      });
      // Remaining per (holder, batch): in minus out.
      const remaining = new Map<string, { qty: number; at: Date }>();
      for (const m of batchIns) {
        if (!m.batchId || !m.itemId) continue;
        const kin = `${m.toPartyId}:${m.batchId}`;
        const kout = `${m.fromPartyId}:${m.batchId}`;
        const at = m.batch?.receivedAt ?? new Date();
        const i = remaining.get(kin) ?? { qty: 0, at };
        i.qty += m.quantity ?? 0;
        remaining.set(kin, i);
        const o = remaining.get(kout) ?? { qty: 0, at };
        o.qty -= m.quantity ?? 0;
        remaining.set(kout, o);
      }
      const batchHolder = new Map<string, string>(); // batchId → itemId
      for (const m of batchIns) if (m.batchId && m.itemId) batchHolder.set(m.batchId, m.itemId);
      const now = new Date();
      for (const [k, v] of remaining) {
        if (v.qty <= 0) continue;
        const [holderId, batchId] = k.split(':');
        const itemId = batchHolder.get(batchId);
        if (!itemId) continue;
        const c = ensure(holderId, itemId);
        if (!c.oldestBatchAt || v.at < c.oldestBatchAt) c.oldestBatchAt = v.at;
      }
      for (const c of map.values()) {
        const item = items.find((i) => i.id === c.itemId);
        if (!item?.perishable || !c.oldestBatchAt || c.quantity <= 0) continue;
        const agePercent = Math.round((hoursBetween(c.oldestBatchAt, now) / (item.holdingDays * 24)) * 100);
        c.agePercent = agePercent;
        c.freshness = agePercent >= 100 ? 'red' : agePercent >= 50 ? 'amber' : 'green';
      }
    }
    return [...map.values()];
  }

  /** Customer balance (positive = they owe us) and supplier payable (positive = we owe them), by party id. */
  async balances(): Promise<Map<string, number>> {
    const [goods, money, parties] = await Promise.all([
      this.prisma.movement.findMany({
        where: { kind: 'GOODS' },
        select: { fromPartyId: true, toPartyId: true, quantity: true, rateCents: true },
      }),
      this.prisma.movement.findMany({
        where: { kind: 'MONEY', NOT: { chequeStatus: 'BOUNCED' } },
        select: { fromPartyId: true, toPartyId: true, amountCents: true },
      }),
      this.prisma.party.findMany({ where: { type: { in: ['CUSTOMER', 'SUPPLIER'] } }, select: { id: true, type: true } }),
    ]);
    const out = new Map<string, number>();
    const kind = new Map(parties.map((p) => [p.id, p.type]));
    const add = (id: string, cents: number) => out.set(id, (out.get(id) ?? 0) + cents);
    for (const g of goods) {
      const value = (g.quantity ?? 0) * (g.rateCents ?? 0);
      if (kind.get(g.toPartyId) === 'CUSTOMER') add(g.toPartyId, value); // goods delivered → they owe
      if (kind.get(g.fromPartyId) === 'CUSTOMER') add(g.fromPartyId, -value); // returns
      if (kind.get(g.fromPartyId) === 'SUPPLIER') add(g.fromPartyId, value); // goods received → we owe
      if (kind.get(g.toPartyId) === 'SUPPLIER') add(g.toPartyId, -value);
    }
    for (const m of money) {
      const amt = m.amountCents ?? 0;
      if (kind.get(m.fromPartyId) === 'CUSTOMER') add(m.fromPartyId, -amt); // they paid
      if (kind.get(m.toPartyId) === 'CUSTOMER') add(m.toPartyId, amt); // refund
      if (kind.get(m.toPartyId) === 'SUPPLIER') add(m.toPartyId, -amt); // we paid
      if (kind.get(m.fromPartyId) === 'SUPPLIER') add(m.fromPartyId, amt);
    }
    return out;
  }

  /** Cash in a driver's hand: cash received minus handed over. */
  async driverCash(driverPartyId: string) {
    const [inn, out] = await Promise.all([
      this.prisma.movement.aggregate({ where: { kind: 'MONEY', method: 'CASH', toPartyId: driverPartyId }, _sum: { amountCents: true } }),
      this.prisma.movement.aggregate({ where: { kind: 'MONEY', method: 'CASH', fromPartyId: driverPartyId }, _sum: { amountCents: true } }),
    ]);
    return (inn._sum.amountCents ?? 0) - (out._sum.amountCents ?? 0);
  }

  /** Expected cash in an outlet's drawer today (for day close): cash sales minus cash out. */
  async outletCashToday(outletId: string, day = new Date()) {
    const where = { kind: 'MONEY' as const, method: 'CASH' as const, occurredAt: { gte: startOfDay(day), lte: endOfDay(day) } };
    const [inn, out] = await Promise.all([
      this.prisma.movement.aggregate({ where: { ...where, toPartyId: outletId }, _sum: { amountCents: true } }),
      this.prisma.movement.aggregate({ where: { ...where, fromPartyId: outletId }, _sum: { amountCents: true } }),
    ]);
    return (inn._sum.amountCents ?? 0) - (out._sum.amountCents ?? 0);
  }

  /** Sales value (goods to customers at sell rate) between two dates, grouped by the selling holder. */
  async salesByHolder(from: Date, to: Date) {
    const customers = await this.prisma.party.findMany({ where: { type: 'CUSTOMER' }, select: { id: true } });
    const walkIn = await this.prisma.party.findUnique({ where: { systemCode: 'WALK_IN' } });
    const ids = customers.map((c) => c.id).concat(walkIn ? [walkIn.id] : []);
    const rows = await this.prisma.movement.findMany({
      where: { kind: 'GOODS', toPartyId: { in: ids }, occurredAt: { gte: from, lte: to } },
      select: { fromPartyId: true, quantity: true, rateCents: true, itemId: true },
    });
    const byHolder = new Map<string, number>();
    const byItem = new Map<string, { quantity: number; cents: number }>();
    let total = 0;
    for (const r of rows) {
      const v = (r.quantity ?? 0) * (r.rateCents ?? 0);
      total += v;
      byHolder.set(r.fromPartyId, (byHolder.get(r.fromPartyId) ?? 0) + v);
      if (r.itemId) {
        const it = byItem.get(r.itemId) ?? { quantity: 0, cents: 0 };
        it.quantity += r.quantity ?? 0;
        it.cents += v;
        byItem.set(r.itemId, it);
      }
    }
    return { total, byHolder, byItem };
  }

  /** Profit (spec §4): (sell − buy) × quantity, minus losses, over a period. */
  async profit(from: Date, to: Date) {
    const customers = await this.prisma.party.findMany({ where: { type: 'CUSTOMER' }, select: { id: true } });
    const walkIn = await this.prisma.party.findUnique({ where: { systemCode: 'WALK_IN' } });
    const loss = await this.prisma.party.findUnique({ where: { systemCode: 'LOSS' } });
    const custIds = customers.map((c) => c.id).concat(walkIn ? [walkIn.id] : []);
    const [sales, losses, items] = await Promise.all([
      this.prisma.movement.findMany({
        where: { kind: 'GOODS', toPartyId: { in: custIds }, occurredAt: { gte: from, lte: to } },
        select: { fromPartyId: true, itemId: true, quantity: true, rateCents: true, occurredAt: true },
      }),
      loss
        ? this.prisma.movement.findMany({
            where: { kind: 'GOODS', toPartyId: loss.id, occurredAt: { gte: from, lte: to } },
            select: { fromPartyId: true, itemId: true, quantity: true, rateCents: true, occurredAt: true, batch: { select: { supplierId: true } } },
          })
        : [],
      this.prisma.item.findMany(),
    ]);
    const buyCache = new Map<string, number>();
    const buyAt = async (itemId: string) => {
      let v = buyCache.get(itemId);
      if (v === undefined) {
        v = await this.rates.current(itemId, 'BUY', null);
        buyCache.set(itemId, v);
      }
      return v;
    };
    let revenue = 0;
    let cost = 0;
    const byItem = new Map<string, { name: string; revenue: number; cost: number; quantity: number }>();
    const byOutlet = new Map<string, { revenue: number; cost: number }>();
    for (const s of sales) {
      if (!s.itemId) continue;
      const buy = await buyAt(s.itemId);
      const rev = (s.quantity ?? 0) * (s.rateCents ?? 0);
      const c = (s.quantity ?? 0) * buy;
      revenue += rev;
      cost += c;
      const it = byItem.get(s.itemId) ?? { name: items.find((i) => i.id === s.itemId)?.name ?? '', revenue: 0, cost: 0, quantity: 0 };
      it.revenue += rev;
      it.cost += c;
      it.quantity += s.quantity ?? 0;
      byItem.set(s.itemId, it);
      const o = byOutlet.get(s.fromPartyId) ?? { revenue: 0, cost: 0 };
      o.revenue += rev;
      o.cost += c;
      byOutlet.set(s.fromPartyId, o);
    }
    let lossCents = 0;
    const lossByItem = new Map<string, number>();
    const lossBySupplier = new Map<string, number>();
    const lossByHolder = new Map<string, number>();
    for (const l of losses) {
      if (!l.itemId) continue;
      const v = (l.quantity ?? 0) * (await buyAt(l.itemId));
      lossCents += v;
      lossByItem.set(l.itemId, (lossByItem.get(l.itemId) ?? 0) + v);
      lossByHolder.set(l.fromPartyId, (lossByHolder.get(l.fromPartyId) ?? 0) + v);
      const sup = l.batch?.supplierId ?? 'unknown';
      lossBySupplier.set(sup, (lossBySupplier.get(sup) ?? 0) + v);
    }
    return {
      revenueCents: revenue,
      costCents: cost,
      lossCents,
      profitCents: revenue - cost - lossCents,
      byItem: [...byItem.entries()].map(([itemId, v]) => ({ itemId, ...v, profit: v.revenue - v.cost })),
      byOutlet: [...byOutlet.entries()].map(([holderId, v]) => ({ holderId, ...v, profit: v.revenue - v.cost })),
      lossByItem: [...lossByItem.entries()].map(([itemId, cents]) => ({ itemId, cents })),
      lossBySupplier: [...lossBySupplier.entries()].map(([supplierId, cents]) => ({ supplierId, cents })),
      lossByHolder: [...lossByHolder.entries()].map(([holderId, cents]) => ({ holderId, cents })),
    };
  }

  /** Late deliveries right now: stops whose window has passed and are not done. */
  async lateStops(day = new Date()) {
    const lateMin = await this.settings.get('lateDeliveryMinutes');
    const stops = await this.prisma.request.findMany({
      where: {
        type: 'SALE_ORDER',
        status: { in: ['APPROVED', 'IN_PROGRESS'] },
        assignedToId: { not: null },
        dueAt: { gte: startOfDay(day), lte: endOfDay(day) },
        windowEnd: { not: null },
      },
      include: { toParty: { select: { id: true, name: true } }, assignedTo: { select: { id: true, displayName: true } } },
    });
    const now = new Date();
    return stops
      .map((s) => ({ ...s, minutesLate: Math.floor((now.getTime() - atTime(day, s.windowEnd!).getTime()) / 60_000) }))
      .filter((s) => s.minutesLate >= lateMin)
      .sort((a, b) => b.minutesLate - a.minutesLate);
  }

  /** Owner "Today" (spec §8.1). */
  async ownerToday() {
    const today = startOfDay();
    const lastWeek = addDays(today, -7);
    const [salesToday, salesLastWeek, outlets, stock, items, late, feed, dueToday, collectedToday] = await Promise.all([
      this.salesByHolder(today, endOfDay(today)),
      this.salesByHolder(lastWeek, endOfDay(lastWeek)),
      this.prisma.party.findMany({ where: { type: 'OUTLET' }, orderBy: { name: 'asc' } }),
      this.stock(),
      this.prisma.item.findMany({ where: { active: true } }),
      this.lateStops(),
      this.prisma.movement.findMany({
        where: { occurredAt: { gte: addDays(today, -1) } },
        include: { item: true, fromParty: { select: { name: true, type: true } }, toParty: { select: { name: true, type: true } }, by: { select: { displayName: true } } },
        orderBy: { occurredAt: 'desc' },
        take: 10,
      }),
      this.prisma.request.findMany({
        where: { type: 'SALE_ORDER', status: { in: ['APPROVED', 'IN_PROGRESS', 'DONE'] }, dueAt: { gte: today, lte: endOfDay(today) } },
        include: { lines: true },
      }),
      this.prisma.movement.aggregate({
        where: { kind: 'MONEY', occurredAt: { gte: today, lte: endOfDay(today) }, NOT: { chequeStatus: 'BOUNCED' }, fromParty: { type: 'CUSTOMER' } },
        _sum: { amountCents: true },
      }),
    ]);
    const walkInCash = await this.prisma.movement.aggregate({
      where: { kind: 'MONEY', occurredAt: { gte: today, lte: endOfDay(today) }, fromParty: { systemCode: 'WALK_IN' } },
      _sum: { amountCents: true },
    });
    const alerts = stock.filter((c) => c.belowReorder || c.freshness === 'red' || c.freshness === 'amber');
    const dueCents = dueToday.reduce((s, r) => s + r.lines.reduce((a, l) => a + l.quantity * l.rateCents, 0), 0);
    return {
      date: today,
      kpis: {
        salesTodayCents: salesToday.total,
        salesLastWeekCents: salesLastWeek.total,
        collectedTodayCents: (collectedToday._sum.amountCents ?? 0) + (walkInCash._sum.amountCents ?? 0),
        dueTodayCents: dueCents,
        stockAlerts: alerts.length,
        lateDeliveries: late.length,
      },
      outlets: outlets.map((o) => ({
        id: o.id,
        name: o.name,
        salesCents: salesToday.byHolder.get(o.id) ?? 0,
        alerts: alerts.filter((a) => a.holderId === o.id).length,
      })),
      stockAlerts: alerts.map((a) => ({ ...a, itemName: items.find((i) => i.id === a.itemId)?.name ?? '' })),
      late,
      feed,
    };
  }

  /** Cheque calendar (spec §9.7). */
  cheques(status?: 'PENDING' | 'DEPOSITED' | 'CLEARED' | 'BOUNCED') {
    return this.prisma.movement.findMany({
      where: { method: 'CHEQUE', ...(status ? { chequeStatus: status } : {}) },
      include: { fromParty: { select: { id: true, name: true } }, toParty: { select: { id: true, name: true } } },
      orderBy: { chequeDate: 'asc' },
    });
  }

  /** Receivables ageing buckets (spec §8.5): 0–30, 31–60, over 60 days. */
  async receivables() {
    const balances = await this.balances();
    const customers = await this.prisma.party.findMany({ where: { type: 'CUSTOMER' } });
    const rows: { party: (typeof customers)[number]; balanceCents: number; oldestDays: number }[] = [];
    for (const c of customers) {
      const bal = balances.get(c.id) ?? 0;
      if (bal <= 0) continue;
      const oldest = await this.prisma.movement.findFirst({
        where: { kind: 'GOODS', toPartyId: c.id },
        orderBy: { occurredAt: 'asc' },
        select: { occurredAt: true },
      });
      const oldestDays = oldest ? Math.floor((Date.now() - oldest.occurredAt.getTime()) / 86_400_000) : 0;
      rows.push({ party: c, balanceCents: bal, oldestDays });
    }
    const bucket = (d: number) => (d <= 30 ? '0-30' : d <= 60 ? '31-60' : '60+');
    return {
      rows: rows.map((r) => ({ ...r, bucket: bucket(r.oldestDays) })).sort((a, b) => b.balanceCents - a.balanceCents),
      totals: {
        '0-30': rows.filter((r) => bucket(r.oldestDays) === '0-30').reduce((s, r) => s + r.balanceCents, 0),
        '31-60': rows.filter((r) => bucket(r.oldestDays) === '31-60').reduce((s, r) => s + r.balanceCents, 0),
        '60+': rows.filter((r) => bucket(r.oldestDays) === '60+').reduce((s, r) => s + r.balanceCents, 0),
      },
    };
  }

  async payables() {
    const balances = await this.balances();
    const suppliers = await this.prisma.party.findMany({ where: { type: 'SUPPLIER' } });
    return suppliers
      .map((s) => ({ party: s, payableCents: balances.get(s.id) ?? 0 }))
      .filter((r) => r.payableCents !== 0)
      .sort((a, b) => b.payableCents - a.payableCents);
  }

  /** Weekly sales per outlet for the last N weeks (spec §8.5 trend). */
  async salesTrend(weeks = 12) {
    const outlets = await this.prisma.party.findMany({ where: { type: 'OUTLET' }, orderBy: { name: 'asc' } });
    const end = endOfDay();
    const series: { weekStart: Date; byOutlet: Record<string, number>; total: number }[] = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const from = startOfDay(addDays(end, -7 * (w + 1) + 1));
      const to = w === 0 ? end : endOfDay(addDays(end, -7 * w));
      const s = await this.salesByHolder(from, to);
      const byOutlet: Record<string, number> = {};
      for (const o of outlets) byOutlet[o.id] = s.byHolder.get(o.id) ?? 0;
      series.push({ weekStart: from, byOutlet, total: s.total });
    }
    return { outlets: outlets.map((o) => ({ id: o.id, name: o.name })), series };
  }
}
