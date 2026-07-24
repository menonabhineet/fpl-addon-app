// app/api/cron/sync-results/route.ts
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    // 2. Use Admin Client to bypass RLS for background cron jobs
    const supabase = createAdminClient()

    // 3. Fetch live fixture data from the official FPL API
    const response = await fetch('https://fantasy.premierleague.com/api/fixtures/', { cache: 'no-store' })
    if (!response.ok) throw new Error('Failed to fetch FPL fixtures')
    const allFixtures = await response.json()

    // 4. Filter for fixtures that have actually started
    const activeFixtures = allFixtures.filter((f: any) => f.started === true)

    let updateCount = 0;

    // 5. Use Promise.all to run updates concurrently to avoid Vercel timeouts
    const updatePromises = activeFixtures.map(async (fixture: any) => {
      const { error } = await supabase
        .from('fixtures')
        .update({
          home_score: fixture.team_h_score ?? 0,
          away_score: fixture.team_a_score ?? 0,
          // FPL uses 'finished_provisional' while points are being calculated, 
          // but we treat both as finished for our score prediction purposes.
          is_finished: fixture.finished || fixture.finished_provisional
        })
        .eq('id', fixture.id)

      if (error) {
        console.error(`Error updating fixture ${fixture.id}:`, error)
      } else {
        updateCount++;
      }
    })

    // Execute all updates simultaneously
    await Promise.all(updatePromises)

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${updateCount} live/completed fixtures.`
    })

  } catch (error: any) {
    console.error('Sync Results Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}