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

    // We must ensure the user has exactly selected 5 fixtures.
    if (selectedFixtureIds.length !== 5) {
      throw new Error('You must select exactly 5 fixtures.')
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
