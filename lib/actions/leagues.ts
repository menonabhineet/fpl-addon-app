'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// Safe alphanumeric character set excluding ambiguous characters (0, O, 1, I, L)
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

function generateCode(length = 6): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * CODE_CHARS.length)
    code += CODE_CHARS[randomIndex]
  }
  return code
}

export interface LeagueSummary {
  id: string
  name: string
  code: string
  created_by: string
  created_at: string
  role: 'admin' | 'member'
  member_count: number
}

export interface LeagueMemberInfo {
  id: string
  user_id: string
  role: 'admin' | 'member'
  joined_at: string
  manager_name: string
  avatar_url?: string | null
  email?: string
}

/**
 * Fetch all leagues that the currently authenticated user belongs to.
 * Accepts an optional userId to eliminate duplicate auth roundtrips when already resolved.
 */
export async function getUserLeagues(userId?: string): Promise<{ success: boolean; leagues?: LeagueSummary[]; error?: string }> {
  try {
    let resolvedUserId = userId

    if (!resolvedUserId) {
      const supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        return { success: false, error: 'Unauthorized' }
      }
      resolvedUserId = user.id
    }

    const adminClient = createAdminClient()

    // 1. Get all memberships for current user
    const { data: memberships, error: memError } = await adminClient
      .from('league_members')
      .select('league_id, role, joined_at')
      .eq('user_id', resolvedUserId)

    if (memError) throw memError
    if (!memberships || memberships.length === 0) {
      return { success: true, leagues: [] }
    }

    const leagueIds = memberships.map(m => m.league_id)

    // 2. Fetch league details
    const { data: leaguesData, error: leaguesError } = await adminClient
      .from('leagues')
      .select('*')
      .in('id', leagueIds)
      .order('created_at', { ascending: false })

    if (leaguesError) throw leaguesError

    // 3. Fetch member counts for all user leagues
    const { data: countData, error: countError } = await adminClient
      .from('league_members')
      .select('league_id')
      .in('league_id', leagueIds)

    if (countError) throw countError

    const countsMap = new Map<string, number>()
    countData?.forEach(row => {
      countsMap.set(row.league_id, (countsMap.get(row.league_id) || 0) + 1)
    })

    const roleMap = new Map<string, 'admin' | 'member'>(
      memberships.map(m => [m.league_id, m.role as 'admin' | 'member'])
    )

    const result: LeagueSummary[] = (leaguesData || []).map(l => ({
      id: l.id,
      name: l.name,
      code: l.code,
      created_by: l.created_by,
      created_at: l.created_at,
      role: roleMap.get(l.id) || 'member',
      member_count: countsMap.get(l.id) || 1
    }))

    return { success: true, leagues: result }
  } catch (error: any) {
    console.error('[getUserLeagues] Error:', error)
    return { success: false, error: error.message || 'Failed to fetch leagues' }
  }
}

const MAX_OWNED_LEAGUES = 3
const MAX_JOINED_LEAGUES = 10

/**
 * Create a new private league with a unique invite code.
 */
