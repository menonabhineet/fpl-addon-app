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
 * Pure scoring function to pick a balanced 5-match curated matchday:
 * - Max 2 Marquee Matches
 * - Min 2 Mid-Table / Competitive Matches
 * - Min 1 Rotation / Drought Wildcard
 * - Strict Hard Rule: No club can repeat for more than 3 consecutive Gameweeks
 * - Heavy Frequency Penalty for teams appearing in >= 2 of last 3 weeks
 * - Freshness Bonus for clubs with long droughts
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

  const allTeamIds = new Set<number>()
  targetFixtures.forEach(f => {
    const hId = f.home_team_id || f.home_team?.id
    const aId = f.away_team_id || f.away_team?.id
    if (hId) allTeamIds.add(hId)
    if (aId) allTeamIds.add(aId)
  })

  // 1. Calculate appearance metrics per team
  const teamConsecutiveStreak = new Map<number, number>()
  const teamRecentCount = new Map<number, number>() // appearances in last 3 GWs
  const teamDrought = new Map<number, number>() // consecutive GWs not selected

  allTeamIds.forEach(teamId => {
    // Consecutive streak (backwards from GW - 1)
    let streak = 0
    for (let offset = 1; offset <= 3; offset++) {
      const pastGw = targetGwId - offset
      const pastTeams = recentSelectionsByGw.get(pastGw)
      if (pastTeams && pastTeams.has(teamId)) {
        streak += 1
      } else {
        break
      }
    }
    teamConsecutiveStreak.set(teamId, streak)

    // Total appearances in last 3 GWs
    let recentCount = 0
    for (let offset = 1; offset <= 3; offset++) {
      const pastGw = targetGwId - offset
      const pastTeams = recentSelectionsByGw.get(pastGw)
      if (pastTeams && pastTeams.has(teamId)) recentCount += 1
    }
    teamRecentCount.set(teamId, recentCount)

    // Drought (how many weeks since last selected)
    let drought = 0
    for (let offset = 1; offset <= 5; offset++) {
      const pastGw = targetGwId - offset
      const pastTeams = recentSelectionsByGw.get(pastGw)
      if (pastTeams && pastTeams.has(teamId)) {
        break
      } else {
        drought += 1
      }
    }
    teamDrought.set(teamId, drought)
  })

  // 2. Classify and score each fixture
  interface EvaluatedFixture {
    id: number
    homeId: number
    awayId: number
    homeShort: string
    awayShort: string
    isMarquee: boolean
    isMidTableOrCompetitive: boolean
    droughtScore: number
    score: number
    isDisqualified: boolean
    kickoffTime: string
  }

  const evaluatedList: EvaluatedFixture[] = targetFixtures.map(fixture => {
    const homeId = fixture.home_team_id || fixture.home_team?.id
    const awayId = fixture.away_team_id || fixture.away_team?.id
    const homeShort = fixture.home_team?.short_name || ''
    const awayShort = fixture.away_team?.short_name || ''

    const homeStreak = teamConsecutiveStreak.get(homeId) || 0
    const awayStreak = teamConsecutiveStreak.get(awayId) || 0
    const homeRecentCount = teamRecentCount.get(homeId) || 0
    const awayRecentCount = teamRecentCount.get(awayId) || 0
    const homeDrought = teamDrought.get(homeId) || 0
    const awayDrought = teamDrought.get(awayId) || 0

    // Hard Disqualification: Cannot repeat for more than 3 consecutive GWs
    const isDisqualified = homeStreak >= 3 || awayStreak >= 3

    const isHomeBig = HIGH_PROFILE_TEAMS.has(homeShort)
    const isAwayBig = HIGH_PROFILE_TEAMS.has(awayShort)
    const isMarquee = isHomeBig && isAwayBig
    const isMidTableOrCompetitive = !isMarquee

    let score = 10 // Base score

    // Marquee / Clash points (Balanced so it doesn't overpower freshness)
    if (isMarquee) score += 4
    else if (isHomeBig || isAwayBig) score += 2

    // Frequency Fatigue Penalty: if a team played in 2 of the last 3 weeks
    if (homeRecentCount >= 2) score -= 4
    if (awayRecentCount >= 2) score -= 4

    // Freshness & Drought Bonus: reward teams that haven't been picked recently
    if (homeDrought >= 2) score += 3 + Math.min(3, homeDrought)
    if (awayDrought >= 2) score += 3 + Math.min(3, awayDrought)

    const totalDrought = homeDrought + awayDrought

    return {
      id: fixture.id,
      homeId,
      awayId,
      homeShort,
      awayShort,
      isMarquee,
      isMidTableOrCompetitive,
      droughtScore: totalDrought,
      score,
      isDisqualified,
      kickoffTime: fixture.kickoff_time || '',
    }
  })

  // 3. Quota-Based Curated Matchday Selection
  const eligible = evaluatedList.filter(f => !f.isDisqualified)
  const selected = new Set<number>()
  const selectedKickoffTimes = new Set<string>()

  const pickFixture = (f: EvaluatedFixture) => {
    selected.add(f.id)
    if (f.kickoffTime) selectedKickoffTimes.add(f.kickoffTime)
  }

  // A. Slot 1 & 2: Up to 2 Marquee Matches
  const marqueeEligible = eligible
    .filter(f => f.isMarquee && !selected.has(f.id))
    .sort((a, b) => b.score - a.score)

  for (let i = 0; i < Math.min(2, marqueeEligible.length); i++) {
    if (selected.size >= 5) break
    pickFixture(marqueeEligible[i])
  }

  // B. Slot 3 & 4: At least 2 Competitive / Mid-Table / Other Matches
  const midTableEligible = eligible
    .filter(f => f.isMidTableOrCompetitive && !selected.has(f.id))
    .sort((a, b) => {
      // Prioritize distinct kickoff times across the weekend
      const aTimeNew = !selectedKickoffTimes.has(a.kickoffTime) ? 2 : 0
      const bTimeNew = !selectedKickoffTimes.has(b.kickoffTime) ? 2 : 0
      return (b.score + bTimeNew) - (a.score + aTimeNew)
    })

  for (let i = 0; i < Math.min(2, midTableEligible.length); i++) {
    if (selected.size >= 5) break
    pickFixture(midTableEligible[i])
  }

  // C. Slot 5: Rotation / High-Drought Wildcard
  const rotationEligible = eligible
    .filter(f => !selected.has(f.id))
    .sort((a, b) => b.droughtScore - a.droughtScore || b.score - a.score)

  if (rotationEligible.length > 0 && selected.size < 5) {
    pickFixture(rotationEligible[0])
  }

  // D. Fill remaining slots to reach exactly 5 fixtures
  if (selected.size < 5) {
    const remainingEligible = eligible
      .filter(f => !selected.has(f.id))
      .sort((a, b) => b.score - a.score)

    for (const f of remainingEligible) {
      if (selected.size >= 5) break
      pickFixture(f)
    }
  }

  // Fallback: If disqualified fixtures are needed to reach 5
  if (selected.size < 5) {
    const remainingDisqualified = evaluatedList
      .filter(f => !selected.has(f.id))
      .sort((a, b) => b.score - a.score)

    for (const f of remainingDisqualified) {
      if (selected.size >= 5) break
      pickFixture(f)
    }
  }

  return Array.from(selected)
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

    // 2. Fetch past 5 gameweeks' selected fixtures to compute consecutive streaks and droughts
    const minGw = Math.max(1, gameweekId - 5)
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

    const now = new Date()

    // Process Current Gameweek (offset = 0) and Upcoming Gameweeks (offset = 1..lookaheadCount)
    for (let offset = 0; offset <= lookaheadCount; offset++) {
      const targetGwId = currentGwId + offset
      const targetGw = gameweeks.find(gw => gw.id === targetGwId)
      if (!targetGw) continue

      // If evaluating current gameweek and its deadline has already passed, do not alter live matches
      const isPastDeadline = targetGw.deadline_time ? now >= new Date(targetGw.deadline_time) : false
      if (offset === 0 && isPastDeadline) {
        continue
      }

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
        results.push({ gameweekId: targetGwId, status: 'skipped', message: 'Blank Gameweek: No fixtures scheduled' })
        continue
      }

      const existingSelected = fixtures.filter(f => f.is_selected)
      const maxAllowed = Math.min(5, fixtures.length)

      // If already has maxAllowed selected fixtures by admin, do NOT overwrite
      if (existingSelected.length >= maxAllowed) {
        results.push({
          gameweekId: targetGwId,
          status: 'already_selected',
          selectedFixtureIds: existingSelected.map(f => f.id),
          message: `${existingSelected.length} fixtures already selected by admin. Kept intact.`
        })
        continue
      }

      // 4. Auto-select top fixtures using quota & variety scoring algorithm
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
