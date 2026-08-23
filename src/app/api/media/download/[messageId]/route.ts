import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mediaFilename } from '@/lib/media/filename'
import type { ContentType } from '@/types'

const CHAT_MEDIA_PREFIX = '/storage/v1/object/public/chat-media/'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params

    if (!messageId) {
      return NextResponse.json(
        { error: 'Message ID is required' },
        { status: 400 }
      )
    }

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const accountId = profile?.account_id as string | undefined

    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 }
      )
    }

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select(
        'id, conversation_id, content_type, content_text, media_url, media_type, created_at'
      )
      .eq('id', messageId)
      .maybeSingle()

    if (messageError || !message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    const { data: conversation } = await supabase
      .from('conversations')
      .select('id, account_id')
      .eq('id', message.conversation_id)
      .eq('account_id', accountId)
      .maybeSingle()

    if (!conversation) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    if (!message.media_url) {
      return NextResponse.json(
        { error: 'Message has no media' },
        { status: 404 }
      )
    }

    const configuredSupabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!configuredSupabaseUrl) {
      console.error(
        '[media-download] NEXT_PUBLIC_SUPABASE_URL is not configured'
      )

      return NextResponse.json(
        { error: 'Storage is not configured' },
        { status: 500 }
      )
    }

    let mediaUrl: URL
    let supabaseUrl: URL

    try {
      mediaUrl = new URL(message.media_url)
      supabaseUrl = new URL(configuredSupabaseUrl)
    } catch {
      return NextResponse.json(
        { error: 'Invalid media URL' },
        { status: 400 }
      )
    }

    // Never turn this endpoint into an arbitrary server-side HTTP proxy.
    // Only the configured Supabase origin and the public chat-media bucket
    // are valid download sources.
    if (
      mediaUrl.origin !== supabaseUrl.origin ||
      !mediaUrl.pathname.startsWith(CHAT_MEDIA_PREFIX)
    ) {
      console.warn(
        '[media-download] rejected non chat-media URL for message:',
        messageId
      )

      return NextResponse.json(
        { error: 'Unsupported media source' },
        { status: 400 }
      )
    }

    const upstream = await fetch(mediaUrl.toString(), {
      cache: 'no-store',
    })

    if (!upstream.ok || !upstream.body) {
      console.error(
        '[media-download] storage fetch failed:',
        upstream.status,
        messageId
      )

      return NextResponse.json(
        { error: 'Failed to fetch media' },
        { status: 502 }
      )
    }

    const contentType =
      upstream.headers.get('content-type') ||
      message.media_type ||
      'application/octet-stream'

    const filename = mediaFilename(
      {
        content_type: message.content_type as ContentType,
        content_text: message.content_text ?? undefined,
        media_url: message.media_url,
        media_type: message.media_type,
        created_at: message.created_at,
      },
      contentType
    )

    const headers = new Headers()

    headers.set('Content-Type', contentType)
    headers.set(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    )
    headers.set('Cache-Control', 'private, no-store')

    const contentLength =
      upstream.headers.get('content-length')

    if (contentLength) {
      headers.set('Content-Length', contentLength)
    }

    return new Response(upstream.body, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error('[media-download] unexpected error:', error)

    return NextResponse.json(
      { error: 'Failed to download media' },
      { status: 500 }
    )
  }
}
