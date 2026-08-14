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

    // 5. Game Rule Validation: Survivor Mode
    
    // a. Check Active Round & Status
    let { data: activeRound } = await supabase
      .from('survivor_rounds')
      .select('id, start_gameweek_id')
      .eq('status', 'active')
      .maybeSingle()
      
    // If no active round exists at all (fresh database), auto-initialize Round 1 starting at Gameweek 1
    if (!activeRound) {
      const adminClient = createAdminClient()
      const { data: newRound, error: initError } = await adminClient
        .from('survivor_rounds')
        .insert({ start_gameweek_id: 1, status: 'active' })
        .select('id, start_gameweek_id')
        .single()

      if (initError || !newRound) {
        console.error("Failed to auto-initialize Survivor round:", initError)
        throw new Error('Failed to initialize Survivor round. Please try again.')
      }
      activeRound = newRound
    }

    let survivorRoundId = activeRound.id
    
    const { data: entry } = await supabase
      .from('survivor_entries')
      .select('status')
      .eq('round_id', activeRound.id)
      .eq('user_id', user.id)
      .maybeSingle()
      
    if (entry && entry.status === 'eliminated') {
      throw new Error('You have been eliminated from the current Survivor round.')
    } else if (!entry) {
      // If they don't have an entry but the round is active, they can join IF it's the start of the round
      if (activeRound.start_gameweek_id === gameweekId) {
        const adminClient = createAdminClient()
        await adminClient.from('survivor_entries').insert({ round_id: activeRound.id, user_id: user.id, status: 'alive' })
      } else {
         throw new Error('You cannot join a Survivor round that has already started.')
      }
    }

      // b. Max 1 pick per team per round
      const { data: pastPicks } = await supabase
        .from('team_predictions')
        .select('team_id')
        .eq('user_id', user.id)
        .eq('survivor_round_id', activeRound.id)
        .neq('gameweek_id', gameweekId)
        
      if (pastPicks && pastPicks.some(p => p.team_id === teamId)) {
        throw new Error('Limit reached: You have already selected this team in the current round.')
      }

    // c. Table Standings Rules (Gameweek > 1 only)
    if (gameweekId > 1 && !gameweek.is_survivor_skipped) {
      // 1. Fetch picked team details
      const { data: pickedTeam } = await supabase
        .from('teams')
        .select('position, name')
        .eq('id', teamId)
        .single()

      // Top 3 Rule: Whoever sits 1st to 3rd is off the board (positions 1, 2, 3)
      if (pickedTeam && pickedTeam.position !== null && pickedTeam.position >= 1 && pickedTeam.position <= 3) {
        throw new Error('Invalid Pick: Teams currently in the top 3 (1st to 3rd place) cannot be selected.')
      }

      // 2. Bottom 3 Opponent Rule: Cannot back a team facing a bottom-3 team (positions 18, 19, 20), unless the team itself is also in bottom 3
      if (opponentTeamId) {
        const { data: opponentTeam } = await supabase
          .from('teams')
          .select('position, name')
          .eq('id', opponentTeamId)
          .single()

        const isOpponentBottom3 = opponentTeam && opponentTeam.position !== null && opponentTeam.position >= 18 && opponentTeam.position <= 20
        const isSelfBottom3 = pickedTeam && pickedTeam.position !== null && pickedTeam.position >= 18 && pickedTeam.position <= 20

        if (isOpponentBottom3 && !isSelfBottom3) {
          throw new Error('Invalid Pick: You cannot pick the opponent of a bottom-3 team (unless your pick is also a bottom-3 team).')
        }
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
        survivor_round_id: survivorRoundId,
        // match_result defaults to null and is graded after the match finishes
      }, {
        onConflict: 'user_id, gameweek_id' // Ensures only 1 team is picked per gameweek
      })

    if (upsertError) throw new Error('Failed to save team prediction.')

    // 6. Refresh the UI
    revalidatePath('/dashboard')
    
    return { success: true, message: 'Team prediction saved successfully!' }

  } catch (error: any) {
    console.error("[submitTeamPrediction] Error:", error)
    return { success: false, error: error.message }
  }
}