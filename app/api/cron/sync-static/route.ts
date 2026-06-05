// app/api/cron/sync-static/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin'; // Switch to admin client
import { fetchBootstrapStatic } from '@/lib/fpl-api';

export async function GET(request: Request) {
  try {
    const supabase = createAdminClient(); // Initialized with service_role key
    const data = await fetchBootstrapStatic();

    // 1. Transform and Load Teams
    const teamsData = data.teams.map((team: any) => ({
      id: team.id,
      name: team.name,
      short_name: team.short_name,
    }));
    
    const { error: teamsError } = await supabase
      .from('teams')
      .upsert(teamsData);

    if (teamsError) throw teamsError;

    // 2. Transform and Load Gameweeks
    const gameweeksData = data.events.map((gw: any) => ({
      id: gw.id,
      name: gw.name,
      deadline_time: gw.deadline_time,
      is_current: gw.is_current,
    }));

    const { error: gwError } = await supabase
      .from('gameweeks')
      .upsert(gameweeksData);

    if (gwError) throw gwError;

    return NextResponse.json({ success: true, message: 'Static data synced successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}