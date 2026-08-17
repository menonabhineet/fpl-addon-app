'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function toggleSurvivorSkipped(gameweekId: number, isSkipped: boolean) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) throw new Error('Unauthorized request.')
    const adminEmails = process.env.ADMIN_EMAIL?.split(',').map(e => e.trim().toLowerCase()) || []
    if (!user.email || !adminEmails.includes(user.email.toLowerCase())) throw new Error('Forbidden. Admin access required.')

    const adminClient = createAdminClient()
    const { error } = await adminClient
      .from('gameweeks')
      .update({ is_survivor_skipped: isSkipped })
      .eq('id', gameweekId)

    if (error) throw new Error(error.message)

    revalidatePath('/admin')
    revalidatePath('/dashboard')
    
    return { success: true }
  } catch (error: any) {
    console.error("[toggleSurvivorSkipped] Error:", error)
    return { success: false, error: error.message }
  }
}

