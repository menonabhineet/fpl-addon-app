'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// High-profile / Marquee clubs
const HIGH_PROFILE_TEAMS = new Set([
  'ARS', 'LIV', 'MCI', 'CHE', 'MUN', 'TOT', 'NEW', 'AVL'
])

export interface AutoSelectResult {
  gameweekId: number
  status: 'already_selected' | 'auto_selected' | 'skipped' | 'error'
  selectedFixtureIds?: number[]
  message?: string
}

/**
 * Pure scoring function to pick 5 varied fixtures with max 3-consecutive-gameweek repetition limit.
 */
function scoreAndSelectFixtures(
  targetFixtures: any[],
  recentSelectionsByGw: Map<number, Set<number>>, // gameweekId -> Set of team IDs that were selected
  targetGwId: number
): number[] {
  if (!targetFixtures || targetFixtures.length === 0) return []

  // If total fixtures in this gameweek is 5 or fewer, pick all of them
  if (targetFixtures.length <= 5) {
    return targetFixtures.map(f => f.id)
  }

  // 1. Calculate consecutive appearance streak for every team across GW - 1, GW - 2, GW - 3
  const teamConsecutiveStreak = new Map<number, number>()
  const allTeamIds = new Set<number>()

  targetFixtures.forEach(f => {
    if (f.home_team_id) allTeamIds.add(f.home_team_id)
    if (f.away_team_id) allTeamIds.add(f.away_team_id)
    if (f.home_team?.id) allTeamIds.add(f.home_team.id)
    if (f.away_team?.id) allTeamIds.add(f.away_team.id)
  })

  allTeamIds.forEach(teamId => {
    let streak = 0
    // Check backwards: GW - 1, GW - 2, GW - 3
    for (let gwOffset = 1; gwOffset <= 3; gwOffset++) {
      const pastGwId = targetGwId - gwOffset
      const teamsInPastGw = recentSelectionsByGw.get(pastGwId)
      if (teamsInPastGw && teamsInPastGw.has(teamId)) {
        streak += 1
      } else {
        // Break consecutive chain
        break
      }
    }
    teamConsecutiveStreak.set(teamId, streak)
  })

  // 2. Score each fixture
  interface ScoredFixture {
    id: number
    score: number
    homeTeamId: number
    awayTeamId: number
    isDisqualified: boolean
    kickoffTime: string
  }

  const scoredList: ScoredFixture[] = targetFixtures.map(fixture => {
    const homeId = fixture.home_team_id || fixture.home_team?.id
    const awayId = fixture.away_team_id || fixture.away_team?.id
    const homeShort = fixture.home_team?.short_name || ''
    const awayShort = fixture.away_team?.short_name || ''

    const homeStreak = teamConsecutiveStreak.get(homeId) || 0
    const awayStreak = teamConsecutiveStreak.get(awayId) || 0

    // Strict Rule: Same club CANNOT repeat for more than 3 consecutive gameweeks
    // If either team has already played in the last 3 consecutive gameweeks, disqualify this fixture
    const isDisqualified = homeStreak >= 3 || awayStreak >= 3

    let score = 10 // Base score for any Premier League fixture

    // Big Match / Marquee Weighting
    const isHomeBig = HIGH_PROFILE_TEAMS.has(homeShort)
    const isAwayBig = HIGH_PROFILE_TEAMS.has(awayShort)

    if (isHomeBig) score += 3
    if (isAwayBig) score += 3
    if (isHomeBig && isAwayBig) score += 3 // Derby / Big Clash bonus

    // Variety & Rotation Bonus: Reward clubs that have NOT been featured recently
    if (homeStreak === 0) score += 2
    if (awayStreak === 0) score += 2

    // Small penalty for teams on 2-streak to encourage variety before hitting hard 3-limit
    if (homeStreak === 2) score -= 2
    if (awayStreak === 2) score -= 2

    return {
      id: fixture.id,
      score,
      homeTeamId: homeId,
      awayTeamId: awayId,
      isDisqualified,
      kickoffTime: fixture.kickoff_time,
    }
  })

  // 3. Selection Strategy:
  // First, consider eligible non-disqualified fixtures
  const eligible = scoredList.filter(f => !f.isDisqualified)
  
  // Sort eligible fixtures by score descending, then kickoff time ascending
  eligible.sort((a, b) => b.score - a.score || new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime())

  const chosenIds: number[] = []

  // Greedily pick the top fixtures
  for (const f of eligible) {
    if (chosenIds.length >= 5) break
    chosenIds.push(f.id)
  }

  // Fallback: If we couldn't find 5 eligible fixtures due to tight restrictions,
  // fill remaining spots with the least recently repeated disqualified fixtures
  if (chosenIds.length < 5) {
    const disqualified = scoredList.filter(f => f.isDisqualified && !chosenIds.includes(f.id))
    disqualified.sort((a, b) => b.score - a.score)
    for (const f of disqualified) {
      if (chosenIds.length >= 5) break
      chosenIds.push(f.id)
    }
  }

  return chosenIds
}

