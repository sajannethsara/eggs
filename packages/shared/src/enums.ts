// The five internal roles, one per app (spec §3).
export const ROLES = ['OWNER', 'OFFICE', 'CASHIER', 'DRIVER', 'WAREHOUSE'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_META: Record<
  Role,
  { label: string; app: string; device: 'phone' | 'desktop' | 'tablet'; home: string }
> = {
  OWNER: { label: 'Owner', app: 'Owner app', device: 'phone', home: '/owner' },
  OFFICE: { label: 'Office staff', app: 'Office desktop', device: 'desktop', home: '/office' },
  CASHIER: { label: 'Cashier', app: 'POS', device: 'desktop', home: '/pos' },
  DRIVER: { label: 'Driver', app: 'Driver app', device: 'phone', home: '/driver' },
  WAREHOUSE: { label: 'Warehouse keeper', app: 'Warehouse app', device: 'tablet', home: '/warehouse' },
};

// Party: anyone or anything that can hold goods or money, or do work (spec §4).
export const PARTY_TYPES = [
  'CUSTOMER',
  'SUPPLIER',
  'EMPLOYEE',
  'OUTLET',
  'WAREHOUSE',
  'VEHICLE',
  'SYSTEM',
] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const SEGMENTS = ['B2C_WALKIN', 'B2B_REGULAR', 'B2B_BIG'] as const;
export type Segment = (typeof SEGMENTS)[number];

export const CONTACT_TIERS = ['OWNER_ONLY', 'CAN_DELEGATE', 'STAFF'] as const;
export type ContactTier = (typeof CONTACT_TIERS)[number];

export const PARTY_STATUSES = ['ACTIVE', 'PAUSED', 'BLOCKED'] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

export const RATE_DIRECTIONS = ['BUY', 'SELL'] as const;
export type RateDirection = (typeof RATE_DIRECTIONS)[number];

export const NOTE_CHANNELS = [
  'CALL',
  'WHATSAPP',
  'VISIT',
  'COMPLAINT',
  'PHOTO',
  'SIGNATURE',
  'SYSTEM',
] as const;
export type NoteChannel = (typeof NOTE_CHANNELS)[number];

// Request: something that should happen (spec §4).
export const REQUEST_TYPES = [
  'SALE_ORDER',
  'PURCHASE',
  'TRANSFER',
  'RETURN',
  'SPOILAGE',
  'PRICE_CHANGE',
  'CREDIT_LIMIT_CHANGE',
  'CALL_TASK',
  'COLLECTION',
  'LEAVE',
  'SHIFT',
  'CASH_HANDOVER',
  'STOCK_ADJUSTMENT',
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = [
  'PROPOSED',
  'APPROVED',
  'IN_PROGRESS',
  'DONE',
  'REJECTED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

// Movement: something that did happen (spec §4). Goods or money.
export const MOVEMENT_KINDS = ['GOODS', 'MONEY'] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const PAYMENT_METHODS = ['CASH', 'CHEQUE', 'CREDIT', 'BANK_TRANSFER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CHEQUE_STATUSES = ['PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED'] as const;
export type ChequeStatus = (typeof CHEQUE_STATUSES)[number];

export const SPOILAGE_REASONS = ['CRACKED', 'ROTTEN', 'EXPIRED', 'PESTS', 'DAMAGED'] as const;
export type SpoilageReason = (typeof SPOILAGE_REASONS)[number];

export const STOP_STATUSES = ['NEXT', 'PENDING', 'DONE', 'SKIPPED', 'PROBLEM'] as const;
export type StopStatus = (typeof STOP_STATUSES)[number];

export const STOP_PROBLEMS = ['NOT_THERE', 'REFUSED', 'CANT_REACH', 'BREAKDOWN'] as const;
export type StopProblem = (typeof STOP_PROBLEMS)[number];

export const REJECT_REASONS = [
  'NOT_NEEDED',
  'WRONG_QUANTITY',
  'WRONG_PRICE',
  'DUPLICATE',
  'CUSTOMER_CANCELLED',
  'OTHER',
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

// System parties that always exist (spec §4: Loss, Bank, Cash office).
export const SYSTEM_PARTY_CODES = ['LOSS', 'BANK', 'CASH_OFFICE', 'WALK_IN'] as const;
export type SystemPartyCode = (typeof SYSTEM_PARTY_CODES)[number];

// Which roles may approve which request types (spec §3 permission matrix, §5 rule table).
export const APPROVER_ROLES: Record<RequestType, Role[]> = {
  SALE_ORDER: ['OFFICE', 'OWNER'],
  PURCHASE: ['OFFICE', 'OWNER'],
  TRANSFER: ['OFFICE', 'OWNER', 'WAREHOUSE'],
  RETURN: ['OFFICE', 'OWNER', 'CASHIER'],
  SPOILAGE: ['OFFICE', 'OWNER'],
  PRICE_CHANGE: ['OWNER'],
  CREDIT_LIMIT_CHANGE: ['OWNER'],
  CALL_TASK: ['OFFICE', 'OWNER'],
  COLLECTION: ['OFFICE', 'OWNER'],
  LEAVE: ['OWNER', 'OFFICE'],
  SHIFT: ['OFFICE', 'OWNER'],
  CASH_HANDOVER: ['OFFICE', 'OWNER'],
  STOCK_ADJUSTMENT: ['OFFICE', 'OWNER'],
};