export async function createLeague(name: string): Promise<{ success: boolean; league?: LeagueSummary; error?: string }> {
  try {
    const trimmedName = (name || '').trim()
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 50) {
      return { success: false, error: 'League name must be between 2 and 50 characters.' }
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Unauthorized request.' }
    }

    const adminClient = createAdminClient()

    // 1. Enforce max 3 created leagues limit
    const { count: ownedCount, error: ownedCountError } = await adminClient
      .from('leagues')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', user.id)

    if (ownedCountError) throw ownedCountError

    if ((ownedCount || 0) >= MAX_OWNED_LEAGUES) {
      return {
        success: false,
        error: `You can only create up to ${MAX_OWNED_LEAGUES} leagues. Delete an existing league you own to create a new one.`
      }
    }

    // 2. Enforce max 10 total leagues membership limit
    const { count: totalJoinedCount, error: totalJoinedError } = await adminClient
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (totalJoinedError) throw totalJoinedError

    if ((totalJoinedCount || 0) >= MAX_JOINED_LEAGUES) {
      return {
        success: false,
        error: `You have reached the maximum limit of ${MAX_JOINED_LEAGUES} total leagues. Leave a league before creating or joining another.`
      }
    }

    // Generate unique code with retry logic
    let uniqueCode = ''
    let attempts = 0
    while (attempts < 5) {
      const candidateCode = generateCode(6)
      const { data: existing } = await adminClient
        .from('leagues')
        .select('id')
        .eq('code', candidateCode)
        .maybeSingle()

      if (!existing) {
        uniqueCode = candidateCode
        break
      }
      attempts++
    }

    if (!uniqueCode) {
      throw new Error('Failed to generate a unique invite code. Please try again.')
    }

    // Insert new league
    const { data: newLeague, error: insertError } = await adminClient
      .from('leagues')
      .insert({
        name: trimmedName,
        code: uniqueCode,
        created_by: user.id
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Add creator as admin
    const { error: memberError } = await adminClient
      .from('league_members')
      .insert({
        league_id: newLeague.id,
        user_id: user.id,
        role: 'admin'
      })

    if (memberError) throw memberError

    revalidatePath('/dashboard')

    return {
      success: true,
      league: {
        id: newLeague.id,
        name: newLeague.name,
        code: newLeague.code,
        created_by: newLeague.created_by,
        created_at: newLeague.created_at,
        role: 'admin',
        member_count: 1
      }
    }
  } catch (error: any) {
    console.error('[createLeague] Error:', error)
    return { success: false, error: error.message || 'Failed to create league.' }
  }
}

/**
 * Join a private league using an invite code.
 */
export async function joinLeagueByCode(code: string): Promise<{
  success: boolean
  league?: LeagueSummary
  alreadyMember?: boolean
  error?: string
}> {
  try {
    const formattedCode = (code || '').trim().toUpperCase()
    if (!formattedCode || formattedCode.length < 4) {
      return { success: false, error: 'Please provide a valid invite code.' }
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'You must be logged in to join a league.' }
    }

    const adminClient = createAdminClient()

    // Find the league by code
    const { data: league, error: leagueError } = await adminClient
      .from('leagues')
      .select('*')
      .eq('code', formattedCode)
      .maybeSingle()

    if (leagueError || !league) {
      return { success: false, error: 'Invalid invite code. League not found.' }
    }

    // Check if already a member
    const { data: existingMember } = await adminClient
      .from('league_members')
      .select('id, role')
      .eq('league_id', league.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMember) {
      return {
        success: true,
        alreadyMember: true,
        league: {
          id: league.id,
          name: league.name,
          code: league.code,
          created_by: league.created_by,
          created_at: league.created_at,
          role: existingMember.role,
          member_count: 1
        }
      }
    }

    // Enforce max 10 total leagues membership limit
    const { count: totalJoinedCount, error: totalJoinedError } = await adminClient
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (totalJoinedError) throw totalJoinedError

    if ((totalJoinedCount || 0) >= MAX_JOINED_LEAGUES) {
      return {
        success: false,
        error: `You have reached the maximum limit of ${MAX_JOINED_LEAGUES} total leagues. Leave a league before joining another.`
      }
    }

    // Add user to league
    const { error: joinError } = await adminClient
      .from('league_members')
      .insert({
        league_id: league.id,
        user_id: user.id,
        role: 'member'
      })

    if (joinError) throw joinError

    // Count total members
    const { count } = await adminClient
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league.id)

    revalidatePath('/dashboard')

    return {
      success: true,
      alreadyMember: false,
      league: {
        id: league.id,
        name: league.name,
        code: league.code,
        created_by: league.created_by,
        created_at: league.created_at,
        role: 'member',
        member_count: count || 1
      }
    }
  } catch (error: any) {
    console.error('[joinLeagueByCode] Error:', error)
    return { success: false, error: error.message || 'Failed to join league.' }
  }
}

/**
 * Public/Safe preview of a league by code for the invite landing page.
 */
