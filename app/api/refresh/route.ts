// app/api/refresh/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncResults, calculateScores } from '@/lib/actions/cron'

// In-memory rate limiting map. In a serverless environment (like Vercel), this 
// limits rate per-instance. For a Hobby project, this is sufficient to prevent
// immediate spam from a single user without needing a DB lookup.
const rateLimitMap = new Map<string, number>()
const RATE_LIMIT_MS = 60 * 1000 // 60 seconds

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // 1. Authenticate the User
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // 2. Check Global Rate Limit (Global or Per-User)
    // We will use a global rate limit key so that if one user refreshes, 
    // it blocks everyone from spamming for 60 seconds (since data is shared anyway).
    const now = Date.now()
    const lastRefresh = rateLimitMap.get('global') || 0

    if (now - lastRefresh < RATE_LIMIT_MS) {
      const waitTime = Math.ceil((RATE_LIMIT_MS - (now - lastRefresh)) / 1000)
      return NextResponse.json(
        { success: false, error: `Please wait ${waitTime} seconds before refreshing again.` },
        { status: 429 }
      )
    }

    // 3. Update the rate limit timestamp
    rateLimitMap.set('global', now)

    // 4. Perform Data Fetching and Score Calculation
    const updateCount = await syncResults()
    const scoresResult = await calculateScores()

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${updateCount} fixtures and recalculated scores.`,
      scoresResult
    })

  } catch (error: any) {
    console.error('Manual Refresh Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'An unknown error occurred during refresh' },
      { status: 500 }
    )
  }
}
