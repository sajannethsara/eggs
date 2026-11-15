import { z } from 'zod';
import {
  CONTACT_TIERS,
  MOVEMENT_KINDS,
  NOTE_CHANNELS,
  PARTY_STATUSES,
  PARTY_TYPES,
  PAYMENT_METHODS,
  RATE_DIRECTIONS,
  REJECT_REASONS,
  REQUEST_TYPES,
  ROLES,
  SEGMENTS,
  SPOILAGE_REASONS,
  STOP_PROBLEMS,
} from './enums.js';

export const RoleSchema = z.enum(ROLES);

// Auth
export const LoginSchema = z.object({
  role: RoleSchema,
  username: z.string().min(1),
  // PIN for phone/POS roles, password for owner/office (spec §15). Same field on the wire.
  secret: z.string().min(4),
  deviceName: z.string().max(80).optional(),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const UserDto = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  role: RoleSchema,
  partyId: z.string(),
  outletId: z.string().nullable(),
  language: z.enum(['en', 'si']),
  canSuperviseDeliveries: z.boolean(),
});
export type User = z.infer<typeof UserDto>;

export const AuthResponse = z.object({ token: z.string(), user: UserDto });
export type AuthResponseT = z.infer<typeof AuthResponse>;

// Parties
export const PartyCreateSchema = z.object({
  type: z.enum(PARTY_TYPES),
  name: z.string().min(1).max(120),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  address: z.string().max(240).optional(),
  landmark: z.string().max(120).optional(),
  segment: z.enum(SEGMENTS).optional(),
  contactTier: z.enum(CONTACT_TIERS).default('STAFF'),
  creditLimitCents: z.number().int().nonnegative().default(0),
  creditDays: z.number().int().nonnegative().default(0),
  status: z.enum(PARTY_STATUSES).default('ACTIVE'),
});
export type PartyCreate = z.infer<typeof PartyCreateSchema>;

export const PartyPatchSchema = PartyCreateSchema.partial().extend({
  creditHold: z.boolean().optional(),
});

// Rates
export const RateCreateSchema = z.object({
  itemId: z.string(),
  partyId: z.string().nullable().optional(),
  direction: z.enum(RATE_DIRECTIONS),
  priceCents: z.number().int().positive(),
  validFrom: z.coerce.date(),
  sourceNote: z.string().max(240).optional(),
});
export type RateCreate = z.infer<typeof RateCreateSchema>;

// Notes
export const NoteCreateSchema = z.object({
  partyId: z.string().nullable().optional(),
  itemId: z.string().nullable().optional(),
  channel: z.enum(NOTE_CHANNELS),
  text: z.string().min(1).max(2000),
  attachmentUrl: z.string().url().optional(),
});
export type NoteCreate = z.infer<typeof NoteCreateSchema>;

// Requests
export const RequestLineSchema = z.object({
  itemId: z.string(),
  quantity: z.number().positive(),
  rateCents: z.number().int().nonnegative().optional(),
});
export type RequestLine = z.infer<typeof RequestLineSchema>;

export const RequestCreateSchema = z.object({
  type: z.enum(REQUEST_TYPES),
  fromPartyId: z.string().nullable().optional(),
  toPartyId: z.string().nullable().optional(),
  lines: z.array(RequestLineSchema).default([]),
  dueAt: z.coerce.date().nullable().optional(),
  windowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  windowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  assignedToId: z.string().nullable().optional(),
  reason: z.string().max(500).optional(),
  noteId: z.string().optional(),
  // Free-form payload for types that need extra fields (price change, leave, handover).
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type RequestCreate = z.infer<typeof RequestCreateSchema>;

export const RequestDecisionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'EDIT_APPROVE', 'SEND_TO_OWNER']),
  rejectReason: z.enum(REJECT_REASONS).optional(),
  note: z.string().max(500).optional(),
  lines: z.array(RequestLineSchema).optional(),
});
export type RequestDecision = z.infer<typeof RequestDecisionSchema>;

// Movements
export const MovementCreateSchema = z.object({
  requestId: z.string().nullable().optional(),
  kind: z.enum(MOVEMENT_KINDS),
  fromPartyId: z.string(),
  toPartyId: z.string(),
  itemId: z.string().nullable().optional(),
  quantity: z.number().positive().optional(),
  amountCents: z.number().int().positive().optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  chequeNumber: z.string().max(40).optional(),
  chequeBank: z.string().max(80).optional(),
  chequeDate: z.coerce.date().optional(),
  signerName: z.string().max(120).optional(),
  signatureDataUrl: z.string().optional(),
  photoUrl: z.string().optional(),
  reason: z.string().max(240).optional(),
  spoilageReason: z.enum(SPOILAGE_REASONS).optional(),
  reversesId: z.string().optional(),
  // Offline-first: client-generated id so retries are idempotent (spec §15).
  clientId: z.string().uuid(),
  occurredAt: z.coerce.date().optional(),
  deviceName: z.string().max(80).optional(),
});
export type MovementCreate = z.infer<typeof MovementCreateSchema>;

// POS walk-in sale: creates its own Request + Movements in one call.
export const PosSaleSchema = z.object({
  clientId: z.string().uuid(),
  outletId: z.string(),
  lines: z.array(RequestLineSchema).min(1),
  method: z.enum(PAYMENT_METHODS),
  customerId: z.string().optional(),
  receivedCents: z.number().int().nonnegative().optional(),
  chequeNumber: z.string().optional(),
  chequeBank: z.string().optional(),
  chequeDate: z.coerce.date().optional(),
  occurredAt: z.coerce.date().optional(),
});
export type PosSale = z.infer<typeof PosSaleSchema>;

// Driver stop completion
export const StopCompleteSchema = z.object({
  clientId: z.string().uuid(),
  lines: z.array(RequestLineSchema).min(1),
  method: z.enum([...PAYMENT_METHODS, 'PART']),
  receivedCents: z.number().int().nonnegative().optional(),
  chequeNumber: z.string().optional(),
  chequeBank: z.string().optional(),
  chequeDate: z.coerce.date().optional(),
  signerName: z.string().min(1).max(120),
  signatureDataUrl: z.string().min(1),
  occurredAt: z.coerce.date().optional(),
});
export type StopComplete = z.infer<typeof StopCompleteSchema>;

export const StopProblemSchema = z.object({
  problem: z.enum(STOP_PROBLEMS),
  note: z.string().max(240).optional(),
});

// Sync batch for offline outbox
export const SyncBatchSchema = z.object({
  ops: z
    .array(
      z.object({
        clientId: z.string().uuid(),
        kind: z.enum(['POS_SALE', 'STOP_COMPLETE', 'MOVEMENT']),
        body: z.unknown(),
      }),
    )
    .max(200),
});
export type SyncBatch = z.infer<typeof SyncBatchSchema>;
