// lib/actions/cron.ts
import { createAdminClient } from '@/lib/supabase/admin'

export async function syncResults() {
  const supabase = createAdminClient()

  const response = await fetch('https://fantasy.premierleague.com/api/fixtures/', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch FPL fixtures')
  const allFixtures = await response.json()

  const activeFixtures = allFixtures.filter((f: any) => f.started === true)

  let updateCount = 0

  const updatePromises = activeFixtures.map(async (fixture: any) => {
    const { error } = await supabase
      .from('fixtures')
      .update({
        home_score: fixture.team_h_score ?? 0,
        away_score: fixture.team_a_score ?? 0,
        is_finished: fixture.finished || fixture.finished_provisional
      })
      .eq('id', fixture.id)

    if (error) {
      console.error(`Error updating fixture ${fixture.id}:`, error)
    } else {
      updateCount++
    }
  })

  await Promise.all(updatePromises)
  return updateCount
}

export async function calculateScores(targetGwParam?: number) {
  const supabase = createAdminClient()

  let TARGET_GW: number

  if (targetGwParam) {
    TARGET_GW = targetGwParam
  } else {
    const { data: currentGw } = await supabase
      .from('gameweeks')
      .select('id')
      .eq('is_current', true)
      .maybeSingle()

    TARGET_GW = currentGw?.id || 1
  }

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('*')
    .eq('gameweek_id', TARGET_GW)
    .eq('is_finished', true)

  if (!fixtures || fixtures.length === 0) {
    return { success: true, message: `No finished fixtures found to grade for Gameweek ${TARGET_GW}.` }
  }

  const fixtureIds = fixtures.map((f) => f.id)

  // 1. GRADE SCORE PREDICTIONS
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
        match.home_score > match.away_score ? 'H' : match.home_score < match.away_score ? 'A' : 'D'
      const predOutcome =
        pick.predicted_home_score > pick.predicted_away_score ? 'H' : pick.predicted_home_score < pick.predicted_away_score ? 'A' : 'D'

      if (match.home_score === pick.predicted_home_score && match.away_score === pick.predicted_away_score) {
        points += 3
      } else if (actualOutcome === predOutcome) {
        points += 1
      }

      const actualTotalGoals = match.home_score + match.away_score
      const predictedTotalGoals = pick.predicted_home_score + pick.predicted_away_score

      if (actualOutcome === predOutcome && actualTotalGoals >= 5 && predictedTotalGoals >= 5) {
        points += 1
      }

      const currentTotal = userScorePicksMap.get(pick.user_id) || 0
      userScorePicksMap.set(pick.user_id, currentTotal + points)

      scorePickUpdates.push(
        supabase.from('score_predictions').update({ points_earned: points }).eq('id', pick.id)
      )
    }
  }

  // 2. GRADE TEAM PICKS
  const { data: teamPicks } = await supabase
    .from('team_predictions')
    .select('*')
    .eq('gameweek_id', TARGET_GW)

  const teamPickUpdates: any[] = []
  const userTeamPicksMap = new Map<string, number>()

  if (teamPicks && teamPicks.length > 0) {
    for (const pick of teamPicks) {
      let match = null
      if (pick.fixture_id) {
        match = fixtures.find((f) => f.id === pick.fixture_id)
      } else {
        match = fixtures.find(
          (f) => f.home_team_id === pick.team_id || f.away_team_id === pick.team_id
        )
      }
      let points = 0
      if (match) {
        const isHomeTeam = match.home_team_id === pick.team_id
        const teamWon = isHomeTeam ? match.home_score > match.away_score : match.away_score > match.home_score
        if (teamWon) points = 1
      }

      userTeamPicksMap.set(pick.user_id, points)

      teamPickUpdates.push(
        supabase.from('team_predictions').update({ points_earned: points }).eq('id', pick.id)
      )
    }
  }

  // 3. GRADE FANTASTIC FOUR
  const fplLiveRes = await fetch(`https://fantasy.premierleague.com/api/event/${TARGET_GW}/live/`, { cache: 'no-store' })
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
      const playerStats = fplLiveData.elements?.find((el: any) => el.id === pick.player_id)
      const points = playerStats ? playerStats.stats.total_points : 0

      const current = userF4PicksMap.get(pick.user_id) || { count: 0, points: 0 }
      userF4PicksMap.set(pick.user_id, { count: current.count + 1, points: current.points + points })

      f4Updates.push(
        supabase.from('fantastic_four').update({ points_earned: points }).eq('id', pick.id)
      )
    }
  }

  // Execute all individual row updates simultaneously
  await Promise.all([...scorePickUpdates, ...teamPickUpdates, ...f4Updates])

  // ==========================================
  // 3.5. GET BONUS PREDICTIONS
  // ==========================================
  const { data: bq } = await supabase
    .from('bonus_questions')
    .select('id')
    .eq('gameweek', TARGET_GW)
    .maybeSingle()

  const userBonusMap = new Map<string, number>()
  if (bq) {
    const { data: bPicks } = await supabase
      .from('bonus_predictions')
      .select('user_id, awarded_points')
      .eq('question_id', bq.id)
    
    if (bPicks) {
      for (const pick of bPicks) {
        userBonusMap.set(pick.user_id, pick.awarded_points || 0)
      }
    }
  }

  // 4. PENALTY AUDIT & LEADERBOARD AGGREGATION
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (authError) throw authError

  const leaderboardUpserts: any[] = []

  for (const user of users) {
    let scorePts = 0, teamPts = 0, ffPts = 0, penaltyPts = 0

    const hasScorePicks = userScorePicksMap.has(user.id)
    const bonusPts = userBonusMap.get(user.id) || 0

    if (!hasScorePicks) {
      scorePts = -1
      penaltyPts -= 1
    } else {
      scorePts = userScorePicksMap.get(user.id) || 0
    }

    const hasTeamPick = userTeamPicksMap.has(user.id)
    if (!hasTeamPick) {
      teamPts = -1
      penaltyPts -= 1
    } else {
      teamPts = userTeamPicksMap.get(user.id) || 0
    }

    const f4Data = userF4PicksMap.get(user.id)
    if (!f4Data || f4Data.count === 0) {
      ffPts = -5
      penaltyPts -= 5
    } else {
      ffPts = f4Data.points
    }

    const totalPts = scorePts + teamPts + ffPts + bonusPts

    leaderboardUpserts.push({
      user_id: user.id,
      gameweek_id: TARGET_GW,
      score_points: scorePts,
      team_points: teamPts,
      fantastic_four_points: ffPts,
      penalty_points: penaltyPts,
      bonus_points: bonusPts,
      total_points: totalPts,
    })
  }

  if (leaderboardUpserts.length > 0) {
    const { error: upsertError } = await supabase
      .from('user_gameweek_scores')
      .upsert(leaderboardUpserts, { onConflict: 'user_id, gameweek_id' })

    if (upsertError) throw upsertError
  }

  return { success: true, users_processed: users?.length || 0, gw: TARGET_GW }
}
