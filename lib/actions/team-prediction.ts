// lib/actions/team-prediction.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function submitTeamPrediction(formData: FormData) {
  try {
    const supabase = await createClient()

    // 1. Authenticate User
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized request. Please log in.')

    // 2. Extract and validate incoming data
    const gameweekId = parseInt(formData.get('gameweekId') as string)
    const teamId = parseInt(formData.get('teamId') as string)

    if (isNaN(gameweekId) || isNaN(teamId)) {
      throw new Error('Invalid input data.')
    }

    // 3. Deadline Validation
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

    // 4. Game Rule Validation: Max 2 picks per team per season
    // We exclude the current gameweek ID so users can safely update their draft without hitting the limit
    const { count, error: countError } = await supabase
      .from('team_predictions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('team_id', teamId)
      .neq('gameweek_id', gameweekId)

    if (countError) throw new Error('Failed to validate team pick history.')

    if (count !== null && count >= 2) {
      throw new Error('Limit reached: You have already selected this team twice this season.')
    }

    // 5. Save to Database
    const { error: upsertError } = await supabase
      .from('team_predictions')
      .upsert({
        user_id: user.id,
        gameweek_id: gameweekId,
        team_id: teamId,
        // points_earned defaults to 0 and is graded after the match finishes
      }, {
        onConflict: 'user_id, gameweek_id' // Ensures only 1 team is picked per gameweek
      })

    if (upsertError) throw new Error('Failed to save team prediction.')

    // 6. Refresh the UI
    revalidatePath('/dashboard')
    
    return { success: true, message: 'Team prediction saved successfully!' }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}