/**
 * Server action to get recommended 5 fixtures for the Admin UI on demand.
 */
export async function getAutoRecommendedFixtureIds(gameweekId: number): Promise<{ success: boolean; fixtureIds?: number[]; error?: string }> {
  try {
    const supabase = createAdminClient()

    // 1. Fetch fixtures for target GW
    const { data: targetFixtures, error: fixError } = await supabase
      .from('fixtures')
      .select('id, gameweek_id, kickoff_time, home_team_id, away_team_id, home_team:home_team_id(id, short_name, name), away_team:away_team_id(id, short_name, name)')
      .eq('gameweek_id', gameweekId)
      .order('kickoff_time', { ascending: true })

    if (fixError || !targetFixtures || targetFixtures.length === 0) {
      return { success: false, error: 'No fixtures found for this gameweek.' }
    }

    // 2. Fetch past 3 gameweeks' selected fixtures to compute consecutive streaks
    const minGw = Math.max(1, gameweekId - 3)
    const { data: pastSelectedFixtures } = await supabase
      .from('fixtures')
      .select('gameweek_id, home_team_id, away_team_id')
      .gte('gameweek_id', minGw)
      .lt('gameweek_id', gameweekId)
      .eq('is_selected', true)

    const recentSelectionsByGw = new Map<number, Set<number>>()
    if (pastSelectedFixtures) {
      for (const f of pastSelectedFixtures) {
        if (!recentSelectionsByGw.has(f.gameweek_id)) {
          recentSelectionsByGw.set(f.gameweek_id, new Set())
        }
        const set = recentSelectionsByGw.get(f.gameweek_id)!
        if (f.home_team_id) set.add(f.home_team_id)
        if (f.away_team_id) set.add(f.away_team_id)
      }
    }

    const recommendedIds = scoreAndSelectFixtures(targetFixtures, recentSelectionsByGw, gameweekId)
    return { success: true, fixtureIds: recommendedIds }
  } catch (err: any) {
    console.error('[getAutoRecommendedFixtureIds] Error:', err)
    return { success: false, error: err.message || 'Failed to compute recommendations' }
  }
}

/**
 * Automates:
 * 1. Opening the next gameweek(s) (is_available_to_players = true) ahead of deadline.
 * 2. Auto-selecting 5 marquee & varied fixtures for score predictions if unselected.
 */
