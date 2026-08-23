import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

interface MessageEditHistoryRow {
  message_id: string
  previous_content_text: string | null
  new_content_text: string | null
  content_type: string
  edited_at: string
  created_at: string
}

interface MessageEditHistoryItem {
  previous_content_text: string | null
  new_content_text: string | null
  content_type: string
  edited_at: string
  created_at: string
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      )
    }

    // User-scoped client: authentication and tenant authorization.
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError) {
      console.error(
        '[message-edits] failed to load profile:',
        profileError
      )
      return NextResponse.json(
        { error: 'Failed to load profile' },
        { status: 500 }
      )
    }

    const accountId = profile?.account_id as string | undefined

    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 }
      )
    }

    // Important: validate tenant ownership before using service_role.
    const { data: conversation, error: conversationError } =
      await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('account_id', accountId)
        .maybeSingle()

    if (conversationError) {
      console.error(
        '[message-edits] failed to authorize conversation:',
        conversationError
      )
      return NextResponse.json(
        { error: 'Failed to load conversation' },
        { status: 500 }
      )
    }

    // Deliberately return 404 for both nonexistent and foreign-account
    // conversations so callers cannot use this route for tenant discovery.
    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // message_edits is intentionally an internal table with no client
    // access. service_role is used only after the account check above.
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    const { data, error } = await admin
      .from('message_edits')
      .select(
        `
          message_id,
          previous_content_text,
          new_content_text,
          content_type,
          edited_at,
          created_at,
          messages!inner (
            conversation_id
          )
        `
      )
      .eq('messages.conversation_id', conversationId)
      .order('edited_at', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      console.error(
        '[message-edits] failed to load edit history:',
        error
      )
      return NextResponse.json(
        { error: 'Failed to load message edit history' },
        { status: 500 }
      )
    }

    const histories: Record<string, MessageEditHistoryItem[]> = {}

    for (const row of (data ?? []) as unknown as MessageEditHistoryRow[]) {
      if (!histories[row.message_id]) {
        histories[row.message_id] = []
      }

      histories[row.message_id].push({
        previous_content_text: row.previous_content_text,
        new_content_text: row.new_content_text,
        content_type: row.content_type,
        edited_at: row.edited_at,
        created_at: row.created_at,
      })
    }

    return NextResponse.json(
      {
        conversation_id: conversationId,
        histories,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    )
  } catch (error) {
    console.error(
      '[message-edits] unexpected error:',
      error
    )

    return NextResponse.json(
      { error: 'Failed to load message edit history' },
      { status: 500 }
    )
  }
}
