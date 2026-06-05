// app/api/cron/sync-fixtures/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchFixtures } from '@/lib/fpl-api';

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient();
    const fixturesRaw = await fetchFixtures();

    // 1. Transform and filter out postponed matches without a scheduled gameweek
    const fixturesData = fixturesRaw
      .filter((match: any) => match.event !== null)
      .map((match: any) => ({
        id: match.id,
        gameweek_id: match.event,
        home_team_id: match.team_h,
        away_team_id: match.team_a,
        home_score: match.team_h_score,
        away_score: match.team_a_score,
        kickoff_time: match.kickoff_time,
        is_finished: match.finished,
      }));

    // 2. Load into Database
    const { error } = await supabase
      .from('fixtures')
      .upsert(fixturesData);

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      message: 'Fixtures synced successfully', 
      matches_processed: fixturesData.length 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}