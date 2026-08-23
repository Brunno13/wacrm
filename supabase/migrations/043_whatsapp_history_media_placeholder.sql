-- WhatsApp Coexistence historical media.
--
-- Initial history chunks represent media as `media_placeholder`,
-- without a Meta media asset ID. A later field=history webhook can
-- deliver the real message type + Media ID.
--
-- This flag lets the second webhook update ONLY a message that was
-- explicitly accepted by our history cutoff.

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS history_media_pending boolean
NOT NULL
DEFAULT false;

COMMENT ON COLUMN public.messages.history_media_pending IS
  'True while a WhatsApp Coexistence history media_placeholder is waiting for its separate media-detail webhook.';

CREATE INDEX IF NOT EXISTS idx_messages_history_media_pending
  ON public.messages (message_id)
  WHERE history_media_pending = true;
