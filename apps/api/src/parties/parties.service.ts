import { Injectable, NotFoundException } from '@nestjs/common';
import type { PartyCreate, PartyType } from 'shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { ViewsService } from '../views/views.service.js';
import { daysBetween } from '../common/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type Health = {
  orderRhythm: 'ok' | 'slipped' | 'na';
  payment: 'ok' | 'slipped' | 'na';
  complaints: 'ok' | 'slipped' | 'na';
  lastContact: 'ok' | 'slipped' | 'na';
  colour: 'green' | 'amber' | 'red';
  daysSinceOrder: number | null;
  daysSinceContact: number | null;
  returns90d: number;
  overdueCents: number;
};

@Injectable()
export class PartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: ViewsService,
  ) {}

  async list(opts: {
    type?: PartyType;
    q?: string;
    tier?: string;
    segment?: string;
    overdue?: boolean;
    red?: boolean;
    limit?: number;
  }) {
    const where: Prisma.PartyWhereInput = {};
    if (opts.type) where.type = opts.type;
    if (opts.tier) where.contactTier = opts.tier as Prisma.PartyWhereInput['contactTier'];
    if (opts.segment) where.segment = opts.segment as Prisma.PartyWhereInput['segment'];
    if (opts.q) {
      where.OR = [
        { name: { contains: opts.q, mode: 'insensitive' } },
        { phone: { contains: opts.q } },
        { whatsapp: { contains: opts.q } },
      ];
    }
    const parties = await this.prisma.party.findMany({
      where,
      orderBy: { name: 'asc' },
      take: opts.limit ?? 200,
    });
    const balances = await this.views.balances();
    const rows = await Promise.all(
      parties.map(async (p) => {
        const balanceCents = balances.get(p.id) ?? 0;
        const health =
          p.type === 'CUSTOMER' || p.type === 'SUPPLIER' ? await this.health(p.id, balanceCents) : null;
        return { ...p, balanceCents, health };
      }),
    );
    let out = rows;
    if (opts.overdue) out = out.filter((r) => (r.health?.overdueCents ?? 0) > 0);
    if (opts.red) out = out.filter((r) => r.health?.colour === 'red');
    return out;
  }

  async get(id: string) {
    const party = await this.prisma.party.findUnique({
      where: { id },
      include: { user: { select: { id: true, role: true, displayName: true } } },
    });
    if (!party) throw new NotFoundException('Party not found');
    const balances = await this.views.balances();
    const balanceCents = balances.get(id) ?? 0;
    const [notes, requests, movements] = await Promise.all([
      this.prisma.note.findMany({
        where: { partyId: id },
        include: { createdBy: { select: { displayName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.request.findMany({
        where: { OR: [{ fromPartyId: id }, { toPartyId: id }] },
        include: { lines: { include: { item: true } }, createdBy: { select: { displayName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.movement.findMany({
        where: { OR: [{ fromPartyId: id }, { toPartyId: id }] },
        include: { item: true, by: { select: { displayName: true } } },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      }),
    ]);
    const timeline = [
      ...notes.map((n) => ({ kind: 'note' as const, at: n.createdAt, data: n })),
      ...requests.map((r) => ({ kind: 'request' as const, at: r.createdAt, data: r })),
      ...movements.map((m) => ({ kind: 'movement' as const, at: m.occurredAt, data: m })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());
    const health =
      party.type === 'CUSTOMER' || party.type === 'SUPPLIER' ? await this.health(id, balanceCents) : null;
    return { ...party, balanceCents, health, timeline: timeline.slice(0, 80) };
  }

  create(input: PartyCreate) {
    return this.prisma.party.create({ data: input });
  }

  async patch(id: string, input: Prisma.PartyUpdateInput) {
    await this.get(id);
    return this.prisma.party.update({ where: { id }, data: input });
  }

  /** Four health signals (spec §6). Amber when one slips, red when two or more. */
  async health(partyId: string, balanceCents: number): Promise<Health> {
    const now = new Date();
    const party = await this.prisma.party.findUniqueOrThrow({ where: { id: partyId } });
    const [lastOrder, lastNote, returns90d, oldestUnpaid] = await Promise.all([
      this.prisma.request.findFirst({
        where: {
          type: { in: ['SALE_ORDER', 'PURCHASE'] },
          status: { not: 'REJECTED' },
          OR: [{ toPartyId: partyId }, { fromPartyId: partyId }],
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.note.findFirst({
        where: { partyId, channel: { in: ['CALL', 'WHATSAPP', 'VISIT'] } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.request.count({
        where: {
          type: 'RETURN',
          OR: [{ toPartyId: partyId }, { fromPartyId: partyId }],
          createdAt: { gte: new Date(now.getTime() - 90 * 86_400_000) },
        },
      }),
      balanceCents > 0
        ? this.prisma.movement.findFirst({
            where: { kind: 'GOODS', toPartyId: partyId },
            orderBy: { occurredAt: 'asc' },
            select: { occurredAt: true },
          })
        : null,
    ]);

    const usualGap = party.usualDays.length > 0 ? Math.ceil(7 / party.usualDays.length) : 14;
    const daysSinceOrder = lastOrder ? daysBetween(lastOrder.createdAt, now) : null;
    const daysSinceContact = lastNote ? daysBetween(lastNote.createdAt, now) : null;
    const overdue =
      balanceCents > 0 &&
      oldestUnpaid !== null &&
      party.creditDays > 0 &&
      daysBetween(oldestUnpaid.occurredAt, now) > party.creditDays;

    const orderRhythm: Health['orderRhythm'] =
      daysSinceOrder === null ? 'na' : daysSinceOrder > usualGap * 1.5 ? 'slipped' : 'ok';
    const payment: Health['payment'] = balanceCents <= 0 ? 'na' : overdue ? 'slipped' : 'ok';
    const complaints: Health['complaints'] = returns90d >= 2 ? 'slipped' : 'ok';
    const lastContact: Health['lastContact'] =
      daysSinceContact === null ? 'na' : daysSinceContact > 30 ? 'slipped' : 'ok';
    const slipped = [orderRhythm, payment, complaints, lastContact].filter((s) => s === 'slipped').length;

    return {
      orderRhythm,
      payment,
      complaints,
      lastContact,
      colour: slipped >= 2 ? 'red' : slipped === 1 ? 'amber' : 'green',
      daysSinceOrder,
      daysSinceContact,
      returns90d,
      overdueCents: overdue ? balanceCents : 0,
    };
  }
}
