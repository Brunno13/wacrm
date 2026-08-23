-- Hardening for internal WhatsApp Coexistence state/history tables.
--
-- These tables are implementation details and must never be accessed
-- directly by browser clients (anon/authenticated).
--
-- message_edits is exposed to authenticated users exclusively through
-- the account-scoped server endpoint:
--
--   GET /api/conversations/:conversationId/message-edits
--
-- whatsapp_app_contact_state is used exclusively by the webhook
-- service-role RPC.
--
-- RLS + explicit ACL revocation provides defense in depth if Supabase
-- default privileges change or are accidentally reapplied later.


-- ============================================================
-- message_edits
-- ============================================================

ALTER TABLE public.message_edits
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE public.message_edits
FROM PUBLIC, anon, authenticated, service_role;

-- Append-only audit history.
--
-- service_role needs:
--   SELECT -> authenticated server-side history endpoint
--   INSERT -> apply_whatsapp_message_edit() RPC
--
-- No direct UPDATE/DELETE/TRUNCATE is required.
GRANT SELECT, INSERT
ON TABLE public.message_edits
TO service_role;


-- ============================================================
-- whatsapp_app_contact_state
-- ============================================================

-- RLS was already enabled by migration 044, but keep this
-- idempotent here so the security contract is explicit.
ALTER TABLE public.whatsapp_app_contact_state
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE public.whatsapp_app_contact_state
FROM PUBLIC, anon, authenticated, service_role;

-- The app-state-sync RPC needs to read, insert and update state.
-- Removal from the WhatsApp address book is represented as a
-- tombstone UPDATE, never as DELETE.
GRANT SELECT, INSERT, UPDATE
ON TABLE public.whatsapp_app_contact_state
TO service_role;
