// lib/actions/team-prediction.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function submitTeamPrediction(formData: FormData) {
  try {
    const supabase = await createClient()

    // 1. Authenticate User
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized request. Please log in.')

    // 2. Extract and validate incoming data
    const gameweekId = Number(formData.get('gameweekId'))
    const teamId = Number(formData.get('teamId'))
    const fixtureIdStr = formData.get('fixtureId')
    const fixtureId = fixtureIdStr ? Number(fixtureIdStr) : null

    if (isNaN(gameweekId) || isNaN(teamId)) {
      throw new Error('Invalid input data.')
    }
    
    // 2.5 Block future gameweeks
    const { data: currentGwRecord } = await supabase.from('gameweeks').select('id').eq('is_current', true).maybeSingle()
    if (currentGwRecord && gameweekId > currentGwRecord.id) {
      throw new Error('You can only make a survivor pick for the current active gameweek.')
    }

    // 3. Deadline Validation
    const { data: gameweek, error: gwError } = await supabase
      .from('gameweeks')
      .select('deadline_time, is_survivor_skipped')
      .eq('id', gameweekId)
      .single()

    if (gwError || !gameweek) throw new Error('Gameweek not found.')

    const deadline = new Date(gameweek.deadline_time)
    const now = new Date()

    if (now >= deadline) {
      throw new Error('Gameweek deadline has passed. Predictions are locked.')
    }

    if (gameweek.is_survivor_skipped) {
      throw new Error('Survivor Mode is paused for this gameweek. You do not need to make a pick.')
    }

    // 4. Fixture Constraint Validation (BGW/DGW)
    const { data: allGwFixtures, error: allFixturesError } = await supabase
      .from('fixtures')
      .select('id, home_team_id, away_team_id')
      .eq('gameweek_id', gameweekId)
      
    if (allFixturesError) throw new Error('Failed to fetch gameweek fixtures.')
    
    const teamFixtures = allGwFixtures?.filter(f => f.home_team_id === teamId || f.away_team_id === teamId) || []
    const totalGwFixtures = allGwFixtures?.length || 0
    let validatedFixtureId = null
    let opponentTeamId = null

    if (teamFixtures.length === 0) {
      // Blank Gameweek: Team doesn't play. We allow picking them, but they get 0 pts and will be eliminated.
      validatedFixtureId = null
    } else if (teamFixtures.length === 1) {
      validatedFixtureId = teamFixtures[0].id
      opponentTeamId = teamFixtures[0].home_team_id === teamId ? teamFixtures[0].away_team_id : teamFixtures[0].home_team_id
    } else {
      // Double Gameweek: Must pick one.
      if (!fixtureId) throw new Error('You must select a specific fixture for a Double Gameweek team.')
      const selectedFixture = teamFixtures.find(f => f.id === fixtureId)
      if (!selectedFixture) throw new Error('Invalid fixture selection.')
      validatedFixtureId = fixtureId
      opponentTeamId = selectedFixture.home_team_id === teamId ? selectedFixture.away_team_id : selectedFixture.home_team_id
    }

    // 5. Game Rule Validation: Survivor Streak Mode
    
    // a. Fetch user's historical picks before this gameweek to calculate active streak
    const [{ data: pastPicks }, { data: allGwRecords }] = await Promise.all([
      supabase
        .from('team_predictions')
        .select('gameweek_id, team_id, match_result, points_earned')
        .eq('user_id', user.id)
        .lt('gameweek_id', gameweekId)
        .order('gameweek_id', { ascending: false }),
      supabase
        .from('gameweeks')
        .select('id, is_survivor_skipped')
    ])

    const skippedGwsSet = new Set<number>()
    allGwRecords?.forEach(gw => {
      if (gw.is_survivor_skipped) skippedGwsSet.add(gw.id)
    })

    const userPicksByGw = new Map<number, any>()
    if (pastPicks) {
      for (const p of pastPicks) {
        userPicksByGw.set(p.gameweek_id, p)
      }
    }

    const activeStreakTeamIds = new Set<number>()
    let checkGw = gameweekId - 1
    while (checkGw >= 1) {
      if (skippedGwsSet.has(checkGw)) {
        checkGw -= 1
        continue
      }
      const pastPick = userPicksByGw.get(checkGw)
      if (pastPick && (pastPick.match_result === 'win' || (pastPick.points_earned && pastPick.points_earned > 0))) {
        activeStreakTeamIds.add(pastPick.team_id)
        checkGw -= 1
      } else {
        // Missed gameweek or loss/draw breaks active streak
        break
      }
    }

    // b. Fetch picked team and opponent details
    const { data: pickedTeam } = await supabase
      .from('teams')
      .select('id, position, name')
      .eq('id', teamId)
      .single()

    let opponentTeam: any = null
    if (opponentTeamId) {
      const { data: oppData } = await supabase
        .from('teams')
        .select('id, position, name')
        .eq('id', opponentTeamId)
        .single()
      opponentTeam = oppData
    }

    // c. Table Standings & Clash Rules (Gameweek > 1 only)
    if (gameweekId > 1 && !gameweek.is_survivor_skipped) {
      const isPickedTop3 = pickedTeam && pickedTeam.position !== null && pickedTeam.position >= 1 && pickedTeam.position <= 3
      const isOpponentTop3 = opponentTeam && opponentTeam.position !== null && opponentTeam.position >= 1 && opponentTeam.position <= 3

      // Top 3 Rule: Locked UNLESS Top 3 vs Top 3 Clash
      if (isPickedTop3) {
        const isTop3Clash = isOpponentTop3
        if (!isTop3Clash) {
          throw new Error('Invalid Pick: Teams currently in the top 3 (1st–3rd place) cannot be selected unless playing another top-3 team.')
        }
      }

      // Bottom 3 Opponent Rule: Cannot back a team facing a bottom-3 team (positions 18, 19, 20), unless both are in bottom 3
      const isOpponentBottom3 = opponentTeam && opponentTeam.position !== null && opponentTeam.position >= 18 && opponentTeam.position <= 20
      const isSelfBottom3 = pickedTeam && pickedTeam.position !== null && pickedTeam.position >= 18 && pickedTeam.position <= 20

      if (isOpponentBottom3) {
        const isBottom3Clash = isSelfBottom3
        if (!isBottom3Clash) {
          throw new Error('Invalid Pick: You cannot pick the opponent of a bottom-3 team unless your pick is also in the bottom 3.')
        }
      }
    }

    // d. Active Streak Team Lock (with Club Cycle Reset edge-case handler)
    if (activeStreakTeamIds.has(teamId)) {
      // Check if user ran out of valid teams (Club Cycle Reset)
      const { data: allTeams } = await supabase.from('teams').select('id, position')
      const validSelectableTeams = (allTeams || []).filter(t => {
        const isT3 = t.position !== null && t.position >= 1 && t.position <= 3
        const tFix = allGwFixtures?.find(f => f.home_team_id === t.id || f.away_team_id === t.id)
        if (!tFix) return false
        const oppId = tFix.home_team_id === t.id ? tFix.away_team_id : tFix.home_team_id
        const oppT = allTeams?.find(ot => ot.id === oppId)
        
        const isOppT3 = oppT && oppT.position !== null && oppT.position >= 1 && oppT.position <= 3
        const isT3Blocked = isT3 && !isOppT3
        
        const isOppB3 = oppT && oppT.position !== null && oppT.position >= 18 && oppT.position <= 20
        const isSelfB3 = t.position !== null && t.position >= 18 && t.position <= 20
        const isB3Blocked = isOppB3 && !isSelfB3

        return !isT3Blocked && !isB3Blocked
      })

      const hasSelectableOutsideStreak = validSelectableTeams.some(t => !activeStreakTeamIds.has(t.id))
      if (hasSelectableOutsideStreak) {
        throw new Error('Limit reached: You have already selected this team during your current active winning streak.')
      }
    }

    // 6. Save to Database
    const { error: upsertError } = await supabase
      .from('team_predictions')
      .upsert({
        user_id: user.id,
        gameweek_id: gameweekId,
        team_id: teamId,
        fixture_id: validatedFixtureId,
      }, {
        onConflict: 'user_id, gameweek_id' // Ensures only 1 team is picked per gameweek
      })

    if (upsertError) throw new Error('Failed to save team prediction.')

    // 6. Fetch team name for the message and refresh the UI
    const { data: teamInfo } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single()

    revalidatePath('/dashboard')
    
    return { 
      success: true, 
      message: `${teamInfo?.name || 'Team'} locked in for Gameweek ${gameweekId}!` 
    }

  } catch (error: any) {
    console.error("[submitTeamPrediction] Error:", error)
    return { success: false, error: error.message }
  }
}

