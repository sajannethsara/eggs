// All money is stored as integer cents (Rs × 100) to avoid float drift.
export type Cents = number;

export const toCents = (rupees: number): Cents => Math.round(rupees * 100);
export const fromCents = (cents: Cents): number => cents / 100;

const lkr = new Intl.NumberFormat('en-LK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats cents as "Rs 1,250.00" (spec §7). */
export const formatRs = (cents: Cents): string => `Rs ${lkr.format(cents / 100)}`;

/** Formats cents without decimals when whole, e.g. "Rs 12,400". */
export const formatRsShort = (cents: Cents): string =>
  cents % 100 === 0 ? `Rs ${Math.round(cents / 100).toLocaleString('en-LK')}` : formatRs(cents);

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** Formats a date as "15 Nov" (spec §7). */
export const formatDay = (d: Date | string): string => dayMonth.format(new Date(d));

const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
export const formatTime = (d: Date | string): string => hm.format(new Date(d));
