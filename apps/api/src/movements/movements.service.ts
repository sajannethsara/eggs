import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { MovementCreate, PosSale, StopComplete, SyncBatch } from 'shared';
import { MovementCreateSchema, PosSaleSchema, StopCompleteSchema } from 'shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { RatesService } from '../rates/rates.service.js';
import { ViewsService } from '../views/views.service.js';
import { RequestsService } from '../requests/requests.service.js';
import type { AuthUser } from '../auth/decorators.js';
import type { Prisma } from '../../generated/prisma/client.js';

const MOVEMENT_INCLUDE = {
  item: true,
  fromParty: { select: { id: true, name: true, type: true } },
  toParty: { select: { id: true, name: true, type: true } },
  by: { select: { id: true, displayName: true } },
} satisfies Prisma.MovementInclude;

@Injectable()
export class MovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RatesService,
    private readonly views: ViewsService,
    private readonly requests: RequestsService,
  ) {}

  list(opts: { partyId?: string; requestId?: string; kind?: 'GOODS' | 'MONEY'; limit?: number }) {
    return this.prisma.movement.findMany({
      where: {
        ...(opts.requestId ? { requestId: opts.requestId } : {}),
        ...(opts.kind ? { kind: opts.kind } : {}),
        ...(opts.partyId ? { OR: [{ fromPartyId: opts.partyId }, { toPartyId: opts.partyId }] } : {}),
      },
      include: MOVEMENT_INCLUDE,
      orderBy: { occurredAt: 'desc' },
      take: opts.limit ?? 100,
    });
  }

  /** Generic record. Idempotent on clientId so an offline device can retry safely. */
  async record(input: MovementCreate, user: AuthUser) {
    const existing = await this.prisma.movement.findUnique({ where: { clientId: input.clientId } });
    if (existing) return { ...existing, duplicate: true };

    if (input.kind === 'GOODS' && (!input.itemId || !input.quantity)) {
      throw new BadRequestException('Goods need an item and quantity');
    }
    if (input.kind === 'MONEY' && (!input.amountCents || !input.method)) {
      throw new BadRequestException('Money needs an amount and method');
    }

    let rateCents: number | undefined;
    let batchId: string | undefined;
    if (input.kind === 'GOODS' && input.itemId) {
      const [from, to] = await Promise.all([
        this.prisma.party.findUnique({ where: { id: input.fromPartyId } }),
        this.prisma.party.findUnique({ where: { id: input.toPartyId } }),
      ]);
      const direction = from?.type === 'SUPPLIER' ? 'BUY' : to?.type === 'CUSTOMER' ? 'SELL' : 'BUY';
      rateCents = await this.rates.current(input.itemId, direction, from?.type === 'SUPPLIER' ? from.id : to?.type === 'CUSTOMER' ? to.id : null);
      // Receiving from a supplier creates a batch so freshness can be tracked.
      if (from?.type === 'SUPPLIER') {
        const item = await this.prisma.item.findUnique({ where: { id: input.itemId } });
        if (item?.perishable) {
          const b = await this.prisma.batch.create({
            data: { itemId: input.itemId, supplierId: from.id, quantity: input.quantity!, receivedAt: input.occurredAt ?? new Date() },
          });
          batchId = b.id;
        }
      } else {
        batchId = await this.oldestBatchAt(input.fromPartyId, input.itemId);
      }
    }

    return this.prisma.movement.create({
      data: {
        requestId: input.requestId ?? null,
        kind: input.kind,
        fromPartyId: input.fromPartyId,
        toPartyId: input.toPartyId,
        itemId: input.itemId ?? null,
        quantity: input.quantity,
        batchId,
        rateCents,
        amountCents: input.amountCents,
        method: input.method,
        chequeNumber: input.chequeNumber,
        chequeBank: input.chequeBank,
        chequeDate: input.chequeDate,
        chequeStatus: input.method === 'CHEQUE' ? 'PENDING' : undefined,
        signerName: input.signerName,
        signatureDataUrl: input.signatureDataUrl,
        photoUrl: input.photoUrl,
        reason: input.reason,
        spoilageReason: input.spoilageReason,
        reversesId: input.reversesId,
        clientId: input.clientId,
        occurredAt: input.occurredAt ?? new Date(),
        byId: user.id,
        device: input.deviceName,
      },
      include: MOVEMENT_INCLUDE,
    });
  }

  /** Oldest batch of an item still held at a holder (FIFO, spec §12.2). */
  private async oldestBatchAt(holderId: string, itemId: string): Promise<string | undefined> {
    const rows = await this.prisma.movement.findMany({
      where: { kind: 'GOODS', itemId, batchId: { not: null }, OR: [{ toPartyId: holderId }, { fromPartyId: holderId }] },
      select: { batchId: true, toPartyId: true, quantity: true, batch: { select: { receivedAt: true } } },
    });
    const rem = new Map<string, { qty: number; at: Date }>();
    for (const r of rows) {
      if (!r.batchId) continue;
      const e = rem.get(r.batchId) ?? { qty: 0, at: r.batch?.receivedAt ?? new Date() };
      e.qty += r.toPartyId === holderId ? (r.quantity ?? 0) : -(r.quantity ?? 0);
      rem.set(r.batchId, e);
    }
    const open = [...rem.entries()].filter(([, v]) => v.qty > 0).sort((a, b) => a[1].at.getTime() - b[1].at.getTime());
    return open[0]?.[0];
  }

  /** POS walk-in sale (spec §10): one call creates the DONE request, goods and money movements. */
  async posSale(input: PosSale, user: AuthUser) {
    const dup = await this.prisma.request.findFirst({ where: { movements: { some: { clientId: input.clientId } } } });
    if (dup) return { requestId: dup.id, duplicate: true, totalCents: this.requests.value(await this.requests.get(dup.id)), changeCents: 0 };

    if (user.role === 'CASHIER' && user.outletId && user.outletId !== input.outletId) {
      throw new ForbiddenException('Not your outlet');
    }
    const walkIn = await this.prisma.party.findUniqueOrThrow({ where: { systemCode: 'WALK_IN' } });
    const customer = input.customerId ? await this.prisma.party.findUnique({ where: { id: input.customerId } }) : null;
    const buyer = customer ?? walkIn;

    const lines = await Promise.all(
      input.lines.map(async (l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        rateCents: l.rateCents ?? (await this.rates.current(l.itemId, 'SELL', customer?.id ?? null)),
      })),
    );
    const totalCents = lines.reduce((s, l) => s + l.quantity * l.rateCents, 0);

    if (input.method === 'CREDIT') {
      if (!customer) throw new BadRequestException('Credit needs a customer');
      const balances = await this.views.balances();
      const balance = balances.get(customer.id) ?? 0;
      if (customer.creditHold || balance + totalCents > customer.creditLimitCents) {
        throw new ConflictException({
          code: 'CREDIT_LIMIT',
          message: customer.creditHold ? 'Customer is on credit hold' : 'This sale would go over the credit limit',
          balanceCents: balance,
          creditLimitCents: customer.creditLimitCents,
          totalCents,
        });
      }
    }

    const occurredAt = input.occurredAt ?? new Date();
    const request = await this.prisma.request.create({
      data: {
        type: 'SALE_ORDER',
        status: 'DONE',
        fromPartyId: input.outletId,
        toPartyId: buyer.id,
        createdById: user.id,
        approvedById: user.id,
        approvedAt: occurredAt,
        completedAt: occurredAt,
        dueAt: occurredAt,
        reason: 'Walk-in sale',
        lines: { create: lines },
        events: { create: [{ action: 'CREATED', byId: user.id }, { action: 'COMPLETED', byId: user.id }] },
      },
    });

    const goods: Prisma.MovementCreateManyInput[] = [];
    for (const [i, l] of lines.entries()) {
      goods.push({
        requestId: request.id,
        kind: 'GOODS',
        fromPartyId: input.outletId,
        toPartyId: buyer.id,
        itemId: l.itemId,
        quantity: l.quantity,
        rateCents: l.rateCents,
        batchId: await this.oldestBatchAt(input.outletId, l.itemId),
        clientId: i === 0 ? input.clientId : `${input.clientId}:${i}`,
        occurredAt,
        byId: user.id,
      });
    }
    await this.prisma.movement.createMany({ data: goods });

    let changeCents = 0;
    if (input.method === 'CASH' || input.method === 'CHEQUE' || input.method === 'BANK_TRANSFER') {
      const received = input.method === 'CASH' ? (input.receivedCents ?? totalCents) : totalCents;
      changeCents = Math.max(0, received - totalCents);
      await this.prisma.movement.create({
        data: {
          requestId: request.id,
          kind: 'MONEY',
          fromPartyId: buyer.id,
          toPartyId: input.outletId,
          amountCents: totalCents,
          method: input.method,
          chequeNumber: input.chequeNumber,
          chequeBank: input.chequeBank,
          chequeDate: input.chequeDate,
          chequeStatus: input.method === 'CHEQUE' ? 'PENDING' : undefined,
          clientId: `${input.clientId}:money`,
          occurredAt,
          byId: user.id,
        },
      });
    }
    return { requestId: request.id, totalCents, changeCents, duplicate: false };
  }

  /** Driver completes a delivery or pickup (spec §11.3, §11.4). */
  async completeStop(requestId: string, input: StopComplete, user: AuthUser) {
    const dupe = await this.prisma.movement.findUnique({ where: { clientId: input.clientId } });
    if (dupe) return { ...(await this.requests.get(requestId)), duplicate: true };

    const r = await this.requests.get(requestId);
    if (r.status === 'DONE') throw new ConflictException('Already done');
    if (r.assignedToId !== user.id && !user.canSuperviseDeliveries && user.role !== 'OFFICE' && user.role !== 'OWNER') {
      throw new ForbiddenException('Not your stop');
    }
    const driver = await this.prisma.user.findUniqueOrThrow({ where: { id: r.assignedToId ?? user.id } });
    const isDelivery = r.type === 'SALE_ORDER';
    const party = isDelivery ? r.toParty : r.fromParty;
    if (!party) throw new BadRequestException('Stop has no customer or supplier');

    const occurredAt = input.occurredAt ?? new Date();
    const lines = input.lines.map((l) => ({
      itemId: l.itemId,
      quantity: l.quantity,
      rateCents: l.rateCents ?? r.lines.find((x) => x.itemId === l.itemId)?.rateCents ?? 0,
    }));
    const totalCents = lines.reduce((s, l) => s + l.quantity * l.rateCents, 0);

    // Credit checks
    if (isDelivery && (input.method === 'CREDIT' || input.method === 'PART')) {
      const balances = await this.views.balances();
      const balance = balances.get(party.id) ?? 0;
      const creditPart = input.method === 'CREDIT' ? totalCents : Math.max(0, totalCents - (input.receivedCents ?? 0));
      if (party.creditHold) throw new ConflictException({ code: 'CREDIT_HOLD', message: 'Customer is on credit hold. Call office.' });
      if (balance + creditPart > party.creditLimitCents) {
        throw new ConflictException({
          code: 'CREDIT_LIMIT',
          message: 'Over the credit limit. Call office.',
          balanceCents: balance,
          creditLimitCents: party.creditLimitCents,
        });
      }
    }

    // Short or damaged lines become a note on the request so the office sees the difference.
    const diffs = r.lines
      .map((orig) => {
        const got = lines.find((l) => l.itemId === orig.itemId);
        return got && got.quantity !== orig.quantity ? `${orig.item.name}: ${orig.quantity} → ${got.quantity}` : null;
      })
      .filter(Boolean);

    const goods: Prisma.MovementCreateManyInput[] = [];
    for (const [i, l] of lines.entries()) {
      goods.push({
        requestId: r.id,
        kind: 'GOODS',
        fromPartyId: isDelivery ? driver.partyId : party.id,
        toPartyId: isDelivery ? party.id : driver.partyId,
        itemId: l.itemId,
        quantity: l.quantity,
        rateCents: l.rateCents,
        batchId: isDelivery ? await this.oldestBatchAt(driver.partyId, l.itemId) : undefined,
        signerName: input.signerName,
        signatureDataUrl: i === 0 ? input.signatureDataUrl : undefined,
        clientId: i === 0 ? input.clientId : `${input.clientId}:${i}`,
        occurredAt,
        byId: user.id,
        device: 'driver',
      });
    }
    // A supplier pickup of a perishable creates a batch.
    if (!isDelivery) {
      for (const g of goods) {
        const item = await this.prisma.item.findUnique({ where: { id: g.itemId! } });
        if (item?.perishable) {
          const b = await this.prisma.batch.create({ data: { itemId: g.itemId!, supplierId: party.id, quantity: g.quantity!, receivedAt: occurredAt } });
          g.batchId = b.id;
        }
      }
    }
    await this.prisma.movement.createMany({ data: goods });

    const money: Prisma.MovementCreateManyInput[] = [];
    const payer = isDelivery ? party.id : driver.partyId;
    const payee = isDelivery ? driver.partyId : party.id;
    if (input.method === 'CASH' || input.method === 'PART') {
      const amt = input.method === 'CASH' ? (input.receivedCents ?? totalCents) : (input.receivedCents ?? 0);
      if (amt > 0) money.push({ requestId: r.id, kind: 'MONEY', fromPartyId: payer, toPartyId: payee, amountCents: amt, method: 'CASH', clientId: `${input.clientId}:cash`, occurredAt, byId: user.id });
    } else if (input.method === 'CHEQUE') {
      money.push({
        requestId: r.id, kind: 'MONEY', fromPartyId: payer, toPartyId: payee, amountCents: totalCents, method: 'CHEQUE',
        chequeNumber: input.chequeNumber, chequeBank: input.chequeBank, chequeDate: input.chequeDate, chequeStatus: 'PENDING',
        clientId: `${input.clientId}:cheque`, occurredAt, byId: user.id,
      });
    } else if (input.method === 'BANK_TRANSFER') {
      money.push({ requestId: r.id, kind: 'MONEY', fromPartyId: payer, toPartyId: payee, amountCents: totalCents, method: 'BANK_TRANSFER', clientId: `${input.clientId}:bank`, occurredAt, byId: user.id });
    }
    if (money.length) await this.prisma.movement.createMany({ data: money });

    await this.prisma.request.update({
      where: { id: r.id },
      data: {
        status: 'DONE',
        stopStatus: 'DONE',
        completedAt: occurredAt,
        stopNote: diffs.length ? `Changed: ${diffs.join('; ')}` : r.stopNote,
        events: { create: { action: 'COMPLETED', byId: user.id, note: `${input.method}${diffs.length ? ` · ${diffs.join('; ')}` : ''}` } },
      },
    });
    return { ...(await this.requests.get(r.id)), duplicate: false, totalCents };
  }

  /** Warehouse / outlet receive against an approved request (spec §12.1, §10 Receive transfer). */
  async receive(requestId: string, lines: { itemId: string; quantity: number }[], user: AuthUser, clientId: string) {
    const dupe = await this.prisma.movement.findUnique({ where: { clientId } });
    if (dupe) return { ...(await this.requests.get(requestId)), duplicate: true };
    const r = await this.requests.get(requestId);
    if (r.status === 'DONE') throw new ConflictException('Already received');
    if (!r.fromPartyId || !r.toPartyId) throw new BadRequestException('Request has no from/to');

    // A transfer that was handed to a driver arrives from the driver, not the warehouse.
    const lastHolder = r.movements.find((m) => m.kind === 'GOODS')?.toPartyId;
    const fromId = r.type === 'TRANSFER' && lastHolder && lastHolder !== r.toPartyId ? lastHolder : r.fromPartyId;
    const from = await this.prisma.party.findUniqueOrThrow({ where: { id: fromId } });

    const data: Prisma.MovementCreateManyInput[] = [];
    for (const [i, l] of lines.entries()) {
      const orig = r.lines.find((x) => x.itemId === l.itemId);
      let batchId: string | undefined;
      if (from.type === 'SUPPLIER') {
        const item = await this.prisma.item.findUnique({ where: { id: l.itemId } });
        if (item?.perishable) {
          batchId = (await this.prisma.batch.create({ data: { itemId: l.itemId, supplierId: from.id, quantity: l.quantity } })).id;
        }
      } else {
        batchId = await this.oldestBatchAt(from.id, l.itemId);
      }
      data.push({
        requestId: r.id, kind: 'GOODS', fromPartyId: from.id, toPartyId: r.toPartyId, itemId: l.itemId, quantity: l.quantity,
        rateCents: orig?.rateCents ?? (await this.rates.current(l.itemId, from.type === 'SUPPLIER' ? 'BUY' : 'SELL', from.type === 'SUPPLIER' ? from.id : null)),
        batchId, clientId: i === 0 ? clientId : `${clientId}:${i}`, byId: user.id,
      });
    }
    await this.prisma.movement.createMany({ data });
    const diffs = r.lines
      .map((orig) => {
        const got = lines.find((l) => l.itemId === orig.itemId);
        const q = got?.quantity ?? 0;
        return q !== orig.quantity ? `${orig.item.name}: expected ${orig.quantity}, got ${q}` : null;
      })
      .filter(Boolean);
    await this.requests.finish(r.id, user, diffs.length ? `Received with differences: ${diffs.join('; ')}` : 'Received');
    return { ...(await this.requests.get(r.id)), duplicate: false };
  }

  /** Warehouse sends an approved transfer: warehouse → outlet (or → driver when handed over). */
  async send(requestId: string, toDriverId: string | null, user: AuthUser, clientId: string) {
    const dupe = await this.prisma.movement.findUnique({ where: { clientId } });
    if (dupe) return { ...(await this.requests.get(requestId)), duplicate: true };
    const r = await this.requests.get(requestId);
    if (r.type !== 'TRANSFER' || !r.fromPartyId || !r.toPartyId) throw new BadRequestException('Not a transfer');
    if (r.status !== 'APPROVED') throw new ConflictException(`Transfer is ${r.status.toLowerCase()}`);
    const toId = toDriverId ? (await this.prisma.user.findUniqueOrThrow({ where: { id: toDriverId } })).partyId : r.toPartyId;
    const data: Prisma.MovementCreateManyInput[] = [];
    for (const [i, l] of r.lines.entries()) {
      data.push({
        requestId: r.id, kind: 'GOODS', fromPartyId: r.fromPartyId, toPartyId: toId, itemId: l.itemId, quantity: l.quantity,
        rateCents: l.rateCents, batchId: await this.oldestBatchAt(r.fromPartyId, l.itemId),
        clientId: i === 0 ? clientId : `${clientId}:${i}`, byId: user.id,
      });
    }
    await this.prisma.movement.createMany({ data });
    await this.prisma.request.update({
      where: { id: r.id },
      data: { status: 'IN_PROGRESS', events: { create: { action: 'STARTED', byId: user.id, note: toDriverId ? 'Handed to driver' : 'Sent' } } },
    });
    return { ...(await this.requests.get(r.id)), duplicate: false };
  }

  /** Driver load check (spec §11.1): warehouse → driver for the day's approved stops. */
  async loadVehicle(lines: { itemId: string; quantity: number }[], user: AuthUser, clientId: string) {
    const dupe = await this.prisma.movement.findUnique({ where: { clientId } });
    if (dupe) return { duplicate: true };
    const wh = await this.prisma.party.findFirstOrThrow({ where: { type: 'WAREHOUSE' } });
    const data: Prisma.MovementCreateManyInput[] = [];
    for (const [i, l] of lines.entries()) {
      if (l.quantity <= 0) continue;
      data.push({
        kind: 'GOODS', fromPartyId: wh.id, toPartyId: user.partyId, itemId: l.itemId, quantity: l.quantity,
        rateCents: await this.rates.current(l.itemId, 'SELL', null), batchId: await this.oldestBatchAt(wh.id, l.itemId),
        clientId: i === 0 ? clientId : `${clientId}:${i}`, byId: user.id, reason: 'Load check',
      });
    }
    if (data.length) await this.prisma.movement.createMany({ data });
    return { duplicate: false, count: data.length };
  }

  /** Driver return check (spec §11.6): leftover goods driver → warehouse. */
  async unloadVehicle(user: AuthUser, clientId: string) {
    const dupe = await this.prisma.movement.findUnique({ where: { clientId } });
    if (dupe) return { duplicate: true };
    const wh = await this.prisma.party.findFirstOrThrow({ where: { type: 'WAREHOUSE' } });
    const stock = (await this.views.stock()).filter((c) => c.holderId === user.partyId && c.quantity > 0);
    const data: Prisma.MovementCreateManyInput[] = [];
    for (const [i, c] of stock.entries()) {
      data.push({
        kind: 'GOODS', fromPartyId: user.partyId, toPartyId: wh.id, itemId: c.itemId, quantity: c.quantity,
        rateCents: await this.rates.current(c.itemId, 'SELL', null), batchId: await this.oldestBatchAt(user.partyId, c.itemId),
        clientId: i === 0 ? clientId : `${clientId}:${i}`, byId: user.id, reason: 'Return check',
      });
    }
    if (data.length) await this.prisma.movement.createMany({ data });
    return { duplicate: false, count: data.length };
  }

  /** Reverse a movement (spec §7 "Mistakes are safe"): a correction is a reversal with a reason. */
  async reverse(id: string, reason: string, user: AuthUser) {
    const m = await this.prisma.movement.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Movement not found');
    if (m.reversesId) throw new ConflictException('A reversal cannot be reversed; record a new movement');
    const already = await this.prisma.movement.findUnique({ where: { reversesId: id } });
    if (already) throw new ConflictException('Already reversed');
    return this.prisma.movement.create({
      data: {
        requestId: m.requestId,
        kind: m.kind,
        fromPartyId: m.toPartyId,
        toPartyId: m.fromPartyId,
        itemId: m.itemId,
        quantity: m.quantity,
        batchId: m.batchId,
        rateCents: m.rateCents,
        amountCents: m.amountCents,
        method: m.method,
        reason: `Reversal: ${reason}`,
        reversesId: m.id,
        clientId: randomUUID(),
        byId: user.id,
      },
      include: MOVEMENT_INCLUDE,
    });
  }

  async setChequeStatus(id: string, status: 'DEPOSITED' | 'CLEARED' | 'BOUNCED', user: AuthUser) {
    const m = await this.prisma.movement.findUnique({ where: { id } });
    if (!m || m.method !== 'CHEQUE') throw new NotFoundException('Cheque not found');
    const updated = await this.prisma.movement.update({ where: { id }, data: { chequeStatus: status } });
    if (status === 'CLEARED') {
      const bank = await this.prisma.party.findUniqueOrThrow({ where: { systemCode: 'BANK' } });
      // Holder → Bank, so the cheque leaves the holder's hands in the books.
      await this.prisma.movement.create({
        data: { kind: 'MONEY', fromPartyId: m.toPartyId, toPartyId: bank.id, amountCents: m.amountCents, method: 'BANK_TRANSFER', reason: `Cheque ${m.chequeNumber ?? ''} cleared`, clientId: randomUUID(), byId: user.id },
      });
    }
    return updated;
  }

  /** Offline outbox sync (spec §15): each op is applied in order; results are per clientId. */
  async sync(batch: SyncBatch, user: AuthUser) {
    const results: { clientId: string; ok: boolean; error?: string; result?: unknown }[] = [];
    for (const op of batch.ops) {
      try {
        let result: unknown;
        if (op.kind === 'POS_SALE') result = await this.posSale(PosSaleSchema.parse(op.body), user);
        else if (op.kind === 'STOP_COMPLETE') {
          const body = op.body as { requestId: string } & StopComplete;
          result = await this.completeStop(body.requestId, StopCompleteSchema.parse(body), user);
        } else result = await this.record(MovementCreateSchema.parse(op.body), user);
        results.push({ clientId: op.clientId, ok: true, result });
      } catch (e) {
        const err = e as { message?: string; response?: { message?: string } };
        results.push({ clientId: op.clientId, ok: false, error: err.response?.message ?? err.message ?? 'Failed' });
      }
    }
    return { results };
  }
}
