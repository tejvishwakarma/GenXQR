-- Support conversations.
--
-- Until now a ticket held exactly one message and every reply happened over email,
-- so a customer could see a status change but never the answer. TicketMessage turns
-- a ticket into a thread that both sides can read and add to.
--
-- Existing tickets are backfilled with their opening message so no history is lost
-- and the thread is complete from the first entry. support_tickets.message is left
-- in place rather than dropped: dropping it would destroy the only copy if this
-- migration were ever rolled back, and anything still reading it keeps working.

CREATE TABLE "ticket_messages" (
    "id"        TEXT NOT NULL,
    "ticketId"  TEXT NOT NULL,
    "authorId"  TEXT,
    "isStaff"   BOOLEAN NOT NULL DEFAULT false,
    "body"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_messages_ticketId_createdAt_idx" ON "ticket_messages"("ticketId", "createdAt");

ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the opening message becomes the first entry in each thread, authored by
-- the person who raised the ticket and carrying the ticket's own creation time so
-- ordering stays truthful.
INSERT INTO "ticket_messages" ("id", "ticketId", "authorId", "isStaff", "body", "createdAt")
SELECT
    'seed_' || "id",
    "id",
    "userId",
    false,
    "message",
    "createdAt"
FROM "support_tickets";
