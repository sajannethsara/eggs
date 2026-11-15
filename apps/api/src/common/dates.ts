export const startOfDay = (d: Date = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const endOfDay = (d: Date = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const daysBetween = (a: Date, b: Date) =>
  Math.floor((b.getTime() - a.getTime()) / 86_400_000);

export const hoursBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

/** "07:30" on the given day → Date. */
export const atTime = (day: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const x = startOfDay(day);
  x.setHours(h, m, 0, 0);
  return x;
};

export const parseDay = (s?: string) => (s ? startOfDay(new Date(s)) : startOfDay());
