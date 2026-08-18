import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

export interface CachedPlayer {
  id: number
  name: string
  position: string
  teams: {
    code?: number
    short_name?: string
    name?: string
  } | {
    code?: number
    short_name?: string
    name?: string
  }[] | null
}

export interface CachedTeam {
  id: number
  name: string
  short_name: string
  code: number
  position?: number | null
}

/**
 * Cache all Premier League players with Next.js ISR (1 hour revalidation).
 * Slashes Supabase egress by >85% across all dashboard page loads.
 */
export const getCachedPlayers = unstable_cache(
  async (): Promise<CachedPlayer[]> => {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('players')
      .select('id, name, position, teams:team_id(code, short_name, name)')
      .order('name', { ascending: true })
      .range(0, 9999)

    if (error) {
      console.error('[getCachedPlayers] Supabase error:', error)
      return []
    }
    return (data as unknown as CachedPlayer[]) || []
  },
  ['cached-players-list'],
  { revalidate: 3600 }
)

/**
 * Cache all 20 Premier League teams with Next.js ISR (1 hour revalidation).
 */
export const getCachedTeams = unstable_cache(
  async (): Promise<CachedTeam[]> => {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('[getCachedTeams] Supabase error:', error)
      return []
    }
    return (data as unknown as CachedTeam[]) || []
  },
  ['cached-teams-list'],
  { revalidate: 3600 }
)
