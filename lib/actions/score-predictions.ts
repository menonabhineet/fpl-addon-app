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
    const fixtureId = parseInt(formData.get('fixtureId') as string)
    const homeScore = parseInt(formData.get('homeScore') as string)
    const awayScore = parseInt(formData.get('awayScore') as string)

    if (isNaN(fixtureId) || isNaN(homeScore) || isNaN(awayScore)) {
      throw new Error('Invalid input data.')
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
        // points_earned will remain 0 until the cron job grades it later
      }, {
        onConflict: 'user_id, fixture_id' // Relies on the unique constraint we built in Phase 2
      })

    if (upsertError) throw new Error('Failed to save prediction.')

    // 5. Tell Next.js to refresh the dashboard data so the UI updates instantly
    revalidatePath('/dashboard')
    
    return { success: true, message: 'Prediction saved successfully!' }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}