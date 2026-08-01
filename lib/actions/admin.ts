'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveSelectedFixtures(gameweekId: number, selectedFixtureIds: number[]) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) throw new Error('Unauthorized request.')
    const adminEmails = process.env.ADMIN_EMAIL?.split(',').map(e => e.trim()) || []
    if (!user.email || !adminEmails.includes(user.email)) throw new Error('Forbidden. Admin access required.')

    // Fetch total fixtures for this gameweek to determine the selection cap
    const { count, error: countError } = await supabase
      .from('fixtures')
      .select('*', { count: 'exact', head: true })
      .eq('gameweek_id', gameweekId)

    if (countError) throw new Error('Failed to validate gameweek fixtures.')
    
    const maxSelections = Math.min(5, count || 0)

    // We must ensure the user has selected up to the maximum possible (usually 5)
    if (selectedFixtureIds.length !== maxSelections) {
      throw new Error(`You must select exactly ${maxSelections} fixture${maxSelections !== 1 ? 's' : ''}.`)
    }

    // First, set all fixtures for this gameweek to is_selected = false
    const { error: resetError } = await supabase
      .from('fixtures')
      .update({ is_selected: false })
      .eq('gameweek_id', gameweekId)

    if (resetError) throw new Error('Failed to reset fixtures selection.')

    // Then, set the selected fixtures to is_selected = true
    const { error: updateError } = await supabase
      .from('fixtures')
      .update({ is_selected: true })
      .in('id', selectedFixtureIds)

    if (updateError) throw new Error('Failed to save fixtures selection.')

    revalidatePath('/dashboard')
    revalidatePath('/admin')

    return { success: true, message: 'Selection saved successfully!' }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
