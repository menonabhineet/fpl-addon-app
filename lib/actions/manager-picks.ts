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
      .range(0, 9999)

    if (!gameweeks || gameweeks.length === 0) return { success: true, data: {} }

    const pastGwIds = gameweeks.map(gw => gw.id)

    // 2. Get Score Picks for past fixtures
    const { data: pastFixtures } = await supabase
      .from('fixtures')
      .select('id, gameweek_id, home_team_id, away_team_id, home_score, away_score, is_finished, home_team:home_team_id(short_name), away_team:away_team_id(short_name)')
      .in('gameweek_id', pastGwIds)
      .range(0, 9999)
    
    const pastFixtureIds = pastFixtures?.map(f => f.id) || []

    let scorePicks: any[] = []
    if (pastFixtureIds.length > 0) {
      const { data } = await supabase
        .from('score_predictions')
        .select('*')
        .eq('user_id', managerId)
        .in('fixture_id', pastFixtureIds)
        .range(0, 9999)
      scorePicks = data || []
    }

    // 3. Get Team Picks
    const { data: teamPicks } = await supabase
      .from('team_predictions')
      .select('*, team:team_id(name, short_name)')
      .eq('user_id', managerId)
      .in('gameweek_id', pastGwIds)
      .range(0, 9999)

    // 4. Get Fantastic Four
    const { data: f4Picks } = await supabase
      .from('fantastic_four')
      .select('*')
      .eq('user_id', managerId)
      .in('gameweek_id', pastGwIds)
      .range(0, 9999)

    // Fetch team short names and team IDs for the f4 picks
    const f4PlayerIds = f4Picks?.map(p => p.player_id) || []
    const playersMap: Record<number, { short_name: string; team_id: number | null }> = {}
    if (f4PlayerIds.length > 0) {
      const { data: players } = await supabase
        .from('players')
        .select('id, team_id, teams:team_id(short_name)')
        .in('id', f4PlayerIds)
        .range(0, 9999)
        
      if (players) {
        players.forEach(p => {
          const team = Array.isArray(p.teams) ? p.teams[0] : p.teams
          playersMap[p.id] = {
            short_name: team?.short_name || '',
            team_id: p.team_id || null
          }
        })
      }
    }

    // Format data by gameweek
    const picksByGw: Record<number, any> = {}
    
    pastGwIds.forEach(gwId => {
      const gwTeamPick = teamPicks?.find(tp => tp.gameweek_id === gwId) || null
      let teamPickFinished = false
      let teamPickStarted = false
      if (gwTeamPick && pastFixtures) {
        const teamFix = pastFixtures.filter(f => f.gameweek_id === gwId && (f.home_team_id === gwTeamPick.team_id || f.away_team_id === gwTeamPick.team_id))
        teamPickFinished = teamFix.length > 0 && teamFix.every(f => f.is_finished)
        teamPickStarted = teamFix.some(f => f.is_finished || (f.home_score !== null && f.away_score !== null))
      }

      picksByGw[gwId] = {
        scorePicks: [],
        teamPick: gwTeamPick ? {
          ...gwTeamPick,
          is_finished: teamPickFinished,
          has_started: teamPickStarted
        } : null,
        f4Picks: f4Picks?.filter(f4 => f4.gameweek_id === gwId).map(f4 => {
          const pInfo = playersMap[f4.player_id]
          const pTeamId = pInfo?.team_id
          const pFixtures = pastFixtures?.filter(f => f.gameweek_id === gwId && (f.home_team_id === pTeamId || f.away_team_id === pTeamId)) || []
          const isFinished = pFixtures.length > 0 && pFixtures.every(f => f.is_finished)
          const hasStarted = pFixtures.some(f => f.is_finished || (f.home_score !== null && f.away_score !== null))

          return {
            ...f4,
            team_short_name: pInfo?.short_name || '',
            is_finished: isFinished,
            has_started: hasStarted
          }
        }) || []
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
            away_team: Array.isArray(away) ? away[0]?.short_name : away?.short_name,
            home_score: fixture.home_score,
            away_score: fixture.away_score,
            is_finished: fixture.is_finished,
            has_started: fixture.is_finished || (fixture.home_score !== null && fixture.away_score !== null),
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

export async function getAllPicksForGameweek(gameweekId: number) {
  try {
    const supabase = await createClient()
    
    // Check if authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized request.')

    // 1. Get gameweek deadline
    const { data: gwData } = await supabase
      .from('gameweeks')
      .select('deadline_time')
      .eq('id', gameweekId)
      .single()
      
    const now = new Date().toISOString()
    const deadlinePassed = !!gwData && gwData.deadline_time <= now

    // 2. Get Score Picks for this gameweek
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id, is_finished, home_score, away_score, home_team:home_team_id(short_name), away_team:away_team_id(short_name)')
      .eq('gameweek_id', gameweekId)
      .range(0, 9999)
    
    const fixtureIds = fixtures?.map(f => f.id) || []

    let scorePicks: any[] = []
    if (fixtureIds.length > 0) {
      const { data } = await supabase
        .from('score_predictions')
        .select('*')
        .in('fixture_id', fixtureIds)
        .range(0, 9999)
      
      // Enrich score picks with team names and fixture status
      if (data && fixtures) {
        scorePicks = data.map(pick => {
          const fixture = fixtures.find(f => f.id === pick.fixture_id)
          if (fixture) {
            const home = fixture.home_team as any
            const away = fixture.away_team as any
            return {
              ...pick,
              home_team: Array.isArray(home) ? home[0]?.short_name : home?.short_name,
              away_team: Array.isArray(away) ? away[0]?.short_name : away?.short_name,
              is_finished: fixture.is_finished,
              home_score: fixture.home_score,
              away_score: fixture.away_score,
            }
          }
          return pick
        })
      }
    }

    // 3. Get Team Picks
    const { data: teamPicks } = await supabase
      .from('team_predictions')
      .select('*, team:team_id(name, short_name)')
      .eq('gameweek_id', gameweekId)
      .range(0, 9999)

    // 4. Get Fantastic Four
    const { data: f4Picks } = await supabase
      .from('fantastic_four')
      .select('*')
      .eq('gameweek_id', gameweekId)
      .range(0, 9999)

    // 5. Get Survivor Status for the round covering this gameweek
    const { data: activeRound } = await supabase
      .from('survivor_rounds')
      .select('id')
      .lte('start_gameweek_id', gameweekId)
      .order('start_gameweek_id', { ascending: false })
      .limit(1)
      .maybeSingle()

    let survivorEntriesQuery = supabase
      .from('survivor_entries')
      .select('user_id, status, eliminated_gameweek_id, round_id')
      .range(0, 9999)

    if (activeRound?.id) {
      survivorEntriesQuery = survivorEntriesQuery.eq('round_id', activeRound.id)
    }

    const { data: survivorEntries } = await survivorEntriesQuery

    // Fetch team short names for the f4 picks
    const f4PlayerIds = f4Picks?.map(p => p.player_id) || []
    const playersMap: Record<number, string> = {}
    if (f4PlayerIds.length > 0) {
      const { data: players } = await supabase
        .from('players')
        .select('id, teams:team_id(short_name)')
        .in('id', f4PlayerIds)
        .range(0, 9999)
        
      if (players) {
        players.forEach(p => {
          const team = Array.isArray(p.teams) ? p.teams[0] : p.teams
          playersMap[p.id] = team?.short_name || ''
        })
      }
    }

    // Format data by user
    const picksByUser: Record<string, any> = {}
    
    // Collect all user IDs from profiles and submissions
    const allUserIds = new Set<string>()
    scorePicks.forEach(p => allUserIds.add(p.user_id))
    teamPicks?.forEach(p => allUserIds.add(p.user_id))
    f4Picks?.forEach(p => allUserIds.add(p.user_id))
    survivorEntries?.forEach(s => allUserIds.add(s.user_id))

    const { data: allProfiles } = await supabase.from('profiles').select('id').range(0, 9999)
    allProfiles?.forEach(p => allUserIds.add(p.id))

    allUserIds.forEach(userId => {
      const isCurrentUser = userId === user.id
      const shouldReveal = deadlinePassed || isCurrentUser

      const userSurvivor = survivorEntries?.find(s => s.user_id === userId)

      picksByUser[userId] = {
        scorePicks: shouldReveal ? scorePicks.filter(p => p.user_id === userId) : null,
        teamPick: shouldReveal ? (teamPicks?.find(p => p.user_id === userId) || null) : null,
        f4Picks: shouldReveal ? (f4Picks?.filter(p => p.user_id === userId).map(f4 => ({
          ...f4,
          team_short_name: playersMap[f4.player_id] || ''
        })) || []) : null,
        isRevealed: shouldReveal,
        isCurrentUser,
        survivorStatus: userSurvivor?.status || null,
        eliminatedGameweekId: userSurvivor?.eliminated_gameweek_id || null
      }
    })

    return { success: true, data: picksByUser, deadlinePassed }

  } catch (error: any) {
    console.error('Error fetching all gameweek picks:', error)
    return { success: false, error: error.message }
  }
}
