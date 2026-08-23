-- WhatsApp Business App contact-state synchronization.
--
-- smb_app_state_sync reports the Business App address-book state:
--
--   action=add    -> contact added OR edited
--   action=remove -> contact removed from the app address book
--
-- A WhatsApp address-book removal must NOT delete the CRM contact.
-- CRM contacts may own conversations, messages, deals, notes, tags,
-- automations and other business history.
--
-- The state table acts as:
--   - source-state/tombstone tracking;
--   - stale-event protection;
--   - a way to distinguish names controlled by app sync from names
--     manually curated inside the CRM.

CREATE TABLE IF NOT EXISTS public.whatsapp_app_contact_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  account_id UUID NOT NULL
    REFERENCES public.accounts(id)
    ON DELETE CASCADE,

  phone_number_id TEXT NOT NULL,

  phone TEXT NOT NULL,

  phone_normalized TEXT
    GENERATED ALWAYS AS (
      regexp_replace(phone, '\D', '', 'g')
    ) STORED,

  full_name TEXT,
  first_name TEXT,

  is_present BOOLEAN NOT NULL DEFAULT true,

  last_action TEXT NOT NULL
    CHECK (last_action IN ('add', 'remove')),

  last_event_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (
    account_id,
    phone_number_id,
    phone_normalized
  )
);

CREATE INDEX IF NOT EXISTS
  idx_whatsapp_app_contact_state_account
ON public.whatsapp_app_contact_state (
  account_id,
  phone_number_id,
  last_event_at
);

ALTER TABLE public.whatsapp_app_contact_state
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON public.whatsapp_app_contact_state
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE
ON public.whatsapp_app_contact_state
TO service_role;