export async function getLeaguePreviewByCode(code: string): Promise<{
  success: boolean
  league?: { id: string; name: string; member_count: number }
  error?: string
}> {
  try {
    const formattedCode = (code || '').trim().toUpperCase()
    if (!formattedCode) return { success: false, error: 'Invalid code' }

    const adminClient = createAdminClient()
    const { data: league, error: leagueError } = await adminClient
      .from('leagues')
      .select('id, name')
      .eq('code', formattedCode)
      .maybeSingle()

    if (leagueError || !league) {
      return { success: false, error: 'League not found' }
    }

    const { count } = await adminClient
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league.id)

    return {
      success: true,
      league: {
        id: league.id,
        name: league.name,
        member_count: count || 0
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Fetch member list with names and roles for a league.
 */
export async function getLeagueMembers(leagueId: string): Promise<{
  success: boolean
  members?: LeagueMemberInfo[]
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Unauthorized request.' }
    }

    const adminClient = createAdminClient()

    // Verify current user belongs to the league
    const { data: myMembership } = await adminClient
      .from('league_members')
      .select('id')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!myMembership) {
      return { success: false, error: 'You are not a member of this league.' }
    }

    // Fetch all members
    const { data: members, error: memError } = await adminClient
      .from('league_members')
      .select('id, user_id, role, joined_at')
      .eq('league_id', leagueId)
      .order('joined_at', { ascending: true })

    if (memError) throw memError

    const userIds = members.map(m => m.user_id)

    // Fetch profiles
    const { data: profiles, error: profError } = await adminClient
      .from('profiles')
      .select('id, full_name, nickname, email, avatar_url')
      .in('id', userIds)

    if (profError) throw profError

    const profileMap = new Map<string, any>(profiles?.map(p => [p.id, p]) || [])

    const result: LeagueMemberInfo[] = members.map(m => {
      const p = profileMap.get(m.user_id)
      const managerName = p?.nickname || p?.full_name || (p?.email ? p.email.split('@')[0] : 'Unknown Manager')
      return {
        id: m.id,
        user_id: m.user_id,
        role: m.role as 'admin' | 'member',
        joined_at: m.joined_at,
        manager_name: managerName,
        avatar_url: p?.avatar_url || null,
        email: p?.email
      }
    })

    return { success: true, members: result }
  } catch (error: any) {
    console.error('[getLeagueMembers] Error:', error)
    return { success: false, error: error.message || 'Failed to fetch league members.' }
  }
}

/**
 * Leave a league or delete it if last member.
 */
export async function leaveLeague(leagueId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Unauthorized request.' }
    }

    const adminClient = createAdminClient()

    // 1. Get user's membership
    const { data: membership } = await adminClient
      .from('league_members')
      .select('id, role')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return { success: false, error: 'You are not a member of this league.' }
    }

    // 2. Remove membership
    const { error: deleteError } = await adminClient
      .from('league_members')
      .delete()
      .eq('id', membership.id)

    if (deleteError) throw deleteError

    // 3. Check remaining members count
    const { data: remainingMembers, count } = await adminClient
      .from('league_members')
      .select('id, user_id, role', { count: 'exact' })
      .eq('league_id', leagueId)
      .order('joined_at', { ascending: true })

    if (!count || count === 0) {
      // Delete empty league
      await adminClient.from('leagues').delete().eq('id', leagueId)
    } else if (membership.role === 'admin') {
      // Check if there are other admins
      const hasOtherAdmin = remainingMembers.some(m => m.role === 'admin')
      if (!hasOtherAdmin && remainingMembers.length > 0) {
        // Promote the oldest member to admin
        await adminClient
          .from('league_members')
          .update({ role: 'admin' })
          .eq('id', remainingMembers[0].id)
      }
    }

    revalidatePath('/dashboard')
    return { success: true }
  } catch (error: any) {
    console.error('[leaveLeague] Error:', error)
    return { success: false, error: error.message || 'Failed to leave league.' }
  }
}

/**
 * Remove a member from a league (League Admin only).
 */
export async function removeLeagueMember(leagueId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Unauthorized request.' }
    }

    const adminClient = createAdminClient()

    // Verify current user is admin of this league
    const { data: myMembership } = await adminClient
      .from('league_members')
      .select('role')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!myMembership || myMembership.role !== 'admin') {
      return { success: false, error: 'Only a league admin can remove members.' }
    }

    if (targetUserId === user.id) {
      return { success: false, error: 'Use the Leave League option to remove yourself.' }
    }

    const { error: removeError } = await adminClient
      .from('league_members')
      .delete()
      .eq('league_id', leagueId)
      .eq('user_id', targetUserId)

    if (removeError) throw removeError

    revalidatePath('/dashboard')
    return { success: true }
  } catch (error: any) {
    console.error('[removeLeagueMember] Error:', error)
    return { success: false, error: error.message || 'Failed to remove member.' }
  }
}

/**
 * Delete a league (League Admin only).
 */
export async function deleteLeague(leagueId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Unauthorized request.' }
    }

    const adminClient = createAdminClient()

    // Verify current user is admin of this league
    const { data: myMembership } = await adminClient
      .from('league_members')
      .select('role')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!myMembership || myMembership.role !== 'admin') {
      return { success: false, error: 'Only a league admin can delete the league.' }
    }

    const { error: deleteError } = await adminClient
      .from('leagues')
      .delete()
      .eq('id', leagueId)

    if (deleteError) throw deleteError

    revalidatePath('/dashboard')
    return { success: true }
  } catch (error: any) {
    console.error('[deleteLeague] Error:', error)
    return { success: false, error: error.message || 'Failed to delete league.' }
  }
}
