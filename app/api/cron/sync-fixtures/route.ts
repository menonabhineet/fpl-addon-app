// app/api/cron/sync-fixtures/route.ts
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchFixtures } from '@/lib/fpl-api';

export async function GET(request: Request) {
  // 1. Authorization Guard (Enforced in Production)
  const authHeader = request.headers.get('authorization');
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const fixturesRaw = await fetchFixtures();

    // 2. Transform and filter out postponed matches without a scheduled gameweek
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

    // 3. Load into Database with explicit conflict target
    const { error } = await supabase
      .from('fixtures')
      .upsert(fixturesData, { onConflict: 'id' });

    if (error) {
      console.error('Fixtures Sync Error:', error);
      return NextResponse.json(
        {
          success: false,
          step: 'fixtures',
          error: error.message,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Fixtures synced successfully',
      matches_processed: fixturesData.length,
    });
  } catch (error: any) {
    console.error('Unhandled Sync-Fixtures Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'An unknown error occurred' },
      { status: 500 }
    );
  }
}