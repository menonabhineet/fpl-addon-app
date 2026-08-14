// app/api/cron/sync-static/route.ts
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchBootstrapStatic } from '@/lib/fpl-api';

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
    const data = await fetchBootstrapStatic();

    // 1. Transform and Load Teams
    const teamsData = data.teams.map((team: any) => ({
      id: team.id,
      name: team.name,
      short_name: team.short_name,
      code: team.code,
      position: team.position,
    }));

    const { error: teamsError } = await supabase
      .from('teams')
      .upsert(teamsData, { onConflict: 'id' });

    if (teamsError) {
      console.error('Teams Sync Error:', teamsError);
      return NextResponse.json(
        {
          success: false,
          step: 'teams',
          error: teamsError.message,
          details: teamsError.details,
          hint: teamsError.hint
        },
        { status: 500 }
      );
    }

    // 2. Transform and Load Gameweeks
    const gameweeksData = data.events.map((gw: any) => ({
      id: gw.id,
      name: gw.name,
      deadline_time: gw.deadline_time,
      is_current: gw.is_current,
      is_finished: gw.finished || false,
    }));

    const { error: gwError } = await supabase
      .from('gameweeks')
      .upsert(gameweeksData, { onConflict: 'id' });

    if (gwError) {
      console.error('Gameweeks Sync Error:', gwError);
      return NextResponse.json(
        {
          success: false,
          step: 'gameweeks',
          error: gwError.message,
          details: gwError.details,
          hint: gwError.hint
        },
        { status: 500 }
      );
    }

    // 3. Transform and Load Players
    const positionMap: Record<number, string> = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

    const playersData = data.elements.map((player: any) => ({
      id: player.id,
      name: player.web_name,
      team_id: player.team,
      position: positionMap[player.element_type] || 'FWD',
    }));

    const { error: playersError } = await supabase
      .from('players')
      .upsert(playersData, { onConflict: 'id' });

    if (playersError) {
      console.error('Players Sync Error:', playersError);
      return NextResponse.json(
        {
          success: false,
          step: 'players',
          error: playersError.message,
          details: playersError.details,
          hint: playersError.hint
        },
        { status: 500 }
      );
    }

    // 4. Ensure Active Survivor Round exists (starts at GW 1 for new season)
    const { data: existingActiveRound } = await supabase
      .from('survivor_rounds')
      .select('id')
      .eq('status', 'active')
      .maybeSingle();

    if (!existingActiveRound) {
      await supabase
        .from('survivor_rounds')
        .insert({ start_gameweek_id: 1, status: 'active' });
    }

    return NextResponse.json({ success: true, message: 'Static data synced successfully' });
  } catch (error: any) {
    console.error('Unhandled Sync-Static Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'An unknown error occurred' },
      { status: 500 }
    );
  }
}