CREATE OR REPLACE FUNCTION public.apply_whatsapp_app_contact_sync(
  p_account_id UUID,
  p_user_id UUID,
  p_phone_number_id TEXT,
  p_events JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_event JSONB;

  v_phone TEXT;
  v_phone_normalized TEXT;
  v_action TEXT;
  v_full_name TEXT;
  v_first_name TEXT;
  v_display_name TEXT;
  v_event_at TIMESTAMPTZ;

  v_state public.whatsapp_app_contact_state%ROWTYPE;

  v_contact_id UUID;
  v_contact_phone TEXT;
  v_contact_name TEXT;

  v_previous_sync_name TEXT;

  v_processed INTEGER := 0;
  v_created INTEGER := 0;
  v_renamed INTEGER := 0;
  v_removed INTEGER := 0;
  v_duplicate INTEGER := 0;
  v_stale INTEGER := 0;
  v_name_preserved INTEGER := 0;
BEGIN
  IF jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'p_events must be a JSON array';
  END IF;

  FOR v_event IN
    SELECT value
    FROM jsonb_array_elements(p_events)
  LOOP
    v_phone :=
      NULLIF(BTRIM(v_event ->> 'phone'), '');

    v_phone_normalized :=
      regexp_replace(
        COALESCE(v_phone, ''),
        '\D',
        '',
        'g'
      );

    v_action :=
      LOWER(
        COALESCE(v_event ->> 'action', '')
      );

    v_full_name :=
      NULLIF(
        BTRIM(v_event ->> 'full_name'),
        ''
      );

    v_first_name :=
      NULLIF(
        BTRIM(v_event ->> 'first_name'),
        ''
      );

    v_event_at :=
      (v_event ->> 'event_at')::TIMESTAMPTZ;

    IF
      v_phone IS NULL
      OR v_phone_normalized = ''
      OR v_action NOT IN ('add', 'remove')
      OR v_event_at IS NULL
    THEN
      RAISE EXCEPTION
        'invalid sanitized smb_app_state_sync event: %',
        v_event;
    END IF;

    v_processed := v_processed + 1;

    SELECT *
    INTO v_state
    FROM public.whatsapp_app_contact_state
    WHERE account_id = p_account_id
      AND phone_number_id = p_phone_number_id
      AND phone_normalized = v_phone_normalized
    FOR UPDATE;

    IF FOUND THEN
      IF v_event_at < v_state.last_event_at THEN
        v_stale := v_stale + 1;
        CONTINUE;
      END IF;

      IF v_event_at = v_state.last_event_at THEN
        v_duplicate := v_duplicate + 1;
        CONTINUE;
      END IF;

      v_previous_sync_name :=
        COALESCE(
          NULLIF(BTRIM(v_state.full_name), ''),
          NULLIF(BTRIM(v_state.first_name), '')
        );

      UPDATE public.whatsapp_app_contact_state
      SET
        phone = v_phone,

        full_name = CASE
          WHEN v_action = 'add'
            THEN v_full_name
          ELSE full_name
        END,

        first_name = CASE
          WHEN v_action = 'add'
            THEN v_first_name
          ELSE first_name
        END,

        is_present = (v_action = 'add'),
        last_action = v_action,
        last_event_at = v_event_at,
        updated_at = NOW()
      WHERE id = v_state.id;

    ELSE
      v_previous_sync_name := NULL;

      INSERT INTO public.whatsapp_app_contact_state (
        account_id,
        phone_number_id,
        phone,
        full_name,
        first_name,
        is_present,
        last_action,
        last_event_at
      )
      VALUES (
        p_account_id,
        p_phone_number_id,
        v_phone,

        CASE
          WHEN v_action = 'add'
            THEN v_full_name
          ELSE NULL
        END,

        CASE
          WHEN v_action = 'add'
            THEN v_first_name
          ELSE NULL
        END,

        (v_action = 'add'),
        v_action,
        v_event_at
      );
    END IF;


    -- Removal is a tombstone only.
    --
    -- Never DELETE the CRM contact: it may own durable CRM history.
    IF v_action = 'remove' THEN
      v_removed := v_removed + 1;
      CONTINUE;
    END IF;


    v_display_name :=
      COALESCE(
        v_full_name,
        v_first_name,
        v_phone
      );


    -- Exact normalized lookup. contacts has the authoritative
    -- UNIQUE(account_id, phone_normalized) guarantee from migration 022.
    SELECT
      id,
      phone,
      name
    INTO
      v_contact_id,
      v_contact_phone,
      v_contact_name
    FROM public.contacts
    WHERE account_id = p_account_id
      AND phone_normalized = v_phone_normalized
    FOR UPDATE;


    IF NOT FOUND THEN
      INSERT INTO public.contacts (
        account_id,
        user_id,
        phone,
        name
      )
      VALUES (
        p_account_id,
        p_user_id,
        v_phone,
        v_display_name
      );

      v_created := v_created + 1;
      CONTINUE;
    END IF;


    -- Protect names curated manually in the CRM.
    --
    -- App sync may replace the current name only when:
    --
    -- 1. there is no useful CRM name;
    -- 2. CRM still shows the phone-number placeholder; or
    -- 3. CRM still has exactly the previous app-synced name.
    --
    -- Once a human gives the CRM contact a different name, that
    -- manual value wins over later WhatsApp address-book changes.
    IF
      NULLIF(BTRIM(v_contact_name), '') IS NULL
      OR BTRIM(v_contact_name) = BTRIM(v_contact_phone)
      OR BTRIM(v_contact_name) = v_phone_normalized
      OR (
        v_previous_sync_name IS NOT NULL
        AND BTRIM(v_contact_name) =
            BTRIM(v_previous_sync_name)
      )
    THEN
      IF v_contact_name IS DISTINCT FROM v_display_name THEN
        UPDATE public.contacts
        SET
          name = v_display_name,
          updated_at = NOW()
        WHERE id = v_contact_id;

        v_renamed := v_renamed + 1;
      END IF;
    ELSE
      v_name_preserved :=
        v_name_preserved + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'created', v_created,
    'renamed', v_renamed,
    'removed', v_removed,
    'duplicate', v_duplicate,
    'stale', v_stale,
    'name_preserved', v_name_preserved
  );
END;
$$;


REVOKE ALL
ON FUNCTION public.apply_whatsapp_app_contact_sync(
  UUID,
  UUID,
  TEXT,
  JSONB
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.apply_whatsapp_app_contact_sync(
  UUID,
  UUID,
  TEXT,
  JSONB
)
TO service_role;
