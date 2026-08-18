export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60


import { NextResponse } from 'next/server'
import { syncResults, calculateScores, calculateActiveScoresWindow } from '@/lib/actions/cron'

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
    // 1.5 Auto-sync latest finished match scores before grading
    await syncResults().catch(err => console.warn('Fixture auto-sync warning before grading:', err))

    const url = new URL(request.url)
    const paramGw = url.searchParams.get('gw')

    if (paramGw) {
      const targetGwParam = parseInt(paramGw, 10)
      const result = await calculateScores(targetGwParam)
      return NextResponse.json({
        success: true,
        message: result.message || `Successfully graded predictions for Gameweek ${result.gw}!`,
        users_processed: result.users_processed,
        gw: result.gw
      })
    }

    // Default cron behavior: Run sequential multi-gameweek window grading (lookback + active GW)
    const windowResult = await calculateActiveScoresWindow(1)

    return NextResponse.json({
      success: true,
      message: `Successfully graded Gameweek window (${windowResult.gradedWindow}).`,
      details: windowResult
    })
  } catch (error: any) {
    console.error('Grading Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'An unknown error occurred' },
      { status: 500 }
    )
  }
}