// app/api/cron/calculate-scores/route.ts
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { calculateScores } from '@/lib/actions/cron'

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
    const url = new URL(request.url)
    const paramGw = url.searchParams.get('gw')
    let targetGwParam: number | undefined

    if (paramGw) {
      targetGwParam = parseInt(paramGw, 10)
    }

    const result = await calculateScores(targetGwParam)

    return NextResponse.json({
      success: true,
      message: result.message || `Successfully graded predictions, applied penalties, and updated leaderboard for Gameweek ${result.gw}!`,
      users_processed: result.users_processed,
    })
  } catch (error: any) {
    console.error('Grading Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'An unknown error occurred' },
      { status: 500 }
    )
  }
}