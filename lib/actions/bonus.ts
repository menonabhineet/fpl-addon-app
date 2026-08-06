'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createBonusQuestion(
  gameweek: number,
  question: string,
  options: string[],
  points: number
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) throw new Error('Unauthorized request.')
    const adminEmails = process.env.ADMIN_EMAIL?.split(',').map(e => e.trim()) || []
    if (!user.email || !adminEmails.includes(user.email)) throw new Error('Forbidden. Admin access required.')

    if (options.length !== 3) {
      throw new Error('You must provide exactly 3 options.')
    }

    const supabaseAdmin = createAdminClient()

    // Enforce deadline
    const { data: gwData, error: gwError } = await supabaseAdmin
      .from('gameweeks')
      .select('deadline_time')
      .eq('id', gameweek)
      .single()

    if (gwError || !gwData) throw new Error('Invalid gameweek.')
    if (new Date(gwData.deadline_time) < new Date()) {
      throw new Error('Cannot add or edit a bonus question for a gameweek that has already started.')
    }

    // Check if one already exists
    const { data: existing } = await supabaseAdmin
      .from('bonus_questions')
      .select('id')
      .eq('gameweek', gameweek)
      .maybeSingle()

    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from('bonus_questions')
        .update({ question, options, points })
        .eq('id', existing.id)

      if (updateError) throw new Error('Failed to update bonus question.')
    } else {
      const { error: insertError } = await supabaseAdmin
        .from('bonus_questions')
        .insert({ gameweek, question, options, points })

      if (insertError) throw new Error('Failed to create bonus question.')
    }

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    
    return { success: true, message: 'Bonus question saved successfully!' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function setBonusCorrectAnswer(questionId: string, correctAnswer: string) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) throw new Error('Unauthorized request.')
    const adminEmails = process.env.ADMIN_EMAIL?.split(',').map(e => e.trim()) || []
    if (!user.email || !adminEmails.includes(user.email)) throw new Error('Forbidden. Admin access required.')

    const supabaseAdmin = createAdminClient()

    // Get the question details to know the points
    const { data: questionData, error: qError } = await supabaseAdmin
      .from('bonus_questions')
      .select('points')
      .eq('id', questionId)
      .single()

    if (qError || !questionData) throw new Error('Failed to fetch question details.')

    // Update the question with correct answer
    const { error: updateError } = await supabaseAdmin
      .from('bonus_questions')
      .update({ correct_answer: correctAnswer })
      .eq('id', questionId)

    if (updateError) throw new Error('Failed to set correct answer.')

    // Set correct ones
    const { error: correctErr } = await supabaseAdmin
      .from('bonus_predictions')
      .update({ awarded_points: questionData.points })
      .eq('question_id', questionId)
      .eq('answer', correctAnswer)

    if (correctErr) throw new Error('Failed to award points to correct predictions.')

    // Set incorrect ones
    const { error: incorrectErr } = await supabaseAdmin
      .from('bonus_predictions')
      .update({ awarded_points: 0 })
      .eq('question_id', questionId)
      .neq('answer', correctAnswer)

    if (incorrectErr) throw new Error('Failed to reset points for incorrect predictions.')

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    
    return { success: true, message: 'Correct answer set and points awarded!' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function submitBonusPrediction(questionId: string, answer: string) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) throw new Error('Unauthorized request.')

    const supabaseAdmin = createAdminClient()

    // Upsert the prediction
    const { error } = await supabaseAdmin
      .from('bonus_predictions')
      .upsert({ 
        user_id: user.id, 
        question_id: questionId, 
        answer 
      }, { onConflict: 'user_id, question_id' })

    if (error) throw new Error('Failed to submit prediction.')

    revalidatePath('/dashboard')
    
    return { success: true, message: 'Prediction submitted!' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteBonusQuestion(questionId: string) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) throw new Error('Unauthorized request.')
    const adminEmails = process.env.ADMIN_EMAIL?.split(',').map(e => e.trim()) || []
    if (!user.email || !adminEmails.includes(user.email)) throw new Error('Forbidden. Admin access required.')

    const supabaseAdmin = createAdminClient()

    // Check if predictions exist
    const { count, error: countErr } = await supabaseAdmin
      .from('bonus_predictions')
      .select('*', { count: 'exact', head: true })
      .eq('question_id', questionId)

    if (countErr) throw new Error('Failed to check existing predictions.')
    if (count && count > 0) throw new Error('Cannot delete this question because players have already submitted answers.')

    // Delete it
    const { error: delErr } = await supabaseAdmin
      .from('bonus_questions')
      .delete()
      .eq('id', questionId)

    if (delErr) throw new Error('Failed to delete bonus question.')

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    
    return { success: true, message: 'Bonus question deleted successfully!' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
