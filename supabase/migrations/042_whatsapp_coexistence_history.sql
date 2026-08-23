-- WhatsApp Coexistence history import helpers.
--
-- Historical messages must never increment unread_count, trigger AI,
-- reopen conversations or regress an already newer live conversation.

CREATE OR REPLACE FUNCTION public.advance_conversation_from_history(
  p_conversation_id uuid,
  p_last_message_text text,
  p_last_message_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_last_message_at IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.conversations
  SET
    last_message_text = p_last_message_text,
    last_message_at = p_last_message_at,
    updated_at = now()
  WHERE id = p_conversation_id
    AND (
      last_message_at IS NULL
      OR last_message_at < p_last_message_at
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_conversation_from_history(
  uuid,
  text,
  timestamptz
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.advance_conversation_from_history(
  uuid,
  text,
  timestamptz
) FROM anon;

REVOKE ALL ON FUNCTION public.advance_conversation_from_history(
  uuid,
  text,
  timestamptz
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.advance_conversation_from_history(
  uuid,
  text,
  timestamptz
) TO service_role;
