-- ============ WHATSAPP BOT STATE ============
-- conversations/messages already existed in the original schema but were
-- never used by any UI or backend flow. Adding just what the bot needs to
-- track "which step of the scripted flow is this phone number on" between
-- separate inbound webhook calls (each message is its own HTTP request —
-- state has to live in the DB, not in memory).
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS bot_state jsonb;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS bot_active boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.conversations.bot_state IS 'Scripted WhatsApp bot flow state: { step: string, collected: {...} }. Cleared once handed off to a human or the lead is created.';
COMMENT ON COLUMN public.conversations.bot_active IS 'False once a staff member replies from inside the CRM inbox, or the flow completes — stops the bot from talking over a human.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_clinic_phone ON public.conversations(clinic_id, phone);
