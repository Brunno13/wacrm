-- WhatsApp Coexistence state.
--
-- edited_at / revoked_at preserve the lifecycle of an original WhatsApp
-- message without creating synthetic replacement rows.
--
-- coexistence_history_from is nullable by design:
--   NULL      = do not import Coexistence history
--   timestamp = import only messages at/after that instant

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS coexistence_history_from timestamptz;

COMMENT ON COLUMN public.messages.edited_at IS
  'Timestamp of the latest accepted WhatsApp edit event for this message.';

COMMENT ON COLUMN public.messages.revoked_at IS
  'Timestamp when WhatsApp reported that this message was revoked/deleted.';

COMMENT ON COLUMN public.whatsapp_config.coexistence_history_from IS
  'Earliest WhatsApp Coexistence history timestamp to import; NULL disables history import.';
