import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Global thresholds office staff can change (spec §5). Values are read fresh each call; they are tiny. */
export const DEFAULT_SETTINGS = {
  priceChangeThresholdPercent: 10,
  staffDiscountLimitPercent: 5,
  staffApprovalLimitCents: 50_000 * 100,
  cashierReturnLimitCents: 2_000 * 100,
  handoverDiffThresholdCents: 500 * 100,
  quietBigCustomerDays: 10,
  freshnessPercent: 75,
  chequeDueDays: 2,
  countDiffPercent: 2,
  lateDeliveryMinutes: 30,
  targetMarginPercent: 15,
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K): Promise<(typeof DEFAULT_SETTINGS)[K]> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return (row?.value as (typeof DEFAULT_SETTINGS)[K] | undefined) ?? DEFAULT_SETTINGS[key];
  }

  async all() {
    const rows = await this.prisma.setting.findMany();
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) out[r.key] = r.value;
    return out as typeof DEFAULT_SETTINGS;
  }

  async set(key: SettingKey, value: number) {
    await this.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    return this.all();
  }
}
