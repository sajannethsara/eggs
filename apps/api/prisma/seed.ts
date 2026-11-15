/* Realistic demo data for AK Enterprises. Run: pnpm --filter api seed
 * Logins (role → username / secret):
 *   OWNER      kusal / owner123        OFFICE  nimali / office123, ruwan / office123
 *   CASHIER    cashier1..5 / 1234      DRIVER  saman / 1234, kamal / 1234
 *   WAREHOUSE  priyantha / 1234
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const day = (offset: number, h = 9, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return d;
};
const rs = (rupees: number) => Math.round(rupees * 100);
const pick = <T>(arr: T[], i: number) => arr[i % arr.length];

async function reset() {
  await prisma.$transaction([
    prisma.requestEvent.deleteMany(),
    prisma.movement.deleteMany(),
    prisma.requestLine.deleteMany(),
    prisma.request.deleteMany(),
    prisma.note.deleteMany(),
    prisma.batch.deleteMany(),
    prisma.rate.deleteMany(),
    prisma.reorderLevel.deleteMany(),
    prisma.item.deleteMany(),
    prisma.user.deleteMany(),
    prisma.party.deleteMany(),
    prisma.rule.deleteMany(),
    prisma.setting.deleteMany(),
  ]);
}

async function main() {
  console.log('Resetting…');
  await reset();

  // ---- System parties
  const [loss, bank, cashOffice, walkIn] = await Promise.all([
    prisma.party.create({ data: { type: 'SYSTEM', name: 'Loss', systemCode: 'LOSS' } }),
    prisma.party.create({ data: { type: 'SYSTEM', name: 'Bank', systemCode: 'BANK' } }),
    prisma.party.create({ data: { type: 'SYSTEM', name: 'Cash office', systemCode: 'CASH_OFFICE' } }),
    prisma.party.create({ data: { type: 'SYSTEM', name: 'Walk-in customer', systemCode: 'WALK_IN' } }),
  ]);
  void loss; void bank; void cashOffice;

  // ---- Holders
  const warehouse = await prisma.party.create({ data: { type: 'WAREHOUSE', name: 'Kelaniya warehouse', address: 'Biyagama Rd, Kelaniya' } });
  const outletNames = ['Kelaniya main', 'Kiribathgoda', 'Kadawatha', 'Wattala', 'Peliyagoda'];
  const outlets = [];
  for (const [i, name] of outletNames.entries()) {
    outlets.push(await prisma.party.create({ data: { type: 'OUTLET', name: `Outlet ${i + 1} · ${name}`, address: `${name} junction` } }));
  }

  // ---- Items
  const items = {
    eggs: await prisma.item.create({ data: { name: 'Eggs', unit: 'egg', packSize: 30, packName: 'tray', category: 'eggs', holdingDays: 2, perishable: true, color: 'yellow', posOrder: 1 } }),
    coconut: await prisma.item.create({ data: { name: 'Coconuts', unit: 'nut', packSize: 1, category: 'produce', holdingDays: 14, perishable: true, color: 'brown', posOrder: 2 } }),
    oil: await prisma.item.create({ data: { name: 'Coconut oil 1L', unit: 'bottle', packSize: 12, packName: 'case', category: 'grocery', holdingDays: 180, color: 'green', posOrder: 3 } }),
    rice: await prisma.item.create({ data: { name: 'Rice 5kg (Nadu)', unit: 'bag', packSize: 1, category: 'grocery', holdingDays: 180, color: 'amber', posOrder: 4 } }),
    dhal: await prisma.item.create({ data: { name: 'Red dhal 1kg', unit: 'pack', packSize: 1, category: 'grocery', holdingDays: 365, color: 'red', posOrder: 5 } }),
    sugar: await prisma.item.create({ data: { name: 'Sugar 1kg', unit: 'pack', packSize: 1, category: 'grocery', holdingDays: 365, color: 'grey', posOrder: 6 } }),
    flour: await prisma.item.create({ data: { name: 'Wheat flour 1kg', unit: 'pack', packSize: 1, category: 'grocery', holdingDays: 180, color: 'grey', posOrder: 7 } }),
    milk: await prisma.item.create({ data: { name: 'Milk powder 400g', unit: 'pack', packSize: 1, category: 'grocery', holdingDays: 365, color: 'blue', posOrder: 8 } }),
  };
  // ---- Suppliers
  const perera = await prisma.party.create({ data: { type: 'SUPPLIER', name: 'Perera Farm (eggs)', phone: '0772345671', whatsapp: '0772345671', address: 'Gampaha', contactTier: 'OWNER_ONLY', usualDays: [1, 3, 5], usualOrder: [{ itemId: items.eggs.id, quantity: 3000 }] } });
  const coconutSup = await prisma.party.create({ data: { type: 'SUPPLIER', name: 'Kurunegala Coconut Traders', phone: '0772345672', address: 'Kurunegala', contactTier: 'CAN_DELEGATE', usualDays: [2], usualOrder: [{ itemId: items.coconut.id, quantity: 600 }] } });
  const grocerySup = await prisma.party.create({ data: { type: 'SUPPLIER', name: 'Lanka Grocery Wholesale', phone: '0112345673', address: 'Pettah', contactTier: 'STAFF', usualDays: [4], usualOrder: [{ itemId: items.rice.id, quantity: 100 }, { itemId: items.oil.id, quantity: 60 }, { itemId: items.sugar.id, quantity: 100 }] } });

  // ---- Rates (standard)
  const prices: Record<string, { buy: number; sell: number }> = {
    [items.eggs.id]: { buy: 42, sell: 52 },
    [items.coconut.id]: { buy: 95, sell: 120 },
    [items.oil.id]: { buy: 780, sell: 920 },
    [items.rice.id]: { buy: 1150, sell: 1290 },
    [items.dhal.id]: { buy: 420, sell: 480 },
    [items.sugar.id]: { buy: 230, sell: 260 },
    [items.flour.id]: { buy: 240, sell: 270 },
    [items.milk.id]: { buy: 980, sell: 1080 },
  };
  for (const [itemId, p] of Object.entries(prices)) {
    await prisma.rate.createMany({
      data: [
        { itemId, direction: 'BUY', priceCents: rs(p.buy * 0.95), validFrom: day(-60), sourceNote: 'opening price' },
        { itemId, direction: 'SELL', priceCents: rs(p.sell * 0.95), validFrom: day(-60), sourceNote: 'opening price' },
        { itemId, direction: 'BUY', priceCents: rs(p.buy), validFrom: day(-20), sourceNote: 'supplier call' },
        { itemId, direction: 'SELL', priceCents: rs(p.sell), validFrom: day(-20), sourceNote: 'margin kept' },
      ],
    });
  }
  // Supplier-specific buy price for eggs
  await prisma.rate.create({ data: { itemId: items.eggs.id, partyId: perera.id, direction: 'BUY', priceCents: rs(41.5), validFrom: day(-20), sourceNote: 'Perera agreed rate' } });

  // ---- Users (each is also an EMPLOYEE party)
  const pw = (s: string) => bcrypt.hashSync(s, 10);
  const mkUser = async (u: { username: string; displayName: string; role: 'OWNER' | 'OFFICE' | 'CASHIER' | 'DRIVER' | 'WAREHOUSE'; secret: string; outletId?: string | null; canSupervise?: boolean; phone?: string }) => {
    const party = await prisma.party.create({ data: { type: 'EMPLOYEE', name: u.displayName, phone: u.phone, contactTier: 'STAFF' } });
    return prisma.user.create({
      data: { username: u.username, displayName: u.displayName, role: u.role, secretHash: pw(u.secret), partyId: party.id, outletId: u.outletId ?? null, canSuperviseDeliveries: u.canSupervise ?? false },
    });
  };
  const owner = await mkUser({ username: 'kusal', displayName: 'Kusal Perera', role: 'OWNER', secret: 'owner123', phone: '0771234567' });
  const nimali = await mkUser({ username: 'nimali', displayName: 'Nimali Fernando', role: 'OFFICE', secret: 'office123', canSupervise: true });
  const ruwan = await mkUser({ username: 'ruwan', displayName: 'Ruwan Silva', role: 'OFFICE', secret: 'office123' });
  const cashiers = [];
  const cashierNames = ['Dilki', 'Sachini', 'Tharindu', 'Hansika', 'Nuwan'];
  for (const [i, o] of outlets.entries()) {
    cashiers.push(await mkUser({ username: `cashier${i + 1}`, displayName: cashierNames[i], role: 'CASHIER', secret: '1234', outletId: o.id }));
  }
  const saman = await mkUser({ username: 'saman', displayName: 'Saman Kumara', role: 'DRIVER', secret: '1234', phone: '0779876541' });
  const kamal = await mkUser({ username: 'kamal', displayName: 'Kamal Jayasuriya', role: 'DRIVER', secret: '1234', phone: '0779876542' });
  const priyantha = await mkUser({ username: 'priyantha', displayName: 'Priyantha Bandara', role: 'WAREHOUSE', secret: '1234', outletId: warehouse.id });
  void ruwan;

  // ---- Customers
  const customersSpec: Prisma.PartyCreateInput[] = [
    { type: 'CUSTOMER', name: 'Hotel Lakview', phone: '0112911111', whatsapp: '0771111111', address: 'Lake Rd, Kelaniya', landmark: 'blue gate next to the pharmacy', segment: 'B2B_BIG', contactTier: 'OWNER_ONLY', creditLimitCents: rs(150000), creditDays: 30, usualDays: [1, 4], usualOrder: [{ itemId: items.eggs.id, quantity: 300 }, { itemId: items.coconut.id, quantity: 20 }], windowStart: '07:30', windowEnd: '09:00', routeName: 'Kelaniya', routePosition: 1 },
    { type: 'CUSTOMER', name: 'Sunrise Bakery', phone: '0112922222', whatsapp: '0772222222', address: 'Main St, Kiribathgoda', landmark: 'opposite the bus stand', segment: 'B2B_BIG', contactTier: 'CAN_DELEGATE', creditLimitCents: rs(100000), creditDays: 14, usualDays: [1, 2, 3, 4, 5, 6], usualOrder: [{ itemId: items.eggs.id, quantity: 600 }, { itemId: items.flour.id, quantity: 40 }], windowStart: '06:30', windowEnd: '07:30', routeName: 'Kelaniya', routePosition: 2 },
    { type: 'CUSTOMER', name: 'Green Leaf Restaurant', phone: '0112933333', address: 'Kandy Rd, Kadawatha', segment: 'B2B_REGULAR', contactTier: 'STAFF', creditLimitCents: rs(50000), creditDays: 14, usualDays: [2, 5], usualOrder: [{ itemId: items.eggs.id, quantity: 150 }, { itemId: items.coconut.id, quantity: 30 }, { itemId: items.oil.id, quantity: 6 }], windowStart: '08:00', windowEnd: '10:00', routeName: 'Kadawatha', routePosition: 1 },
    { type: 'CUSTOMER', name: 'Wattala Caterers', phone: '0112944444', whatsapp: '0774444444', address: 'Negombo Rd, Wattala', segment: 'B2B_BIG', contactTier: 'OWNER_ONLY', creditLimitCents: rs(200000), creditDays: 30, usualDays: [3, 6], usualOrder: [{ itemId: items.eggs.id, quantity: 900 }, { itemId: items.coconut.id, quantity: 100 }, { itemId: items.rice.id, quantity: 20 }], windowStart: '09:00', windowEnd: '11:00', routeName: 'Wattala', routePosition: 1 },
    { type: 'CUSTOMER', name: 'Little Stars Preschool canteen', phone: '0112955555', address: 'Temple Rd, Peliyagoda', segment: 'B2B_REGULAR', contactTier: 'STAFF', creditLimitCents: rs(20000), creditDays: 7, usualDays: [1], usualOrder: [{ itemId: items.eggs.id, quantity: 90 }, { itemId: items.milk.id, quantity: 4 }], windowStart: '07:00', windowEnd: '08:00', routeName: 'Kelaniya', routePosition: 3 },
    { type: 'CUSTOMER', name: 'Ranjith Stores', phone: '0771234001', address: 'Kadawatha', segment: 'B2B_REGULAR', contactTier: 'STAFF', creditLimitCents: rs(30000), creditDays: 14, usualDays: [2], usualOrder: [{ itemId: items.eggs.id, quantity: 300 }], windowStart: '10:00', windowEnd: '12:00', routeName: 'Kadawatha', routePosition: 2 },
    { type: 'CUSTOMER', name: 'City Pharmacy & Grocery', phone: '0771234002', address: 'Wattala', segment: 'B2B_REGULAR', contactTier: 'STAFF', creditLimitCents: rs(40000), creditDays: 14, usualDays: [4], usualOrder: [{ itemId: items.eggs.id, quantity: 240 }, { itemId: items.sugar.id, quantity: 20 }], windowStart: '10:00', windowEnd: '12:00', routeName: 'Wattala', routePosition: 2 },
    { type: 'CUSTOMER', name: 'Mrs. Kumari (home)', phone: '0771234003', segment: 'B2C_WALKIN', contactTier: 'STAFF' },
    { type: 'CUSTOMER', name: 'Dinesh Hoppers', phone: '0771234004', address: 'Kelaniya', segment: 'B2B_REGULAR', contactTier: 'STAFF', creditLimitCents: rs(15000), creditDays: 7, usualDays: [0, 3], usualOrder: [{ itemId: items.eggs.id, quantity: 120 }, { itemId: items.coconut.id, quantity: 25 }], windowStart: '15:00', windowEnd: '16:30', routeName: 'Kelaniya', routePosition: 4 },
    { type: 'CUSTOMER', name: 'Blue Ocean Hotel', phone: '0112966666', whatsapp: '0776666666', address: 'Beach Rd, Wattala', segment: 'B2B_BIG', contactTier: 'OWNER_ONLY', creditLimitCents: rs(250000), creditDays: 30, usualDays: [1, 5], usualOrder: [{ itemId: items.eggs.id, quantity: 1200 }, { itemId: items.coconut.id, quantity: 150 }], windowStart: '06:00', windowEnd: '07:30', routeName: 'Wattala', routePosition: 3 },
    { type: 'CUSTOMER', name: 'Kiribathgoda Boarding House', phone: '0771234005', segment: 'B2B_REGULAR', contactTier: 'STAFF', creditLimitCents: rs(10000), creditDays: 7, usualDays: [6], usualOrder: [{ itemId: items.eggs.id, quantity: 60 }, { itemId: items.rice.id, quantity: 5 }] },
    { type: 'CUSTOMER', name: 'Saman Tea Kade', phone: '0771234006', segment: 'B2B_REGULAR', contactTier: 'STAFF', creditLimitCents: rs(8000), creditDays: 7 },
  ];
  const customers = [];
  for (const c of customersSpec) customers.push(await prisma.party.create({ data: c }));
  const [lakview, bakery, greenLeaf, caterers, preschool, ranjith, cityPharm, , hoppers, blueOcean] = customers;

  // ---- Reorder levels
  for (const o of outlets) {
    await prisma.reorderLevel.createMany({
      data: [
        { itemId: items.eggs.id, holderId: o.id, quantity: 300 },
        { itemId: items.coconut.id, holderId: o.id, quantity: 40 },
        { itemId: items.oil.id, holderId: o.id, quantity: 12 },
        { itemId: items.rice.id, holderId: o.id, quantity: 10 },
      ],
    });
  }
  await prisma.reorderLevel.createMany({
    data: [
      { itemId: items.eggs.id, holderId: warehouse.id, quantity: 1500 },
      { itemId: items.coconut.id, holderId: warehouse.id, quantity: 200 },
      { itemId: items.oil.id, holderId: warehouse.id, quantity: 48 },
      { itemId: items.rice.id, holderId: warehouse.id, quantity: 40 },
    ],
  });

  // ---- Helpers for movements
  const buy = (id: string) => rs(prices[id].buy);
  const sell = (id: string) => rs(prices[id].sell);
  const goods = async (from: string, to: string, itemId: string, qty: number, at: Date, extra: Partial<Prisma.MovementUncheckedCreateInput> = {}) =>
    prisma.movement.create({ data: { kind: 'GOODS', fromPartyId: from, toPartyId: to, itemId, quantity: qty, rateCents: extra.rateCents ?? sell(itemId), occurredAt: at, clientId: randomUUID(), ...extra } });
  const money = async (from: string, to: string, cents: number, at: Date, method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER', extra: Partial<Prisma.MovementUncheckedCreateInput> = {}) =>
    prisma.movement.create({ data: { kind: 'MONEY', fromPartyId: from, toPartyId: to, amountCents: cents, method, occurredAt: at, clientId: randomUUID(), chequeStatus: method === 'CHEQUE' ? 'PENDING' : undefined, ...extra } });

  // ---- Opening stock: supplier → warehouse with batches, then warehouse → outlets. Spread over the last 14 days.
  console.log('Stock and sales history…');
  for (let d = -14; d <= 0; d++) {
    // Egg deliveries from Perera every Mon/Wed/Fri and today for freshness variety
    const wd = day(d).getDay();
    if ([1, 3, 5].includes(wd) || d === 0 || d === -1) {
      const batch = await prisma.batch.create({ data: { itemId: items.eggs.id, supplierId: perera.id, quantity: 3000, receivedAt: day(d, 6, 30) } });
      await goods(perera.id, warehouse.id, items.eggs.id, 3000, day(d, 6, 30), { rateCents: rs(41.5), batchId: batch.id, byId: priyantha.id });
      // distribute ~2400 to outlets (480 each)
      for (const o of outlets) await goods(warehouse.id, o.id, items.eggs.id, 480, day(d, 7, 15), { batchId: batch.id, byId: priyantha.id });
    }
    if (wd === 2) {
      const batch = await prisma.batch.create({ data: { itemId: items.coconut.id, supplierId: coconutSup.id, quantity: 600, receivedAt: day(d, 8) } });
      await goods(coconutSup.id, warehouse.id, items.coconut.id, 600, day(d, 8), { rateCents: buy(items.coconut.id), batchId: batch.id, byId: priyantha.id });
      for (const o of outlets) await goods(warehouse.id, o.id, items.coconut.id, 100, day(d, 9), { batchId: batch.id, byId: priyantha.id });
    }
    if (wd === 4 && d < 0) {
      for (const [itemId, qty] of [[items.rice.id, 100], [items.oil.id, 60], [items.sugar.id, 100], [items.dhal.id, 60], [items.flour.id, 80], [items.milk.id, 40]] as [string, number][]) {
        await goods(grocerySup.id, warehouse.id, itemId, qty, day(d, 10), { rateCents: buy(itemId), byId: priyantha.id });
        for (const o of outlets) await goods(warehouse.id, o.id, itemId, Math.floor(qty / 6), day(d, 11), { byId: priyantha.id });
      }
    }

    if (d === 0) break;

    // Walk-in POS sales per outlet, 6–10 bills a day
    for (const [oi, o] of outlets.entries()) {
      const bills = 6 + ((d + oi) % 5);
      for (let b = 0; b < bills; b++) {
        const at = day(d, 8 + b, (b * 7) % 60);
        const lines = [
          { itemId: items.eggs.id, quantity: 30 * (1 + ((b + oi) % 3)) },
          ...(b % 2 === 0 ? [{ itemId: items.coconut.id, quantity: 2 + (b % 4) }] : []),
          ...(b % 3 === 0 ? [{ itemId: pick([items.rice.id, items.oil.id, items.sugar.id, items.dhal.id], b + oi), quantity: 1 }] : []),
        ];
        const total = lines.reduce((s, l) => s + l.quantity * sell(l.itemId), 0);
        const req = await prisma.request.create({
          data: { type: 'SALE_ORDER', status: 'DONE', fromPartyId: o.id, toPartyId: walkIn.id, createdById: cashiers[oi].id, approvedById: cashiers[oi].id, approvedAt: at, completedAt: at, dueAt: at, reason: 'Walk-in sale', lines: { create: lines.map((l) => ({ ...l, rateCents: sell(l.itemId) })) } },
        });
        for (const l of lines) await goods(o.id, walkIn.id, l.itemId, l.quantity, at, { requestId: req.id, byId: cashiers[oi].id });
        await money(walkIn.id, o.id, total, at, 'CASH', { requestId: req.id, byId: cashiers[oi].id });
      }
      // Day close: cash to office
      const cashIn = await prisma.movement.aggregate({ where: { kind: 'MONEY', toPartyId: o.id, occurredAt: { gte: day(d, 0), lte: day(d, 23, 59) } }, _sum: { amountCents: true } });
      if (cashIn._sum.amountCents) await money(o.id, cashOffice.id, cashIn._sum.amountCents, day(d, 19), 'CASH', { reason: 'Day close', byId: cashiers[oi].id });
    }

    // Deliveries to B2B customers on their usual days
    const driver = d % 2 === 0 ? saman : kamal;
    for (const c of customers) {
      if (!c.usualDays.includes(wd) || !c.usualOrder) continue;
      const lines = (c.usualOrder as { itemId: string; quantity: number }[]).map((l) => ({ ...l, rateCents: sell(l.itemId) }));
      const total = lines.reduce((s, l) => s + l.quantity * l.rateCents, 0);
      const at = day(d, Number(c.windowStart?.slice(0, 2) ?? 9), 20);
      const req = await prisma.request.create({
        data: {
          type: 'SALE_ORDER', status: 'DONE', fromPartyId: warehouse.id, toPartyId: c.id, dueAt: day(d, 0), windowStart: c.windowStart, windowEnd: c.windowEnd,
          assignedToId: driver.id, createdById: nimali.id, approvedById: nimali.id, approvedAt: day(d - 1, 16), completedAt: at, stopStatus: 'DONE', routePosition: c.routePosition,
          createdByRule: 'REGULAR_ORDER', reason: `${c.name} usual order`, lines: { create: lines },
          events: { create: [{ action: 'CREATED' }, { action: 'APPROVED', byId: nimali.id }, { action: 'COMPLETED', byId: driver.id }] },
        },
      });
      // load to driver, deliver
      for (const l of lines) {
        await goods(warehouse.id, driver.partyId, l.itemId, l.quantity, day(d, 6), { byId: driver.id, reason: 'Load check' });
        await goods(driver.partyId, c.id, l.itemId, l.quantity, at, { requestId: req.id, byId: driver.id, signerName: `${c.name} – received`, rateCents: l.rateCents });
      }
      // payment behaviour: big customers pay by cheque weekly, regulars cash, Lakview sometimes credit
      if (c.segment === 'B2B_BIG' && wd === 1) {
        await money(c.id, driver.partyId, total, at, 'CHEQUE', { requestId: req.id, byId: driver.id, chequeNumber: `${100000 + Math.abs(d) * 7 + c.routePosition!}`, chequeBank: pick(['BOC', 'Commercial', 'Sampath', 'HNB'], c.routePosition!), chequeDate: day(d + 5), chequeStatus: d < -7 ? 'CLEARED' : 'PENDING' });
      } else if (c.id === lakview.id || c.id === caterers.id) {
        // credit: no money movement (balance builds)
      } else if (c.id === cityPharm.id && d > -10) {
        // city pharmacy stopped paying → overdue
      } else {
        await money(c.id, driver.partyId, total, at, 'CASH', { requestId: req.id, byId: driver.id });
      }
    }
    // Driver handover each evening
    for (const dr of [saman, kamal]) {
      const inn = await prisma.movement.aggregate({ where: { kind: 'MONEY', method: 'CASH', toPartyId: dr.partyId, occurredAt: { gte: day(d, 0), lte: day(d, 23, 59) } }, _sum: { amountCents: true } });
      if (inn._sum.amountCents) await money(dr.partyId, cashOffice.id, inn._sum.amountCents, day(d, 18), 'CASH', { reason: 'Handover accepted', byId: nimali.id });
    }
  }

  // Lakview paid part of its balance by bank transfer last week
  await money(lakview.id, cashOffice.id, rs(60000), day(-6, 11), 'BANK_TRANSFER', { reason: 'Part settlement', byId: nimali.id });

  // Spoilage: some cracked eggs at Outlet 2 and warehouse
  await goods(outlets[1].id, loss.id, items.eggs.id, 45, day(-3, 17), { reason: 'spoilage', spoilageReason: 'CRACKED', rateCents: buy(items.eggs.id), byId: cashiers[1].id });
  await goods(warehouse.id, loss.id, items.eggs.id, 90, day(-5, 15), { reason: 'spoilage', spoilageReason: 'ROTTEN', rateCents: buy(items.eggs.id), byId: priyantha.id });
  await goods(outlets[3].id, loss.id, items.coconut.id, 12, day(-2, 16), { reason: 'spoilage', spoilageReason: 'ROTTEN', rateCents: buy(items.coconut.id), byId: cashiers[3].id });

  // ---- Today: approved route for both drivers (not yet loaded or delivered)
  console.log("Today's route and inbox…");
  const todayWd = new Date().getDay();
  let pos = { [saman.id]: 0, [kamal.id]: 0 };
  for (const c of customers) {
    if (!c.usualOrder || !c.routeName) continue;
    const isToday = c.usualDays.includes(todayWd) || [lakview.id, bakery.id, greenLeaf.id, blueOcean.id, hoppers.id].includes(c.id);
    if (!isToday) continue;
    const driver = c.routeName === 'Wattala' || c.routeName === 'Kadawatha' ? kamal : saman;
    pos[driver.id]++;
    const lines = (c.usualOrder as { itemId: string; quantity: number }[]).map((l) => ({ ...l, rateCents: sell(l.itemId) }));
    await prisma.request.create({
      data: {
        type: 'SALE_ORDER', status: 'APPROVED', fromPartyId: warehouse.id, toPartyId: c.id, dueAt: day(0, 0), windowStart: c.windowStart, windowEnd: c.windowEnd,
        assignedToId: driver.id, routePosition: pos[driver.id], stopStatus: 'PENDING', createdByRule: 'REGULAR_ORDER', approvedById: nimali.id, approvedAt: day(-1, 16),
        reason: `${c.name} usually orders on this day. Confirmed by call.`, lines: { create: lines },
        events: { create: [{ action: 'CREATED' }, { action: 'APPROVED', byId: nimali.id, note: 'Confirmed by call' }] },
      },
    });
  }
  // One supplier pickup today for Kamal
  await prisma.request.create({
    data: {
      type: 'PURCHASE', status: 'APPROVED', fromPartyId: coconutSup.id, toPartyId: warehouse.id, dueAt: day(0, 0), windowStart: '11:00', windowEnd: '12:30',
      assignedToId: kamal.id, routePosition: ++pos[kamal.id], stopStatus: 'PENDING', createdById: nimali.id, approvedById: owner.id, approvedAt: day(-1, 17),
      reason: 'Weekly coconut pickup', lines: { create: [{ itemId: items.coconut.id, quantity: 600, rateCents: buy(items.coconut.id) }] },
    },
  });
  // Tomorrow: two approved orders not yet assigned (for the route planner)
  for (const c of [ranjith, preschool]) {
    const lines = (c.usualOrder as { itemId: string; quantity: number }[]).map((l) => ({ ...l, rateCents: sell(l.itemId) }));
    await prisma.request.create({
      data: { type: 'SALE_ORDER', status: 'APPROVED', fromPartyId: warehouse.id, toPartyId: c.id, dueAt: day(1, 0), windowStart: c.windowStart, windowEnd: c.windowEnd, stopStatus: 'PENDING', createdById: nimali.id, approvedById: nimali.id, approvedAt: day(0, 9), reason: 'Phoned in', lines: { create: lines } },
    });
  }

  // ---- Inbox: proposals waiting for review
  const mk = (data: Prisma.RequestUncheckedCreateInput) => prisma.request.create({ data: { ...data, events: { create: [{ action: 'CREATED', byId: data.createdById ?? null }] } } });
  await mk({ type: 'TRANSFER', status: 'PROPOSED', fromPartyId: warehouse.id, toPartyId: outlets[2].id, createdByRule: 'LOW_STOCK', dueAt: day(1, 0), reason: 'Outlet 3 eggs will run out tomorrow at the usual rate of sale. Warehouse has 2,400.', lines: { create: [{ itemId: items.eggs.id, quantity: 600, rateCents: sell(items.eggs.id) }] } });
  await mk({ type: 'PURCHASE', status: 'PROPOSED', fromPartyId: grocerySup.id, toPartyId: warehouse.id, createdByRule: 'SUPPLIER_ORDER_DAY', dueAt: day(1, 0), reason: 'Usual purchase day for Lanka Grocery Wholesale.', lines: { create: [{ itemId: items.rice.id, quantity: 100, rateCents: buy(items.rice.id) }, { itemId: items.oil.id, quantity: 60, rateCents: buy(items.oil.id) }, { itemId: items.sugar.id, quantity: 100, rateCents: buy(items.sugar.id) }] } });
  await mk({ type: 'PRICE_CHANGE', status: 'PROPOSED', createdById: nimali.id, reason: 'Eggs buy price Rs 42.00 → Rs 44.00 (5%). Perera Farm called: feed costs up.', payload: { itemId: items.eggs.id, partyId: null, direction: 'BUY', priceCents: rs(44), previousCents: rs(42), validFrom: day(1).toISOString(), sourceNote: 'Perera Farm call' } });
  await mk({ type: 'CREDIT_LIMIT_CHANGE', status: 'PROPOSED', toPartyId: bakery.id, createdById: ruwan.id, reason: 'Sunrise Bakery asks to raise the limit from Rs 100,000 to Rs 150,000; they order daily and pay weekly.', payload: { creditLimitCents: rs(150000), creditDays: 14 } });
  await mk({ type: 'LEAVE', status: 'PROPOSED', fromPartyId: saman.partyId, createdById: saman.id, dueAt: day(3, 0), reason: 'Saman requests Saturday off for a family event. Leaves day short: Saturday has 4 stops.', payload: { leavesDayShort: true, suggestedCoverId: kamal.id } });
  await mk({ type: 'CALL_TASK', status: 'PROPOSED', toPartyId: blueOcean.id, createdByRule: 'QUIET_BIG_CUSTOMER', assignedToId: owner.id, dueAt: day(0, 0), reason: 'Blue Ocean Hotel has not ordered for 11 days. Call to check in.' });
  await mk({ type: 'CALL_TASK', status: 'PROPOSED', toPartyId: cityPharm.id, createdByRule: 'OVERDUE_CREDIT', dueAt: day(0, 0), reason: 'City Pharmacy & Grocery owes Rs 18,720, past 14 credit days. Call, and consider holding credit.', payload: { holdCredit: true } });
  await mk({ type: 'RETURN', status: 'PROPOSED', fromPartyId: greenLeaf.id, toPartyId: outlets[2].id, createdById: nimali.id, reason: 'Green Leaf: 2 trays cracked on delivery. Replace tomorrow.', lines: { create: [{ itemId: items.eggs.id, quantity: 60, rateCents: sell(items.eggs.id) }] } });

  // Owner's approved tasks for today (My calls) and one delegated to staff
  await mk({ type: 'CALL_TASK', status: 'APPROVED', toPartyId: perera.id, createdById: owner.id, assignedToId: owner.id, approvedById: owner.id, approvedAt: day(-1), dueAt: day(0, 0), reason: 'Weekly price check with Perera Farm.' });
  await mk({ type: 'CALL_TASK', status: 'APPROVED', toPartyId: caterers.id, createdById: owner.id, assignedToId: owner.id, approvedById: owner.id, approvedAt: day(-1), dueAt: day(0, 0), reason: 'Wattala Caterers: confirm the wedding order for Saturday.' });
  await mk({ type: 'CALL_TASK', status: 'APPROVED', toPartyId: lakview.id, createdById: owner.id, assignedToId: nimali.id, approvedById: owner.id, approvedAt: day(-1), dueAt: day(0, 0), reason: 'Ask about weekend order', decisionNote: 'Delegated by owner' });

  // Notes (call log)
  await prisma.note.createMany({
    data: [
      { partyId: lakview.id, channel: 'CALL', text: 'Wants 300 eggs + 20 coconuts tomorrow morning. Asked about a discount for a monthly contract.', createdById: owner.id, createdAt: day(-1, 15) },
      { partyId: perera.id, channel: 'CALL', text: 'Feed prices up; wants Rs 44 from next week.', createdById: owner.id, createdAt: day(-1, 10) },
      { partyId: greenLeaf.id, channel: 'COMPLAINT', text: 'Two trays cracked on delivery. Photo sent on WhatsApp.', createdById: nimali.id, createdAt: day(-1, 12) },
      { partyId: bakery.id, channel: 'WHATSAPP', text: 'Needs an extra 300 eggs on Friday for a wedding order.', createdById: ruwan.id, createdAt: day(-2, 9) },
    ],
  });

  // Rules + settings
  const rules = [
    ['LOW_STOCK', 'Low stock', 'Stock falls below the reorder level → transfer or purchase'],
    ['FRESHNESS', 'Freshness', 'Batch at 75% of holding period → transfer to busier outlet or discount'],
    ['REGULAR_ORDER', 'Regular order', 'Usual order day → sale order with usual lines'],
    ['SUPPLIER_ORDER_DAY', 'Supplier order day', 'Usual purchase day → purchase with suggested quantities'],
    ['QUIET_BIG_CUSTOMER', 'Quiet big customer', 'No order for 10 days → call task'],
    ['CHEQUE_DUE', 'Cheque due', 'Cheque dated within 2 days → deposit task'],
    ['OVERDUE_CREDIT', 'Overdue credit', 'Balance past credit days → call task + hold credit'],
    ['PRICE_CHANGE', 'Price change', 'Buy price up → new sell rates keeping margin'],
    ['LEAVE_CHECK', 'Leave check', 'Leave on a busy day → marked short with suggested cover'],
    ['ROUTE_PLAN', 'Route plan', 'Approved orders for tomorrow → stop list per driver'],
    ['CASH_HANDOVER', 'Cash handover', 'Driver ends route → handover request'],
  ] as const;
  for (const [code, name, description] of rules) {
    await prisma.rule.create({ data: { code, name, description, proposedCount: 20 + code.length, editedCount: 2, rejectedCount: code === 'FRESHNESS' ? 6 : 1, lastRunAt: day(0, 6) } });
  }
  await prisma.setting.createMany({ data: [{ key: 'priceChangeThresholdPercent', value: 10 }, { key: 'staffApprovalLimitCents', value: rs(50000) }] });

  console.log('Seed complete.');
  console.log('Logins: kusal/owner123 (owner) · nimali/office123 (office) · cashier1/1234 (POS) · saman/1234 (driver) · priyantha/1234 (warehouse)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
