// app/api/cron/sync-results/route.ts
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { syncResults } from '@/lib/actions/cron'

export async function GET(request: Request) {
  // 1. Authorization Guard (Enforced in Production)
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const updateCount = await syncResults()

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${updateCount} live/completed fixtures.`
    })

  } catch (error: any) {
    console.error('Sync Results Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}