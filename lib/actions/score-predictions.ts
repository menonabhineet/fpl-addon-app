// lib/actions/score-predictions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function submitScorePrediction(formData: FormData) {
  try {
    const supabase = await createClient()

    // 1. Authenticate User securely on the server
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized request. Please log in.')

    // 2. Extract data from the incoming form payload
    const fixtureId = Number(formData.get('fixtureId'))
    const homeScore = Number(formData.get('homeScore'))
    const awayScore = Number(formData.get('awayScore'))

    if (isNaN(fixtureId) || isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      throw new Error('Invalid input data. Scores must be 0 or higher.')
    }

    // 3. Deadline Validation: Query the fixture and its parent gameweek
    const { data: fixture, error: fixtureError } = await supabase
      .from('fixtures')
      .select(`
        gameweek_id,
        gameweeks:gameweek_id (
          deadline_time
        )
      `)
      .eq('id', fixtureId)
      .single()

    if (fixtureError || !fixture) throw new Error('Fixture not found.')

    // Cast the joined data to handle Supabase's auto-generated join typing
    const gameweekData = fixture.gameweeks as unknown as { deadline_time: string } | null;

    if (!gameweekData?.deadline_time) {
      throw new Error('Gameweek deadline configuration missing.')
    }

    // Ensure the current time is strictly BEFORE the official FPL deadline
    const deadline = new Date(gameweekData.deadline_time)
    const now = new Date()

    if (now >= deadline) {
      throw new Error('Gameweek deadline has passed. Predictions are locked.')
    }

    // 4. Save to Database
    // We use upsert so users can update their picks as many times as they want BEFORE the deadline
    const { error: upsertError } = await supabase
      .from('score_predictions')
      .upsert({
        user_id: user.id,
        fixture_id: fixtureId,
        predicted_home_score: homeScore,
        predicted_away_score: awayScore,
      }, {
        onConflict: 'user_id, fixture_id'
      })

    if (upsertError) throw new Error('Failed to save prediction.')

    // 5. Tell Next.js to refresh the dashboard data so the UI updates instantly
    revalidatePath('/dashboard')
    
    return { success: true, message: 'Prediction saved successfully!' }

  } catch (error: any) {
    console.error("[submitScorePrediction] Error:", error)
    return { success: false, error: error.message }
  }
}

export async function clearAllScorePredictions(input: { gameweekId: number | string }) {
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
      throw new Error('Gameweek deadline has passed. Predictions are locked.')
    }

    // 3. Find all fixture IDs in this gameweek
    const { data: fixtures, error: fixturesError } = await supabase
      .from('fixtures')
      .select('id')
      .eq('gameweek_id', gameweekId)

    if (fixturesError) throw new Error('Failed to fetch fixtures.')
    const fixtureIds = fixtures?.map(f => f.id) || []

    if (fixtureIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('score_predictions')
        .delete()
        .eq('user_id', user.id)
        .in('fixture_id', fixtureIds)

      if (deleteError) {
        console.error('[clearAllScorePredictions] Delete error:', deleteError)
        throw new Error('Failed to clear score predictions.')
      }
    }

    revalidatePath('/dashboard')
    return { success: true, message: 'All score predictions cleared successfully!' }
  } catch (error: any) {
    console.error('[clearAllScorePredictions] Error:', error)
    return { success: false, error: error.message || 'Failed to clear score predictions.' }
  }
}

export async function removeIndividualScorePrediction(input: { fixtureId: number | string }) {
  try {
    const supabase = await createClient()

    // 1. Authenticate User
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized request. Please log in.')

    const fixtureId = Number(input.fixtureId)
    if (isNaN(fixtureId)) throw new Error('Invalid fixture ID.')

    // 2. Check Deadline
    const { data: fixture, error: fixtureError } = await supabase
      .from('fixtures')
      .select(`
        gameweek_id,
        gameweeks:gameweek_id (
          deadline_time
        )
      `)
      .eq('id', fixtureId)
      .single()

    if (fixtureError || !fixture) throw new Error('Fixture not found.')

    const gameweekData = fixture.gameweeks as unknown as { deadline_time: string } | null
    if (gameweekData?.deadline_time) {
      const deadline = new Date(gameweekData.deadline_time)
      const now = new Date()
      if (now >= deadline) {
        throw new Error('Gameweek deadline has passed. Predictions are locked.')
      }
    }

    // 3. Delete user's prediction for this fixture
    const { error: deleteError } = await supabase
      .from('score_predictions')
      .delete()
      .eq('user_id', user.id)
      .eq('fixture_id', fixtureId)

    if (deleteError) {
      console.error('[removeIndividualScorePrediction] Delete error:', deleteError)
      throw new Error('Failed to remove score prediction.')
    }

    revalidatePath('/dashboard')
    return { success: true, message: 'Prediction removed successfully!' }
  } catch (error: any) {
    console.error('[removeIndividualScorePrediction] Error:', error)
    return { success: false, error: error.message || 'Failed to remove prediction.' }
  }
}