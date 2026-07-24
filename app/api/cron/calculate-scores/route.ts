// app/api/cron/calculate-scores/route.ts
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  // 1. Authorization Guard (Enforced in Production)
  const authHeader = request.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const url = new URL(request.url)
    const paramGw = url.searchParams.get('gw')

    let TARGET_GW: number

    // Allow overriding GW via query param (?gw=1) or default to the active Gameweek
    if (paramGw) {
      TARGET_GW = parseInt(paramGw, 10)
    } else {
      const { data: currentGw } = await supabase
        .from('gameweeks')
        .select('id')
        .eq('is_current', true)
        .maybeSingle()

      TARGET_GW = currentGw?.id || 1
    }

    // 2. Fetch Finished Fixtures for Target Gameweek
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('*')
      .eq('gameweek_id', TARGET_GW)
      .eq('is_finished', true)

    if (!fixtures || fixtures.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No finished fixtures found to grade for Gameweek ${TARGET_GW}.`,
      })
    }

    const fixtureIds = fixtures.map((f) => f.id)

    // ==========================================
    // 1. GRADE SCORE PREDICTIONS
    // ==========================================
    const { data: scorePicks } = await supabase
      .from('score_predictions')
      .select('*')
      .in('fixture_id', fixtureIds)

    const scorePickUpdates: any[] = []
    const userScorePicksMap = new Map<string, number>()

    if (scorePicks && scorePicks.length > 0) {
      for (const pick of scorePicks) {
        const match = fixtures.find((f) => f.id === pick.fixture_id)
        if (!match) continue

        let points = 0
        const actualOutcome =
          match.home_score > match.away_score
            ? 'H'
            : match.home_score < match.away_score
              ? 'A'
              : 'D'
        const predOutcome =
          pick.predicted_home_score > pick.predicted_away_score
            ? 'H'
            : pick.predicted_home_score < pick.predicted_away_score
              ? 'A'
              : 'D'

        if (
          match.home_score === pick.predicted_home_score &&
          match.away_score === pick.predicted_away_score
        ) {
          points += 3
        } else if (actualOutcome === predOutcome) {
          points += 1
        }

        const actualTotalGoals = match.home_score + match.away_score
        const predictedTotalGoals =
          pick.predicted_home_score + pick.predicted_away_score

        if (
          actualOutcome === predOutcome &&
          actualTotalGoals >= 5 &&
          predictedTotalGoals >= 5
        ) {
          points += 1
        }

        const currentTotal = userScorePicksMap.get(pick.user_id) || 0
        userScorePicksMap.set(pick.user_id, currentTotal + points)

        scorePickUpdates.push(
          supabase
            .from('score_predictions')
            .update({ points_earned: points })
            .eq('id', pick.id)
        )
      }
    }

    // ==========================================
    // 2. GRADE TEAM PICKS
    // ==========================================
    const { data: teamPicks } = await supabase
      .from('team_predictions')
      .select('*')
      .eq('gameweek_id', TARGET_GW)

    const teamPickUpdates: any[] = []
    const userTeamPicksMap = new Map<string, number>()

    if (teamPicks && teamPicks.length > 0) {
      for (const pick of teamPicks) {
        const match = fixtures.find(
          (f) =>
            f.home_team_id === pick.team_id || f.away_team_id === pick.team_id
        )
        let points = 0
        if (match) {
          const isHomeTeam = match.home_team_id === pick.team_id
          const teamWon = isHomeTeam
            ? match.home_score > match.away_score
            : match.away_score > match.home_score
          if (teamWon) points = 1
        }

        userTeamPicksMap.set(pick.user_id, points)

        teamPickUpdates.push(
          supabase
            .from('team_predictions')
            .update({ points_earned: points })
            .eq('id', pick.id)
        )
      }
    }

    // ==========================================
    // 3. GRADE FANTASTIC FOUR
    // ==========================================
    const fplLiveRes = await fetch(
      `https://fantasy.premierleague.com/api/event/${TARGET_GW}/live/`,
      { cache: 'no-store' }
    )

    let fplLiveData: any = { elements: [] }
    if (fplLiveRes.ok) {
      fplLiveData = await fplLiveRes.json()
    } else {
      console.warn(`FPL Live API returned status ${fplLiveRes.status} for GW ${TARGET_GW}`)
    }

    const { data: f4Picks } = await supabase
      .from('fantastic_four')
      .select('*')
      .eq('gameweek_id', TARGET_GW)

    const f4Updates: any[] = []
    const userF4PicksMap = new Map<string, { count: number; points: number }>()

    if (f4Picks && f4Picks.length > 0) {
      for (const pick of f4Picks) {
        const playerStats = fplLiveData.elements?.find(
          (el: any) => el.id === pick.player_id
        )
        const points = playerStats ? playerStats.stats.total_points : 0

        const current = userF4PicksMap.get(pick.user_id) || {
          count: 0,
          points: 0,
        }
        userF4PicksMap.set(pick.user_id, {
          count: current.count + 1,
          points: current.points + points,
        })

        f4Updates.push(
          supabase
            .from('fantastic_four')
            .update({ points_earned: points })
            .eq('id', pick.id)
        )
      }
    }

    // Execute all individual row updates simultaneously
    await Promise.all([...scorePickUpdates, ...teamPickUpdates, ...f4Updates])

    // ==========================================
    // 4. PENALTY AUDIT & LEADERBOARD AGGREGATION
    // ==========================================
    const {
      data: { users },
      error: authError,
    } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (authError) throw authError

    const leaderboardUpserts: any[] = []

    for (const user of users) {
      let scorePts = 0,
        teamPts = 0,
        ffPts = 0,
        penaltyPts = 0

      // Audit Score Picks
      const hasScorePicks = userScorePicksMap.has(user.id)
      if (!hasScorePicks) {
        scorePts = -1
        penaltyPts -= 1 // Penalty for missing score predictions
      } else {
        scorePts = userScorePicksMap.get(user.id) || 0
      }

      // Audit Team Pick
      const hasTeamPick = userTeamPicksMap.has(user.id)
      if (!hasTeamPick) {
        teamPts = -1
        penaltyPts -= 1 // Penalty for missing team prediction
      } else {
        teamPts = userTeamPicksMap.get(user.id) || 0
      }

      // Audit Fantastic Four
      const f4Data = userF4PicksMap.get(user.id)
      if (!f4Data || f4Data.count === 0) {
        ffPts = -5
        penaltyPts -= 5 // Penalty for missing Fantastic Four draft
      } else {
        ffPts = f4Data.points
      }

      const totalPts = scorePts + teamPts + ffPts // penaltyPts is already accounted for in the individual scores

      leaderboardUpserts.push({
        user_id: user.id,
        gameweek_id: TARGET_GW,
        score_points: scorePts,
        team_points: teamPts,
        fantastic_four_points: ffPts,
        penalty_points: penaltyPts,
        total_points: totalPts,
      })
    }

    // Perform a single bulk upsert for all user scores
    if (leaderboardUpserts.length > 0) {
      const { error: upsertError } = await supabase
        .from('user_gameweek_scores')
        .upsert(leaderboardUpserts, { onConflict: 'user_id, gameweek_id' })

      if (upsertError) throw upsertError
    }

    return NextResponse.json({
      success: true,
      message: `Successfully graded predictions, applied penalties, and updated leaderboard for Gameweek ${TARGET_GW}!`,
      users_processed: users.length,
    })
  } catch (error: any) {
    console.error('Grading Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'An unknown error occurred' },
      { status: 500 }
    )
  }
}