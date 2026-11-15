-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'OFFICE', 'CASHIER', 'DRIVER', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'si');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'OUTLET', 'WAREHOUSE', 'VEHICLE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('B2C_WALKIN', 'B2B_REGULAR', 'B2B_BIG');

-- CreateEnum
CREATE TYPE "ContactTier" AS ENUM ('OWNER_ONLY', 'CAN_DELEGATE', 'STAFF');

-- CreateEnum
CREATE TYPE "PartyStatus" AS ENUM ('ACTIVE', 'PAUSED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RateDirection" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "NoteChannel" AS ENUM ('CALL', 'WHATSAPP', 'VISIT', 'COMPLAINT', 'PHOTO', 'SIGNATURE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('SALE_ORDER', 'PURCHASE', 'TRANSFER', 'RETURN', 'SPOILAGE', 'PRICE_CHANGE', 'CREDIT_LIMIT_CHANGE', 'CALL_TASK', 'COLLECTION', 'LEAVE', 'SHIFT', 'CASH_HANDOVER', 'STOCK_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PROPOSED', 'APPROVED', 'IN_PROGRESS', 'DONE', 'REJECTED');

-- CreateEnum
CREATE TYPE "StopStatus" AS ENUM ('PENDING', 'DONE', 'SKIPPED', 'PROBLEM');

-- CreateEnum
CREATE TYPE "StopProblem" AS ENUM ('NOT_THERE', 'REFUSED', 'CANT_REACH', 'BREAKDOWN');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('GOODS', 'MONEY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHEQUE', 'CREDIT', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "SpoilageReason" AS ENUM ('CRACKED', 'ROTTEN', 'EXPIRED', 'PESTS', 'DAMAGED');

-- CreateEnum
CREATE TYPE "RequestAction" AS ENUM ('CREATED', 'APPROVED', 'EDITED', 'REJECTED', 'STARTED', 'COMPLETED', 'SENT_TO_OWNER', 'REASSIGNED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "secretHash" TEXT NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'en',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "canSuperviseDeliveries" BOOLEAN NOT NULL DEFAULT false,
    "partyId" TEXT NOT NULL,
    "outletId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "address" TEXT,
    "landmark" TEXT,
    "segment" "Segment",
    "contactTier" "ContactTier" NOT NULL DEFAULT 'STAFF',
    "status" "PartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "creditLimitCents" INTEGER NOT NULL DEFAULT 0,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "creditHold" BOOLEAN NOT NULL DEFAULT false,
    "usualOrder" JSONB,
    "usualDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "windowStart" TEXT,
    "windowEnd" TEXT,
    "routeName" TEXT,
    "routePosition" INTEGER,
    "systemCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "packSize" INTEGER NOT NULL DEFAULT 1,
    "packName" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "holdingDays" INTEGER NOT NULL DEFAULT 30,
    "perishable" BOOLEAN NOT NULL DEFAULT false,
    "barcode" TEXT,
    "color" TEXT NOT NULL DEFAULT 'grey',
    "posOrder" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReorderLevel" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ReorderLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rate" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "partyId" TEXT,
    "direction" "RateDirection" NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "sourceNote" TEXT,
    "enteredById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "partyId" TEXT,
    "itemId" TEXT,
    "channel" "NoteChannel" NOT NULL,
    "text" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PROPOSED',
    "fromPartyId" TEXT,
    "toPartyId" TEXT,
    "dueAt" TIMESTAMP(3),
    "windowStart" TEXT,
    "windowEnd" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT,
    "createdByRule" TEXT,
    "reason" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "decisionNote" TEXT,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "routePosition" INTEGER,
    "stopStatus" "StopStatus",
    "stopProblem" "StopProblem",
    "stopNote" TEXT,
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "payload" JSONB,
    "noteId" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "rateCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "action" "RequestAction" NOT NULL,
    "byId" TEXT,
    "note" TEXT,
    "snapshot" JSONB,
    "device" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "supplierId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "kind" "MovementKind" NOT NULL,
    "fromPartyId" TEXT NOT NULL,
    "toPartyId" TEXT NOT NULL,
    "itemId" TEXT,
    "quantity" INTEGER,
    "batchId" TEXT,
    "rateCents" INTEGER,
    "amountCents" INTEGER,
    "method" "PaymentMethod",
    "chequeNumber" TEXT,
    "chequeBank" TEXT,
    "chequeDate" TIMESTAMP(3),
    "chequeStatus" "ChequeStatus",
    "signerName" TEXT,
    "signatureDataUrl" TEXT,
    "photoUrl" TEXT,
    "reason" TEXT,
    "spoilageReason" "SpoilageReason",
    "reversesId" TEXT,
    "clientId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byId" TEXT,
    "device" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "proposedCount" INTEGER NOT NULL DEFAULT 0,
    "editedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_partyId_key" ON "User"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "Party_systemCode_key" ON "Party"("systemCode");

-- CreateIndex
CREATE INDEX "Party_type_status_idx" ON "Party"("type", "status");

-- CreateIndex
CREATE INDEX "Party_name_idx" ON "Party"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Item_barcode_key" ON "Item"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ReorderLevel_itemId_holderId_key" ON "ReorderLevel"("itemId", "holderId");

-- CreateIndex
CREATE INDEX "Rate_itemId_direction_validFrom_idx" ON "Rate"("itemId", "direction", "validFrom");

-- CreateIndex
CREATE INDEX "Rate_partyId_idx" ON "Rate"("partyId");

-- CreateIndex
CREATE INDEX "Note_partyId_createdAt_idx" ON "Note"("partyId", "createdAt");

-- CreateIndex
CREATE INDEX "Request_status_type_idx" ON "Request"("status", "type");

-- CreateIndex
CREATE INDEX "Request_assignedToId_dueAt_idx" ON "Request"("assignedToId", "dueAt");

-- CreateIndex
CREATE INDEX "Request_toPartyId_dueAt_idx" ON "Request"("toPartyId", "dueAt");

-- CreateIndex
CREATE INDEX "Request_createdAt_idx" ON "Request"("createdAt");

-- CreateIndex
CREATE INDEX "RequestLine_requestId_idx" ON "RequestLine"("requestId");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_at_idx" ON "RequestEvent"("requestId", "at");

-- CreateIndex
CREATE INDEX "Batch_itemId_receivedAt_idx" ON "Batch"("itemId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Movement_reversesId_key" ON "Movement"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "Movement_clientId_key" ON "Movement"("clientId");

-- CreateIndex
CREATE INDEX "Movement_itemId_toPartyId_idx" ON "Movement"("itemId", "toPartyId");

-- CreateIndex
CREATE INDEX "Movement_itemId_fromPartyId_idx" ON "Movement"("itemId", "fromPartyId");

-- CreateIndex
CREATE INDEX "Movement_kind_occurredAt_idx" ON "Movement"("kind", "occurredAt");

-- CreateIndex
CREATE INDEX "Movement_requestId_idx" ON "Movement"("requestId");

-- CreateIndex
CREATE INDEX "Movement_chequeStatus_chequeDate_idx" ON "Movement"("chequeStatus", "chequeDate");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReorderLevel" ADD CONSTRAINT "ReorderLevel_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReorderLevel" ADD CONSTRAINT "ReorderLevel_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_fromPartyId_fkey" FOREIGN KEY ("fromPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_toPartyId_fkey" FOREIGN KEY ("toPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestLine" ADD CONSTRAINT "RequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestLine" ADD CONSTRAINT "RequestLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_byId_fkey" FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_fromPartyId_fkey" FOREIGN KEY ("fromPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_toPartyId_fkey" FOREIGN KEY ("toPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "Movement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_byId_fkey" FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
