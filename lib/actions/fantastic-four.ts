// lib/actions/fantastic-four.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function submitFantasticFourPrediction(formData: FormData) {
  try {
    const supabase = await createClient()

    // 1. Authenticate User
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized request. Please log in.')

    // 2. Extract and validate incoming data
    const gameweekId = parseInt(formData.get('gameweekId') as string)
    const playerId = parseInt(formData.get('playerId') as string)
    const playerName = formData.get('playerName') as string
    const position = formData.get('position') as string // 'GK', 'DEF', 'MID', 'FWD'

    if (isNaN(gameweekId) || isNaN(playerId) || !playerName || !['GK', 'DEF', 'MID', 'FWD'].includes(position)) {
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

    // 4. Positional Game Rule Validation
    // Fetch all prior picks for this specific player by this user
    const { data: history, error: historyError } = await supabase
      .from('fantastic_four')
      .select('gameweek_id')
      .eq('user_id', user.id)
      .eq('player_id', playerId)
      .neq('gameweek_id', gameweekId) // Exclude current draft

    if (historyError) throw new Error('Failed to validate player history.')

    // Rule A: DEF and MID can only be picked ONCE per season
    if ((position === 'DEF' || position === 'MID') && history.length > 0) {
      throw new Error(`Invalid Pick: You have already selected this ${position} this season.`)
    }

    // Rule B: GK and FWD can be picked once per half-season
    if (position === 'GK' || position === 'FWD') {
      const isFirstHalf = gameweekId <= 19
      
      const pickedInFirstHalf = history.some(pick => pick.gameweek_id <= 19)
      const pickedInSecondHalf = history.some(pick => pick.gameweek_id > 19)

      if (isFirstHalf && pickedInFirstHalf) {
        throw new Error(`Invalid Pick: You have already selected this ${position} in the first half of the season.`)
      }
      
      if (!isFirstHalf && pickedInSecondHalf) {
        throw new Error(`Invalid Pick: You have already selected this ${position} in the second half of the season.`)
      }
    }

    // 5. Save to Database
    const { error: upsertError } = await supabase
      .from('fantastic_four')
      .upsert({
        user_id: user.id,
        gameweek_id: gameweekId,
        player_id: playerId,
        player_name: playerName,
        position: position,
      }, {
        onConflict: 'user_id, gameweek_id, position' // Ensures only 1 player per position per gameweek
      })

    if (upsertError) throw new Error('Failed to save Fantastic Four pick.')

    // 6. Refresh the UI
    revalidatePath('/dashboard')
    
    return { success: true, message: 'Fantastic Four pick saved successfully!' }

  } catch (error: any) {
    return { success: false, error: error.message }
  }
}