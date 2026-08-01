'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function toggleGameweekVisibility(gameweekId: number, isVisible: boolean) {
  const supabase = await createClient()

  // Verify admin access
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' }
  }

  const adminEmails = process.env.ADMIN_EMAIL?.split(',').map(e => e.trim()) || []
  if (!user.email || !adminEmails.includes(user.email)) {
    return { success: false, error: 'Unauthorized' }
  }

  // Use admin client to bypass RLS for updates
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('gameweeks')
    .update({ is_available_to_players: isVisible })
    .eq('id', gameweekId)

  if (error) {
    console.error("Failed to update gameweek visibility:", error)
    return { success: false, error: 'Database update failed' }
  }

  revalidatePath('/admin')
  revalidatePath('/dashboard')

  return { success: true }
}
