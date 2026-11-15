import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APPROVER_ROLES, type RequestCreate, type RequestDecision, type RequestType } from 'shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { RatesService } from '../rates/rates.service.js';
import { SettingsService } from '../common/settings.service.js';
import { ViewsService } from '../views/views.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { endOfDay, startOfDay } from '../common/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';

const REQUEST_INCLUDE = {
  lines: { include: { item: true } },
  fromParty: true,
  toParty: true,
  assignedTo: { select: { id: true, displayName: true, role: true } },
  createdBy: { select: { id: true, displayName: true, role: true } },
  approvedBy: { select: { id: true, displayName: true } },
  note: true,
} satisfies Prisma.RequestInclude;

/** Types that only the owner may approve, regardless of value (spec §3). */
const OWNER_ONLY_TYPES: RequestType[] = ['PRICE_CHANGE', 'CREDIT_LIMIT_CHANGE'];

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RatesService,
    private readonly settings: SettingsService,
    private readonly views: ViewsService,
  ) {}

  /** Create a PROPOSED request. `by` is a user, or a rule code when automation proposes. */
  async create(input: RequestCreate, by: { user: AuthUser } | { rule: string }) {
    const lines = await Promise.all(
      input.lines.map(async (l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        rateCents:
          l.rateCents ??
          (await this.rates.current(
            l.itemId,
            input.type === 'PURCHASE' ? 'BUY' : 'SELL',
            input.type === 'PURCHASE' ? input.fromPartyId : input.toPartyId,
          )),
      })),
    );

    // Leave check (spec §5): flag leave on a day where someone else is already off.
    let payload = input.payload ?? {};
    let reason = input.reason;
    if (input.type === 'LEAVE' && input.dueAt) {
      const othersOff = await this.prisma.request.count({
        where: {
          type: 'LEAVE',
          status: { in: ['APPROVED', 'PROPOSED'] },
          dueAt: { gte: startOfDay(input.dueAt), lte: endOfDay(input.dueAt) },
        },
      });
      if (othersOff > 0) {
        payload = { ...payload, leavesDayShort: true, othersOff };
        reason = `${reason ?? 'Leave request'}. Leaves day short: ${othersOff} other${othersOff > 1 ? 's' : ''} already off.`;
      }
    }

    const owner = 'user' in by;
    const escalated = owner && OWNER_ONLY_TYPES.includes(input.type) && by.user.role !== 'OWNER';

    return this.prisma.request.create({
      data: {
        type: input.type,
        fromPartyId: input.fromPartyId ?? null,
        toPartyId: input.toPartyId ?? null,
        dueAt: input.dueAt ?? null,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        assignedToId: input.assignedToId ?? null,
        createdById: owner ? by.user.id : null,
        createdByRule: owner ? null : by.rule,
        reason,
        payload: payload as Prisma.InputJsonValue,
        noteId: input.noteId,
        escalated,
        stopStatus: input.type === 'SALE_ORDER' || input.type === 'PURCHASE' ? 'PENDING' : null,
        lines: { create: lines },
        events: { create: { action: 'CREATED', byId: owner ? by.user.id : null } },
      },
      include: REQUEST_INCLUDE,
    });
  }

  async get(id: string) {
    const r = await this.prisma.request.findUnique({
      where: { id },
      include: {
        ...REQUEST_INCLUDE,
        events: { include: { by: { select: { displayName: true } } }, orderBy: { at: 'asc' } },
        movements: { include: { item: true } },
        children: { select: { id: true, type: true, status: true } },
      },
    });
    if (!r) throw new NotFoundException('Request not found');
    return r;
  }

  /** The review queue (spec §9.2). `tab`: mine | owner | all. */
  async inbox(user: AuthUser, tab: 'mine' | 'owner' | 'all' = 'mine') {
    const where: Prisma.RequestWhereInput = { status: 'PROPOSED' };
    if (tab === 'owner') {
      where.OR = [{ escalated: true }, { type: { in: OWNER_ONLY_TYPES } }];
    } else if (tab === 'mine') {
      const types = (Object.keys(APPROVER_ROLES) as RequestType[]).filter((t) =>
        APPROVER_ROLES[t].includes(user.role),
      );
      where.type = { in: types };
      if (user.role !== 'OWNER') {
        where.escalated = false;
        where.NOT = { type: { in: OWNER_ONLY_TYPES } };
      }
      if (user.role === 'WAREHOUSE') where.type = { in: ['TRANSFER'] };
      if (user.role === 'CASHIER') where.type = { in: ['RETURN'] };
    }
    const rows = await this.prisma.request.findMany({
      where,
      include: REQUEST_INCLUDE,
      orderBy: [{ createdAt: 'asc' }],
      take: 200,
    });
    return rows.map((r) => ({ ...r, valueCents: this.value(r) }));
  }

  /** Approve, edit-then-approve, reject, or send to owner (spec §5). */
  async decide(id: string, decision: RequestDecision, user: AuthUser) {
    const r = await this.get(id);
    if (r.status !== 'PROPOSED') throw new ConflictException(`Already ${r.status.toLowerCase()}`);

    if (decision.action === 'SEND_TO_OWNER') {
      return this.prisma.request.update({
        where: { id },
        data: {
          escalated: true,
          decisionNote: decision.note,
          events: { create: { action: 'SENT_TO_OWNER', byId: user.id, note: decision.note } },
        },
        include: REQUEST_INCLUDE,
      });
    }

    await this.assertCanApprove(r, user);

    if (decision.action === 'REJECT') {
      if (!decision.rejectReason) throw new BadRequestException('Pick a reason');
      const updated = await this.prisma.request.update({
        where: { id },
        data: {
          status: 'REJECTED',
          approvedById: user.id,
          approvedAt: new Date(),
          rejectReason: decision.rejectReason,
          decisionNote: decision.note,
          events: { create: { action: 'REJECTED', byId: user.id, note: decision.note ?? decision.rejectReason } },
        },
        include: REQUEST_INCLUDE,
      });
      if (r.createdByRule) {
        await this.prisma.rule.update({
          where: { code: r.createdByRule },
          data: { rejectedCount: { increment: 1 } },
        });
      }
      return updated;
    }

    if (decision.action === 'EDIT_APPROVE') {
      if (!decision.lines || decision.lines.length === 0) throw new BadRequestException('Lines required');
      const snapshot = r.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, rateCents: l.rateCents }));
      await this.prisma.$transaction([
        this.prisma.requestLine.deleteMany({ where: { requestId: id } }),
        this.prisma.requestLine.createMany({
          data: await Promise.all(
            decision.lines.map(async (l) => ({
              requestId: id,
              itemId: l.itemId,
              quantity: l.quantity,
              rateCents:
                l.rateCents ??
                (await this.rates.current(
                  l.itemId,
                  r.type === 'PURCHASE' ? 'BUY' : 'SELL',
                  r.type === 'PURCHASE' ? r.fromPartyId : r.toPartyId,
                )),
            })),
          ),
        }),
        this.prisma.requestEvent.create({
          data: { requestId: id, action: 'EDITED', byId: user.id, note: decision.note, snapshot },
        }),
      ]);
      if (r.createdByRule) {
        await this.prisma.rule.update({
          where: { code: r.createdByRule },
          data: { editedCount: { increment: 1 } },
        });
      }
    }

    const approved = await this.prisma.request.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date(),
        decisionNote: decision.note,
        events: { create: { action: 'APPROVED', byId: user.id, note: decision.note } },
      },
      include: REQUEST_INCLUDE,
    });

    await this.applyApprovalEffects(approved, user);
    return this.get(id);
  }

  /** Some approvals finish the job immediately (spec §13): price change, credit limit, handover, spoilage, adjustment. */
  private async applyApprovalEffects(
    r: Prisma.RequestGetPayload<{ include: typeof REQUEST_INCLUDE }>,
    user: AuthUser,
  ) {
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    switch (r.type) {
      case 'PRICE_CHANGE': {
        await this.rates.applyApproved(payload, user.id, r.createdById);
        if (payload.direction === 'BUY') {
          // Price rule (spec §5): a supplier buy price went up → propose matching sell rates keeping margin.
          const target = await this.settings.get('targetMarginPercent');
          const sell = Math.round((Number(payload.priceCents) * (100 + target)) / 100);
          const item = await this.prisma.item.findUniqueOrThrow({ where: { id: String(payload.itemId) } });
          const currentSell = await this.rates.current(item.id, 'SELL', null);
          if (sell !== currentSell) {
            await this.create(
              {
                type: 'PRICE_CHANGE',
                lines: [],
                reason: `Buy price of ${item.name} changed to Rs ${(Number(payload.priceCents) / 100).toFixed(2)}. Sell Rs ${(currentSell / 100).toFixed(2)} → Rs ${(sell / 100).toFixed(2)} keeps a ${target}% margin.`,
                payload: {
                  itemId: item.id,
                  partyId: null,
                  direction: 'SELL',
                  priceCents: sell,
                  previousCents: currentSell,
                  validFrom: new Date().toISOString(),
                  sourceNote: 'price rule',
                },
              },
              { rule: 'PRICE_CHANGE' },
            );
          }
        }
        await this.finish(r.id, user, 'Rate applied');
        break;
      }
      case 'CREDIT_LIMIT_CHANGE': {
        if (!r.toPartyId) break;
        await this.prisma.party.update({
          where: { id: r.toPartyId },
          data: {
            creditLimitCents: payload.creditLimitCents != null ? Number(payload.creditLimitCents) : undefined,
            creditDays: payload.creditDays != null ? Number(payload.creditDays) : undefined,
            creditHold: payload.creditHold != null ? Boolean(payload.creditHold) : undefined,
          },
        });
        await this.finish(r.id, user, 'Terms updated');
        break;
      }
      case 'CASH_HANDOVER': {
        // Driver → Cash office for the counted amount. The difference is recorded in the reason.
        if (!r.fromPartyId) break;
        const office = await this.prisma.party.findUniqueOrThrow({ where: { systemCode: 'CASH_OFFICE' } });
        const counted = Number(payload.countedCents ?? payload.expectedCents ?? 0);
        const expected = Number(payload.expectedCents ?? 0);
        if (counted > 0) {
          await this.prisma.movement.create({
            data: {
              requestId: r.id,
              kind: 'MONEY',
              fromPartyId: r.fromPartyId,
              toPartyId: office.id,
              amountCents: counted,
              method: 'CASH',
              reason:
                counted === expected
                  ? 'Handover accepted'
                  : `Handover: counted Rs ${(counted / 100).toFixed(2)} vs expected Rs ${(expected / 100).toFixed(2)}`,
              clientId: randomUUID(),
              byId: user.id,
            },
          });
        }
        await this.finish(r.id, user, 'Handover accepted');
        break;
      }
      case 'SPOILAGE':
      case 'STOCK_ADJUSTMENT': {
        if (!r.fromPartyId || !r.toPartyId) break;
        for (const l of r.lines) {
          await this.prisma.movement.create({
            data: {
              requestId: r.id,
              kind: 'GOODS',
              fromPartyId: r.fromPartyId,
              toPartyId: r.toPartyId,
              itemId: l.itemId,
              quantity: l.quantity,
              rateCents: l.rateCents,
              reason: r.reason ?? r.type.toLowerCase(),
              clientId: randomUUID(),
              byId: user.id,
            },
          });
        }
        await this.finish(r.id, user);
        break;
      }
      case 'LEAVE':
      case 'SHIFT':
        await this.finish(r.id, user);
        break;
      default:
        break;
    }
  }

  private async assertCanApprove(
    r: { type: RequestType; escalated: boolean; lines: { quantity: number; rateCents: number }[]; payload: unknown },
    user: AuthUser,
  ) {
    const allowed = APPROVER_ROLES[r.type] ?? [];
    if (!allowed.includes(user.role)) {
      throw new ForbiddenException(`Only ${allowed.join(' or ').toLowerCase()} can approve this`);
    }
    if (user.role === 'OWNER') return;
    if (r.escalated || OWNER_ONLY_TYPES.includes(r.type)) {
      throw new ForbiddenException('Waiting on the owner');
    }
    const limit = await this.settings.get('staffApprovalLimitCents');
    const value = this.value(r);
    if (value > limit) {
      throw new ForbiddenException(
        `Over your limit of Rs ${(limit / 100).toLocaleString('en-LK')}. Send to owner.`,
      );
    }
    if (r.type === 'RETURN' && user.role === 'CASHIER') {
      const returnLimit = await this.settings.get('cashierReturnLimitCents');
      if (value > returnLimit) throw new ForbiddenException('Large refund. Send to office.');
    }
  }

  value(r: { lines: { quantity: number; rateCents: number }[]; payload?: unknown }) {
    const linesValue = r.lines.reduce((s, l) => s + l.quantity * l.rateCents, 0);
    if (linesValue > 0) return linesValue;
    const p = (r.payload ?? {}) as Record<string, unknown>;
    if (p.expectedCents) return Number(p.expectedCents);
    if (p.creditLimitCents) return Number(p.creditLimitCents);
    return 0;
  }

  /** Mark a request started (driver arrived, warehouse packing). */
  async start(id: string, user: AuthUser) {
    return this.prisma.request.update({
      where: { id, status: 'APPROVED' },
      data: {
        status: 'IN_PROGRESS',
        arrivedAt: new Date(),
        events: { create: { action: 'STARTED', byId: user.id } },
      },
      include: REQUEST_INCLUDE,
    });
  }

  /** Mark a request done (after its movements exist). */
  async finish(id: string, user: AuthUser, note?: string) {
    return this.prisma.request.update({
      where: { id },
      data: {
        status: 'DONE',
        stopStatus: undefined,
        completedAt: new Date(),
        events: { create: { action: 'COMPLETED', byId: user.id, note } },
      },
      include: REQUEST_INCLUDE,
    });
  }

  /** Tasks for a person: assigned to me, approved or in progress (spec §8.3, §9.9). */
  async myWork(user: AuthUser) {
    return this.prisma.request.findMany({
      where: {
        assignedToId: user.id,
        status: { in: ['APPROVED', 'IN_PROGRESS'] },
        type: { notIn: ['SALE_ORDER', 'PURCHASE'] },
      },
      include: REQUEST_INCLUDE,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Tasks the owner handed to staff, with status (spec §8.3). */
  async delegated(user: AuthUser) {
    return this.prisma.request.findMany({
      where: {
        createdById: user.id,
        assignedToId: { not: user.id },
        type: { in: ['CALL_TASK', 'COLLECTION'] },
        createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async reassign(id: string, assignedToId: string | null, user: AuthUser) {
    const r = await this.get(id);
    const party = r.toParty ?? r.fromParty;
    if (party?.contactTier === 'OWNER_ONLY' && user.role !== 'OWNER') {
      throw new ForbiddenException('Owner-only contact');
    }
    return this.prisma.request.update({
      where: { id },
      data: { assignedToId, events: { create: { action: 'REASSIGNED', byId: user.id } } },
      include: REQUEST_INCLUDE,
    });
  }

  /** Orders board (spec §9.3): sale orders for a day across all statuses. */
  async orders(day: Date, outletId?: string) {
    const rows = await this.prisma.request.findMany({
      where: {
        type: 'SALE_ORDER',
        dueAt: { gte: startOfDay(day), lte: endOfDay(day) },
        ...(outletId ? { fromPartyId: outletId } : {}),
      },
      include: {
        ...REQUEST_INCLUDE,
        movements: { where: { kind: 'MONEY' }, select: { amountCents: true, method: true } },
      },
      orderBy: [{ windowStart: 'asc' }, { createdAt: 'asc' }],
    });
    const balances = await this.views.balances();
    return rows.map((r) => {
      const valueCents = this.value(r);
      const paidCents = r.movements.reduce((s, m) => s + (m.amountCents ?? 0), 0);
      const customer = r.toParty;
      const creditWarning =
        customer && (customer.creditHold || (balances.get(customer.id) ?? 0) + valueCents > customer.creditLimitCents);
      return { ...r, valueCents, paidCents, creditWarning: Boolean(creditWarning) };
    });
  }

  /** A driver's stops for a day, in route order (spec §11.2). */
  async route(day: Date, driverId: string) {
    const stops = await this.prisma.request.findMany({
      where: {
        type: { in: ['SALE_ORDER', 'PURCHASE'] },
        assignedToId: driverId,
        status: { in: ['APPROVED', 'IN_PROGRESS', 'DONE'] },
        dueAt: { gte: startOfDay(day), lte: endOfDay(day) },
      },
      include: REQUEST_INCLUDE,
      orderBy: [{ routePosition: 'asc' }, { windowStart: 'asc' }],
    });
    const balances = await this.views.balances();
    const driver = await this.prisma.user.findUniqueOrThrow({ where: { id: driverId } });
    const cashCents = await this.views.driverCash(driver.partyId);
    return {
      driver: { id: driver.id, displayName: driver.displayName, partyId: driver.partyId },
      cashCents,
      stops: stops.map((s, i) => {
        const party = s.type === 'SALE_ORDER' ? s.toParty : s.fromParty;
        const todayCents = this.value(s);
        const oldBalanceCents = party ? Math.max(0, balances.get(party.id) ?? 0) : 0;
        return { ...s, position: i + 1, party, todayCents, oldBalanceCents };
      }),
    };
  }

  /** Route planner data (spec §9.4): unassigned approved orders + each driver's list. */
  async routePlan(day: Date) {
    const [orders, drivers] = await Promise.all([
      this.prisma.request.findMany({
        where: {
          type: { in: ['SALE_ORDER', 'PURCHASE'] },
          status: { in: ['APPROVED', 'IN_PROGRESS', 'DONE'] },
          dueAt: { gte: startOfDay(day), lte: endOfDay(day) },
        },
        include: REQUEST_INCLUDE,
        orderBy: [{ routePosition: 'asc' }, { windowStart: 'asc' }],
      }),
      this.prisma.user.findMany({ where: { role: 'DRIVER', active: true }, orderBy: { displayName: 'asc' } }),
    ]);
    const withValue = orders.map((o) => ({ ...o, valueCents: this.value(o) }));
    const collected = await this.prisma.movement.groupBy({
      by: ['toPartyId'],
      where: {
        kind: 'MONEY',
        toPartyId: { in: drivers.map((d) => d.partyId) },
        occurredAt: { gte: startOfDay(day), lte: endOfDay(day) },
      },
      _sum: { amountCents: true },
    });
    return {
      unassigned: withValue.filter((o) => !o.assignedToId),
      drivers: drivers.map((d) => {
        const stops = withValue.filter((o) => o.assignedToId === d.id);
        return {
          id: d.id,
          displayName: d.displayName,
          partyId: d.partyId,
          stops,
          done: stops.filter((s) => s.status === 'DONE').length,
          collectedCents: collected.find((c) => c.toPartyId === d.partyId)?._sum.amountCents ?? 0,
        };
      }),
    };
  }

  /** Assign (or move) stops to a driver with positions. Used by drag-and-drop and breakdown handling. */
  async assignStops(assignments: { requestId: string; driverId: string | null; position: number }[], user: AuthUser) {
    await this.prisma.$transaction(
      assignments.map((a) =>
        this.prisma.request.update({
          where: { id: a.requestId },
          data: {
            assignedToId: a.driverId,
            routePosition: a.position,
            events: { create: { action: 'REASSIGNED', byId: user.id, note: a.driverId ? undefined : 'Unassigned' } },
          },
        }),
      ),
    );
    return { ok: true };
  }

  /** Spec §11.5: a problem on a stop alerts the office; a breakdown lets them move the rest. */
  async stopProblem(id: string, problem: 'NOT_THERE' | 'REFUSED' | 'CANT_REACH' | 'BREAKDOWN', note: string | undefined, user: AuthUser) {
    const r = await this.get(id);
    if (r.assignedToId !== user.id && !user.canSuperviseDeliveries && user.role !== 'OFFICE' && user.role !== 'OWNER') {
      throw new ForbiddenException('Not your stop');
    }
    return this.prisma.request.update({
      where: { id },
      data: {
        stopStatus: 'PROBLEM',
        stopProblem: problem,
        stopNote: note,
        events: { create: { action: 'EDITED', byId: user.id, note: `Problem: ${problem}${note ? ` – ${note}` : ''}` } },
      },
      include: REQUEST_INCLUDE,
    });
  }

  async skipStop(id: string, user: AuthUser) {
    return this.prisma.request.update({
      where: { id },
      data: { stopStatus: 'SKIPPED', events: { create: { action: 'EDITED', byId: user.id, note: 'Skipped' } } },
      include: REQUEST_INCLUDE,
    });
  }

  /** Driver end of day: propose a CASH_HANDOVER for the cash in hand (spec §11.6). */
  async endOfDay(user: AuthUser) {
    const cash = await this.views.driverCash(user.partyId);
    const office = await this.prisma.party.findUniqueOrThrow({ where: { systemCode: 'CASH_OFFICE' } });
    const existing = await this.prisma.request.findFirst({
      where: { type: 'CASH_HANDOVER', fromPartyId: user.partyId, status: 'PROPOSED' },
    });
    if (existing) return existing;
    return this.create(
      {
        type: 'CASH_HANDOVER',
        fromPartyId: user.partyId,
        toPartyId: office.id,
        lines: [],
        reason: `${user.displayName} ended the route with Rs ${(cash / 100).toLocaleString('en-LK')} cash in hand`,
        payload: { expectedCents: cash },
      },
      { rule: 'CASH_HANDOVER' },
    );
  }

  /** Warehouse to-do (spec §12): approved purchases arriving, approved/in-progress transfers to send. */
  async warehouseTodo() {
    const wh = await this.prisma.party.findFirst({ where: { type: 'WAREHOUSE' } });
    if (!wh) return { receive: [], send: [] };
    const [receive, send] = await Promise.all([
      this.prisma.request.findMany({
        where: { type: 'PURCHASE', toPartyId: wh.id, status: { in: ['APPROVED', 'IN_PROGRESS'] }, assignedToId: null },
        include: REQUEST_INCLUDE,
        orderBy: [{ dueAt: 'asc' }],
      }),
      this.prisma.request.findMany({
        where: { type: 'TRANSFER', fromPartyId: wh.id, status: { in: ['APPROVED', 'IN_PROGRESS'] } },
        include: REQUEST_INCLUDE,
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    return { receive, send };
  }

  /** Transfers on their way to a holder (an outlet confirms them on its POS, spec §10). */
  pendingTransfers(toPartyId: string) {
    return this.prisma.request.findMany({
      where: { type: 'TRANSFER', toPartyId, status: { in: ['APPROVED', 'IN_PROGRESS'] } },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Owner approve list grouped by type (spec §8.2). */
  async ownerQueue(user: AuthUser) {
    const rows = await this.inbox(user, 'mine');
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const g = groups.get(r.type) ?? [];
      g.push(r);
      groups.set(r.type, g);
    }
    return [...groups.entries()].map(([type, items]) => ({ type, items }));
  }
}
