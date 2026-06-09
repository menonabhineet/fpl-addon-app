// app/api/cron/sync-results/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // 1. Fetch live fixture data from the official FPL API
    const response = await fetch('https://fantasy.premierleague.com/api/fixtures/')
    if (!response.ok) throw new Error('Failed to fetch FPL fixtures')
    const allFixtures = await response.json()

    // 2. Filter for fixtures that have actually started
    // We don't need to update matches that haven't kicked off yet
    const activeFixtures = allFixtures.filter((f: any) => f.started === true)

    // 3. Update our database
    // We use a loop to update specific rows rather than a bulk upsert, 
    // ensuring we don't accidentally overwrite schedule data like kickoff times.
    let updateCount = 0;

    for (const fixture of activeFixtures) {
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

      if (!error) updateCount++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully synced ${updateCount} live/completed fixtures.` 
    })

  } catch (error: any) {
    console.error('Sync Results Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}