export async function clearSurvivorPick(input: { gameweekId: number | string }) {
  try {
    const supabase = await createClient()

    // 1. Authenticate User
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized request. Please log in.')

    const gameweekId = Number(input.gameweekId)
    if (isNaN(gameweekId)) throw new Error('Invalid gameweek ID.')

    // 2. Check Deadline
    const { data: gameweek, error: gwError } = await supabase
      .from('gameweeks')
      .select('deadline_time')
      .eq('id', gameweekId)
      .single()

    if (gwError || !gameweek) throw new Error('Gameweek not found.')

    const deadline = new Date(gameweek.deadline_time)
    const now = new Date()
    if (now >= deadline) {
      throw new Error('Gameweek deadline has passed. Survivor picks are locked.')
    }

    // 3. Delete user's team prediction for this gameweek
    const { error: deleteError } = await supabase
      .from('team_predictions')
      .delete()
      .eq('user_id', user.id)
      .eq('gameweek_id', gameweekId)

    if (deleteError) {
      console.error('[clearSurvivorPick] Delete error:', deleteError)
      throw new Error('Failed to clear survivor pick.')
    }

    revalidatePath('/dashboard')
    return { success: true, message: 'Survivor pick cleared successfully!' }
  } catch (error: any) {
    console.error('[clearSurvivorPick] Error:', error)
    return { success: false, error: error.message || 'Failed to clear survivor pick.' }
  }
}