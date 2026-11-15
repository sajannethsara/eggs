import { Injectable } from '@nestjs/common';
import type { RateCreate, RateDirection } from 'shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../common/settings.service.js';
import type { AuthUser } from '../auth/decorators.js';

@Injectable()
export class RatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** The price in force for an item at a moment: party-specific first, then standard. */
  async current(itemId: string, direction: RateDirection, partyId?: string | null, at: Date = new Date()) {
    if (partyId) {
      const specific = await this.prisma.rate.findFirst({
        where: { itemId, direction, partyId, validFrom: { lte: at } },
        orderBy: { validFrom: 'desc' },
      });
      if (specific) return specific.priceCents;
    }
    const standard = await this.prisma.rate.findFirst({
      where: { itemId, direction, partyId: null, validFrom: { lte: at } },
      orderBy: { validFrom: 'desc' },
    });
    return standard?.priceCents ?? 0;
  }

  /** Map "itemId:DIRECTION" → cents for all items, in one query. */
  async currentAll(partyId?: string | null, at: Date = new Date()) {
    const rates = await this.prisma.rate.findMany({
      where: { validFrom: { lte: at }, OR: [{ partyId: null }, ...(partyId ? [{ partyId }] : [])] },
      orderBy: [{ validFrom: 'desc' }],
    });
    const out = new Map<string, number>();
    const specific = new Set<string>();
    for (const r of rates) {
      const key = `${r.itemId}:${r.direction}`;
      if (r.partyId) {
        if (!specific.has(key)) {
          specific.add(key);
          out.set(key, r.priceCents);
        }
      } else if (!out.has(key)) {
        out.set(key, r.priceCents);
      }
    }
    return out;
  }

  /** Price list: one row per item with current buy, sell, margin and history. */
  async priceList() {
    const items = await this.prisma.item.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
    const history = await this.prisma.rate.findMany({
      where: { partyId: null },
      orderBy: { validFrom: 'desc' },
      include: { enteredBy: { select: { displayName: true } }, approvedBy: { select: { displayName: true } } },
    });
    const now = new Date();
    return items.map((it) => {
      const rows = history.filter((r) => r.itemId === it.id);
      const buy = rows.find((r) => r.direction === 'BUY' && r.validFrom <= now)?.priceCents ?? 0;
      const sell = rows.find((r) => r.direction === 'SELL' && r.validFrom <= now)?.priceCents ?? 0;
      const marginPercent = buy > 0 ? Math.round(((sell - buy) / buy) * 1000) / 10 : null;
      return { item: it, buyCents: buy, sellCents: sell, marginPercent, history: rows.slice(0, 20) };
    });
  }

  /**
   * Office staff may change prices directly (logged). A change bigger than the threshold, or any
   * change by a non-owner to a SELL price above the threshold, becomes a PRICE_CHANGE Request instead.
   * Returns { rate } or { request }.
   */
  async propose(input: RateCreate, user: AuthUser) {
    const currentCents = await this.current(input.itemId, input.direction, input.partyId ?? null, input.validFrom);
    const threshold = await this.settings.get('priceChangeThresholdPercent');
    const changePercent = currentCents > 0 ? Math.abs((input.priceCents - currentCents) / currentCents) * 100 : 0;
    const needsOwner = user.role !== 'OWNER' && changePercent > threshold;

    if (needsOwner) {
      const item = await this.prisma.item.findUniqueOrThrow({ where: { id: input.itemId } });
      const request = await this.prisma.request.create({
        data: {
          type: 'PRICE_CHANGE',
          status: 'PROPOSED',
          toPartyId: input.partyId ?? null,
          createdById: user.id,
          reason: `${item.name} ${input.direction === 'SELL' ? 'sell' : 'buy'} price Rs ${(currentCents / 100).toFixed(2)} → Rs ${(input.priceCents / 100).toFixed(2)} (${changePercent.toFixed(0)}%). ${input.sourceNote ?? ''}`.trim(),
          payload: {
            itemId: input.itemId,
            partyId: input.partyId ?? null,
            direction: input.direction,
            priceCents: input.priceCents,
            previousCents: currentCents,
            validFrom: input.validFrom.toISOString(),
            sourceNote: input.sourceNote ?? null,
          },
          events: { create: { action: 'CREATED', byId: user.id } },
        },
      });
      return { request, rate: null };
    }

    const rate = await this.prisma.rate.create({
      data: {
        itemId: input.itemId,
        partyId: input.partyId ?? null,
        direction: input.direction,
        priceCents: input.priceCents,
        validFrom: input.validFrom,
        sourceNote: input.sourceNote,
        enteredById: user.id,
        approvedById: user.role === 'OWNER' ? user.id : null,
      },
    });
    return { rate, request: null };
  }

  /** Called by the review gate when a PRICE_CHANGE request is approved. */
  async applyApproved(payload: Record<string, unknown>, approverId: string, enteredById?: string | null) {
    return this.prisma.rate.create({
      data: {
        itemId: String(payload.itemId),
        partyId: (payload.partyId as string | null) ?? null,
        direction: payload.direction as RateDirection,
        priceCents: Number(payload.priceCents),
        validFrom: new Date(String(payload.validFrom ?? new Date().toISOString())),
        sourceNote: (payload.sourceNote as string | null) ?? null,
        enteredById: enteredById ?? approverId,
        approvedById: approverId,
      },
    });
  }
}
