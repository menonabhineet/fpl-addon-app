'use server'

import { createClient } from '@/lib/supabase/server'

export async function getManagerPastPicks(managerId: string) {
  try {
    const supabase = await createClient()
    
    // Check if authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized request.')

    // 1. Get gameweeks where deadline has passed
    const now = new Date().toISOString()
    const { data: gameweeks } = await supabase
      .from('gameweeks')
      .select('id, deadline_time')
      .lte('deadline_time', now)

    if (!gameweeks || gameweeks.length === 0) return { success: true, data: {} }

    const pastGwIds = gameweeks.map(gw => gw.id)

    // 2. Get Score Picks for past fixtures
    const { data: pastFixtures } = await supabase
      .from('fixtures')
      .select('id, gameweek_id, home_team:home_team_id(short_name), away_team:away_team_id(short_name)')
      .in('gameweek_id', pastGwIds)
    
    const pastFixtureIds = pastFixtures?.map(f => f.id) || []

    let scorePicks: any[] = []
    if (pastFixtureIds.length > 0) {
      const { data } = await supabase
        .from('score_predictions')
        .select('*')
        .eq('user_id', managerId)
        .in('fixture_id', pastFixtureIds)
      scorePicks = data || []
    }

    // 3. Get Team Picks
    const { data: teamPicks } = await supabase
      .from('team_predictions')
      .select('*, team:team_id(name, short_name)')
      .eq('user_id', managerId)
      .in('gameweek_id', pastGwIds)

    // 4. Get Fantastic Four
    const { data: f4Picks } = await supabase
      .from('fantastic_four')
      .select('*')
      .eq('user_id', managerId)
      .in('gameweek_id', pastGwIds)

    // Fetch team short names for the f4 picks
    const f4PlayerIds = f4Picks?.map(p => p.player_id) || []
    const playersMap: Record<number, string> = {}
    if (f4PlayerIds.length > 0) {
      const { data: players } = await supabase
        .from('players')
        .select('id, teams:team_id(short_name)')
        .in('id', f4PlayerIds)
        
      if (players) {
        players.forEach(p => {
          const team = Array.isArray(p.teams) ? p.teams[0] : p.teams
          playersMap[p.id] = team?.short_name || ''
        })
      }
    }

    // Format data by gameweek
    const picksByGw: Record<number, any> = {}
    
    pastGwIds.forEach(gwId => {
      picksByGw[gwId] = {
        scorePicks: [],
        teamPick: teamPicks?.find(tp => tp.gameweek_id === gwId) || null,
        f4Picks: f4Picks?.filter(f4 => f4.gameweek_id === gwId).map(f4 => ({
          ...f4,
          team_short_name: playersMap[f4.player_id] || ''
        })) || []
      }
    })

    if (scorePicks.length > 0 && pastFixtures) {
      scorePicks.forEach(pick => {
        const fixture = pastFixtures.find(f => f.id === pick.fixture_id)
        if (fixture && fixture.gameweek_id) {
          const home = fixture.home_team as any
          const away = fixture.away_team as any
          picksByGw[fixture.gameweek_id].scorePicks.push({
            ...pick,
            home_team: Array.isArray(home) ? home[0]?.short_name : home?.short_name,
            away_team: Array.isArray(away) ? away[0]?.short_name : away?.short_name
          })
        }
      })
    }

    return { success: true, data: picksByGw }

  } catch (error: any) {
    console.error('Error fetching manager picks:', error)
    return { success: false, error: error.message }
  }
}
