import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RatesService } from '../rates/rates.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RatesService,
  ) {}

  /** Items with their current standard buy and sell prices, for POS tiles and the rate list. */
  async listWithRates(partyId?: string) {
    const items = await this.prisma.item.findMany({
      where: { active: true },
      orderBy: [{ posOrder: 'asc' }, { name: 'asc' }],
      include: { reorderLevels: true },
    });
    const current = await this.rates.currentAll(partyId);
    return items.map((it) => ({
      ...it,
      sellCents: current.get(`${it.id}:SELL`) ?? null,
      buyCents: current.get(`${it.id}:BUY`) ?? null,
    }));
  }

  create(data: Prisma.ItemCreateInput) {
    return this.prisma.item.create({ data });
  }

  patch(id: string, data: Prisma.ItemUpdateInput) {
    return this.prisma.item.update({ where: { id }, data });
  }

  setReorderLevel(itemId: string, holderId: string, quantity: number) {
    return this.prisma.reorderLevel.upsert({
      where: { itemId_holderId: { itemId, holderId } },
      create: { itemId, holderId, quantity },
      update: { quantity },
    });
  }
}
