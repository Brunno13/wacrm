import { NextResponse } from 'next/server'

import {
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'

const GRAPH_VERSION = 'v26.0'
const FEATURE_TYPE =
  'whatsapp_business_app_onboarding'
const SESSION_INFO_VERSION = '3'

export async function GET() {
  try {
    await requireRole('admin')
  } catch (error) {
    return toErrorResponse(error)
  }

  const appId =
    process.env.META_APP_ID?.trim()

  const configId =
    process.env
      .WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID
      ?.trim()

  if (!appId || !configId) {
    return NextResponse.json(
      {
        error:
          'Embedded Signup is not configured on this deployment.',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  }

  return NextResponse.json(
    {
      app_id: appId,
      config_id: configId,

      /*
       * Safety contract:
       *
       * The client must use this exact launch selector.
       * A bare Embedded Signup invocation would start the normal
       * Cloud API onboarding/migration path instead of Coexistence.
       */
      feature_type: FEATURE_TYPE,

      session_info_version:
        SESSION_INFO_VERSION,

      graph_version: GRAPH_VERSION,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
