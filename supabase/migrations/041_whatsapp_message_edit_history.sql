-- WhatsApp Coexistence message edit history.
--
-- messages continues to hold the current/latest representation.
-- message_edits keeps every accepted previous -> new transition.
--
-- Media objects are deliberately NOT deleted or archived here.
-- Physical media retention/archiving will be designed separately.

CREATE TABLE IF NOT EXISTS public.message_edits (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  message_id uuid NOT NULL
    REFERENCES public.messages(id)
    ON DELETE CASCADE,

  edit_event_id text NOT NULL,

  previous_content_text text,
  new_content_text text,

  content_type text NOT NULL,

  edited_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT message_edits_edit_event_id_key
    UNIQUE (edit_event_id)
);

CREATE INDEX IF NOT EXISTS idx_message_edits_message_time
  ON public.message_edits (message_id, edited_at);

COMMENT ON TABLE public.message_edits IS
  'Accepted WhatsApp Coexistence edit history for messages.';

COMMENT ON COLUMN public.message_edits.edit_event_id IS
  'Meta smb_message_echoes event/message ID used as the idempotency key.';

COMMENT ON COLUMN public.message_edits.previous_content_text IS
  'Message text/caption immediately before this accepted edit.';

COMMENT ON COLUMN public.message_edits.new_content_text IS
  'Message text/caption produced by this accepted edit.';

-- Apply an edit atomically.
--
-- The row is locked so concurrent edits cannot both record the same
-- "previous" version or regress edited_at.
CREATE OR REPLACE FUNCTION public.apply_whatsapp_message_edit(
  p_message_id uuid,
  p_edit_event_id text,
  p_new_content_text text,
  p_content_type text,
  p_edited_at timestamptz
)
RETURNS TABLE (
  applied boolean,
  reason text,
  previous_content_text text,
  current_content_text text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_message public.messages%ROWTYPE;
BEGIN
  SELECT *
    INTO v_message
  FROM public.messages
  WHERE id = p_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
      SELECT false, 'not_found', NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_message.revoked_at IS NOT NULL THEN
    RETURN QUERY
      SELECT
        false,
        'revoked',
        v_message.content_text,
        v_message.content_text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.message_edits
    WHERE edit_event_id = p_edit_event_id
  ) THEN
    RETURN QUERY
      SELECT
        false,
        'duplicate',
        v_message.content_text,
        v_message.content_text;
    RETURN;
  END IF;

  IF v_message.edited_at IS NOT NULL
     AND v_message.edited_at >= p_edited_at THEN
    RETURN QUERY
      SELECT
        false,
        'stale',
        v_message.content_text,
        v_message.content_text;
    RETURN;
  END IF;

  INSERT INTO public.message_edits (
    message_id,
    edit_event_id,
    previous_content_text,
    new_content_text,
    content_type,
    edited_at
  )
  VALUES (
    v_message.id,
    p_edit_event_id,
    v_message.content_text,
    p_new_content_text,
    p_content_type,
    p_edited_at
  );

  UPDATE public.messages
  SET
    content_text = p_new_content_text,
    edited_at = p_edited_at
  WHERE id = v_message.id;

  RETURN QUERY
    SELECT
      true,
      'applied',
      v_message.content_text,
      p_new_content_text;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_whatsapp_message_edit(
  uuid,
  text,
  text,
  text,
  timestamptz
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.apply_whatsapp_message_edit(
  uuid,
  text,
  text,
  text,
  timestamptz
) FROM anon;

REVOKE ALL ON FUNCTION public.apply_whatsapp_message_edit(
  uuid,
  text,
  text,
  text,
  timestamptz
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.apply_whatsapp_message_edit(
  uuid,
  text,
  text,
  text,
  timestamptz
) TO service_role;
