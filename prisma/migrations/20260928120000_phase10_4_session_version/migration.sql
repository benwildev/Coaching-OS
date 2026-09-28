-- Phase 10.4: session revocation support.
-- sessionVersion is bumped on logout, password change/reset, and account
-- status change; every JWT is validated against the DB's current value on
-- every request, so an old/stolen token stops working immediately instead
-- of remaining valid until its 7-day expiry.

-- AlterTable
ALTER TABLE "portal_accounts" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- RenameIndex (pre-existing drift, unrelated to Phase 10.4: brings the
-- deployed index name back in sync with the name Prisma derives from the
-- current schema for the Phase 8 communication-log dedup constraint)
ALTER INDEX "communication_logs_guardianId_channel_event_sourceType_sourceId" RENAME TO "communication_logs_guardianId_channel_event_sourceType_sour_key";