export async function autoSelectFixturesAndOpenNextGw(lookaheadCount = 1): Promise<{ success: boolean; results: AutoSelectResult[] }> {
  try {
    const supabase = createAdminClient()

    // 1. Get all gameweeks
    const { data: gameweeks, error: gwError } = await supabase
      .from('gameweeks')
      .select('*')
      .order('id', { ascending: true })

    if (gwError || !gameweeks || gameweeks.length === 0) {
      return { success: false, results: [] }
    }

    const currentGw = gameweeks.find(gw => gw.is_current) || gameweeks[0]
    const currentGwId = currentGw.id

    const results: AutoSelectResult[] = []

    // Fetch past selected fixtures for lookback streak calculation
    const { data: allSelectedFixtures } = await supabase
      .from('fixtures')
      .select('gameweek_id, home_team_id, away_team_id')
      .eq('is_selected', true)

    const recentSelectionsByGw = new Map<number, Set<number>>()
    if (allSelectedFixtures) {
      for (const f of allSelectedFixtures) {
        if (!recentSelectionsByGw.has(f.gameweek_id)) {
          recentSelectionsByGw.set(f.gameweek_id, new Set())
        }
        const set = recentSelectionsByGw.get(f.gameweek_id)!
        if (f.home_team_id) set.add(f.home_team_id)
        if (f.away_team_id) set.add(f.away_team_id)
      }
    }

    for (let offset = 1; offset <= lookaheadCount; offset++) {
      const targetGwId = currentGwId + offset
      const targetGw = gameweeks.find(gw => gw.id === targetGwId)
      if (!targetGw) continue

      // 2. Open Gameweek to players early if not already open
      if (!targetGw.is_available_to_players) {
        await supabase
          .from('gameweeks')
          .update({ is_available_to_players: true })
          .eq('id', targetGwId)
      }

      // 3. Fetch fixtures for this gameweek
      const { data: fixtures } = await supabase
        .from('fixtures')
        .select('id, gameweek_id, kickoff_time, is_selected, home_team_id, away_team_id, home_team:home_team_id(id, short_name, name), away_team:away_team_id(id, short_name, name)')
        .eq('gameweek_id', targetGwId)
        .order('kickoff_time', { ascending: true })

      if (!fixtures || fixtures.length === 0) {
        results.push({ gameweekId: targetGwId, status: 'skipped', message: 'No fixtures found in gameweek' })
        continue
      }

      const existingSelected = fixtures.filter(f => f.is_selected)
      const maxAllowed = Math.min(5, fixtures.length)

      // If already has 5 (or max) selected fixtures by admin, do NOT overwrite
      if (existingSelected.length >= maxAllowed) {
        results.push({
          gameweekId: targetGwId,
          status: 'already_selected',
          selectedFixtureIds: existingSelected.map(f => f.id),
          message: `${existingSelected.length} fixtures already selected by admin. Kept intact.`
        })
        continue
      }

      // 4. Auto-select top 5 using scoring algorithm
      const chosenIds = scoreAndSelectFixtures(fixtures, recentSelectionsByGw, targetGwId)

      if (chosenIds.length > 0) {
        // Reset all in this GW then set chosen to true
        await supabase
          .from('fixtures')
          .update({ is_selected: false })
          .eq('gameweek_id', targetGwId)

        await supabase
          .from('fixtures')
          .update({ is_selected: true })
          .in('id', chosenIds)

        // Update local map so subsequent lookahead loops know what was selected
        const newSet = new Set<number>()
        fixtures.filter(f => chosenIds.includes(f.id)).forEach(f => {
          if (f.home_team_id) newSet.add(f.home_team_id)
          if (f.away_team_id) newSet.add(f.away_team_id)
        })
        recentSelectionsByGw.set(targetGwId, newSet)

        results.push({
          gameweekId: targetGwId,
          status: 'auto_selected',
          selectedFixtureIds: chosenIds,
          message: `Auto-selected ${chosenIds.length} fixtures for Gameweek ${targetGwId}.`
        })
      }
    }

    revalidatePath('/dashboard')
    revalidatePath('/admin')

    return { success: true, results }
  } catch (err: any) {
    console.error('[autoSelectFixturesAndOpenNextGw] Error:', err)
    return { success: false, results: [{ gameweekId: 0, status: 'error', message: err.message }] }
  }
}
