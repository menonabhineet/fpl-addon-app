'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function updateNickname(nickname: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Unauthorized request.' }
    }

    const trimmedNickname = (nickname || '').trim()

    // Validate nickname
    if (trimmedNickname.length > 30) {
      return { success: false, error: 'Nickname cannot exceed 30 characters.' }
    }

    const adminClient = createAdminClient()

    // Update nickname in profiles table (null if empty string)
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({
        nickname: trimmedNickname.length > 0 ? trimmedNickname : null
      })
      .eq('id', user.id)

    if (updateError) throw updateError

    revalidatePath('/dashboard')
    return { success: true }
  } catch (error: any) {
    console.error('[updateNickname] Error:', error)
    return { success: false, error: error.message || 'Failed to update nickname.' }
  }
}
