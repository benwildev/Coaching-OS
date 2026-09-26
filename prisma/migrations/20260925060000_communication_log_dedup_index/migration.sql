-- CreateIndex
-- Idempotency guard for guardian dispatch, mirroring the existing
-- (recipient, sourceType, sourceId, type) unique indexes on "notifications".
-- Prevents a retried mutation (e.g. a re-saved attendance session) from
-- creating a second real SMS/WhatsApp/Email attempt for the same event.
CREATE UNIQUE INDEX "communication_logs_guardianId_channel_event_sourceType_sourceId_key" ON "communication_logs"("guardianId", "channel", "event", "sourceType", "sourceId");
