import { createAdminClient } from '@/lib/supabase/admin'
import { fetchWithRetry } from '@/lib/fpl-api'

function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

export async function syncResults() {
  const supabase = createAdminClient()

  const response = await fetchWithRetry('https://fantasy.premierleague.com/api/fixtures/', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch FPL fixtures')
  const allFixtures = await response.json()

  // Fetch current state of fixtures from DB to only update if scores or status actually changed
  const { data: dbFixtures } = await supabase.from('fixtures').select('id, home_score, away_score, is_finished')
  const dbFixtureMap = new Map<number, { home_score: number | null; away_score: number | null; is_finished: boolean }>()
  if (dbFixtures) {
    dbFixtures.forEach(f => dbFixtureMap.set(f.id, f))
  }

  let updateCount = 0

  const changedFixtures = allFixtures.filter((fixture: any) => {
    if (!fixture.started) return false
    const existing = dbFixtureMap.get(fixture.id)
    if (!existing) return true
    const newFinished = Boolean(fixture.finished || fixture.finished_provisional)
    const newHomeScore = fixture.team_h_score ?? 0
    const newAwayScore = fixture.team_a_score ?? 0

    return (
      existing.home_score !== newHomeScore ||
      existing.away_score !== newAwayScore ||
      existing.is_finished !== newFinished
    )
  })

  for (const fixture of changedFixtures) {
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
  }
  
  // Also sync Gameweeks (Deadlines and is_current status) to catch any pushed deadlines in real-time
  // (Disabled during local development so it doesn't overwrite your manual test deadlines)
  if (process.env.NODE_ENV !== 'development') {
    try {
      const staticRes = await fetchWithRetry('https://fantasy.premierleague.com/api/bootstrap-static/', { cache: 'no-store' })
      if (staticRes.ok) {
        const data = await staticRes.json()
        if (data && data.events) {
          const gameweeksData = data.events.map((gw: any) => ({
            id: gw.id,
            name: gw.name,
            deadline_time: gw.deadline_time,
            is_current: gw.is_current,
          }))
          await supabase.from('gameweeks').upsert(gameweeksData, { onConflict: 'id' })
        }
      }
    } catch (err) {
      console.error("Failed to sync gameweeks in cron:", err)
    }
  }

  return updateCount
}

export async function calculateScores(targetGwParam?: number) {
  const supabase = createAdminClient()

  let TARGET_GW: number

  if (targetGwParam) {
    TARGET_GW = targetGwParam
  } else {
    const { data: currentGws } = await supabase
      .from('gameweeks')
      .select('id, is_survivor_skipped')
      .eq('is_current', true)
      .order('id', { ascending: false })
      .limit(1)

    TARGET_GW = currentGws?.[0]?.id || 1
  }

  // Fetch gameweek details for the target
  const { data: gwDetails } = await supabase
    .from('gameweeks')
    .select('deadline_time, is_survivor_skipped')
    .eq('id', TARGET_GW)
    .single()
    
  const isSurvivorSkipped = gwDetails?.is_survivor_skipped || false

  // Fetch ALL users directly from profiles table for sub-50ms execution
  const { data: allUsers, error: profilesError } = await supabase
    .from('profiles')
    .select('id')
    .range(0, 9999)

  if (profilesError) throw profilesError

  const { data: allFixturesGw } = await supabase
    .from('fixtures')
    .select('*')
    .eq('gameweek_id', TARGET_GW)

  if (!allFixturesGw || allFixturesGw.length === 0) {
    return { success: true, message: `No fixtures found to grade for Gameweek ${TARGET_GW}.` }
  }

  const finishedFixtures = allFixturesGw.filter(f => f.is_finished)
  const isGameweekFullyFinished = finishedFixtures.length === allFixturesGw.length

  const fixtureIds = finishedFixtures.map((f) => f.id)

  // 1. GRADE SCORE PREDICTIONS
  // For actual grading, we only care about finished fixtures
  let scorePicks: any[] = []
  if (fixtureIds.length > 0) {
    const { data } = await supabase
      .from('score_predictions')
      .select('*')
      .in('fixture_id', fixtureIds)
    scorePicks = data || []
  }

  const scorePickUpdates: any[] = []
  const scorePickUpdateData: any[] = []
  const userScorePicksMap = new Map<string, number>()

  if (scorePicks && scorePicks.length > 0) {
    for (const pick of scorePicks) {
      const match = finishedFixtures.find((f) => f.id === pick.fixture_id)
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

      scorePickUpdateData.push({ ...pick, points_earned: points })
    }
  }

  // 2. GRADE SURVIVOR STREAK PICKS & UPDATE LEADERBOARD POINTS
  const userTeamPicksMap = new Map<string, number>()
  const teamPickUpdates: any[] = []
  const teamPickPointsUpdatesMap = new Map<string, { points_earned: number, match_result: string | null }>()
  
  // A. Grade ALL team picks for this Gameweek (Survivor Streak Mode)
  const { data: teamPicks } = await supabase
    .from('team_predictions')
    .select('*')
    .eq('gameweek_id', TARGET_GW)
    .range(0, 9999)

  // Query all gameweeks to know if any prior gameweeks were admin-skipped
  const { data: allGwRecords } = await supabase
    .from('gameweeks')
    .select('id, is_survivor_skipped')
    .range(0, 9999)

  const skippedGwsSet = new Set<number>()
  allGwRecords?.forEach(gw => {
    if (gw.is_survivor_skipped) skippedGwsSet.add(gw.id)
  })

  // Query past picks before TARGET_GW to accurately calculate each user's consecutive winning streak
  let pastPicksBeforeGw: any[] = []
  let fetchStart = 0
  const fetchLimit = 1000
  while (true) {
    const { data: batch, error } = await supabase
      .from('team_predictions')
      .select('user_id, gameweek_id, match_result, points_earned')
      .lt('gameweek_id', TARGET_GW)
      .order('gameweek_id', { ascending: false })
      .range(fetchStart, fetchStart + fetchLimit - 1)
    
    if (error || !batch || batch.length === 0) break
    pastPicksBeforeGw = pastPicksBeforeGw.concat(batch)
    if (batch.length < fetchLimit) break
    fetchStart += fetchLimit
  }

  const userHistoricalPicksMap = new Map<string, any[]>()
  if (pastPicksBeforeGw) {
    for (const p of pastPicksBeforeGw) {
      if (!userHistoricalPicksMap.has(p.user_id)) {
        userHistoricalPicksMap.set(p.user_id, [])
      }
      userHistoricalPicksMap.get(p.user_id)!.push(p)
    }
  }

  if (teamPicks) {
    for (const pick of teamPicks) {
      let points = 0
      let matchResult = null
      
      let match = null
      if (pick.fixture_id) {
        match = finishedFixtures.find(f => f.id === pick.fixture_id)
      } else {
        match = finishedFixtures.find(f => f.home_team_id === pick.team_id || f.away_team_id === pick.team_id)
      }
      
      if (match) {
        const isHomeTeam = match.home_team_id === pick.team_id
        const homeScore = Number(match.home_score || 0)
        const awayScore = Number(match.away_score || 0)
        const teamWon = isHomeTeam ? homeScore > awayScore : awayScore > homeScore
        const isDraw = homeScore === awayScore
        
        if (teamWon) {
          matchResult = 'win'
          
          // Calculate active streak strictly checking consecutive gameweeks backwards from TARGET_GW - 1
          const userHistory = userHistoricalPicksMap.get(pick.user_id) || []
          const userPicksByGw = new Map<number, any>()
          for (const hp of userHistory) {
            userPicksByGw.set(hp.gameweek_id, hp)
          }

          let prevWinsCount = 0
          let checkGw = TARGET_GW - 1
          while (checkGw >= 1) {
            if (skippedGwsSet.has(checkGw)) {
              // Gameweek was skipped by admin, keep streak alive across the skipped week
              checkGw -= 1
              continue
            }
            const pastPick = userPicksByGw.get(checkGw)
            if (pastPick && (pastPick.match_result === 'win' || (pastPick.points_earned && pastPick.points_earned > 0))) {
              prevWinsCount += 1
              checkGw -= 1
            } else {
              // Missed pick or loss/draw breaks consecutive streak
              break
            }
          }
          const currentStreak = prevWinsCount + 1
          // Escalating streak formula: Streak 1 = 1pt, Streak 2 = 2pts, Streak 3 = 3pts, etc.
          points = currentStreak
        } else {
          matchResult = isDraw ? 'draw' : 'loss'
          points = 0
        }
      } else {
        // Match not finished or invalid. 
        if (isGameweekFullyFinished) {
          matchResult = 'loss'
          points = 0
        }
      }
      
      if (isSurvivorSkipped) {
         points = 0 // No points awarded if skipped
      }
      
      userTeamPicksMap.set(pick.user_id, points)
      
      // Update team_predictions if match is finished or gameweek is fully finished
      if (match || isGameweekFullyFinished) {
         teamPickPointsUpdatesMap.set(pick.id, { points_earned: points, match_result: matchResult })
      }
    }
  }

  // Convert the map of team pick updates into the actual Supabase update queries
  const teamPredictionUpserts: any[] = []
  for (const [pickId, updates] of teamPickPointsUpdatesMap.entries()) {
    const originalPick = teamPicks?.find(p => p.id === pickId)
    if (originalPick) {
      teamPredictionUpserts.push({ ...originalPick, ...updates })
    }
  }
  if (teamPredictionUpserts.length > 0) {
    const chunks = chunkArray(teamPredictionUpserts, 500)
    for (const chunk of chunks) {
      teamPickUpdates.push(supabase.from('team_predictions').upsert(chunk))
    }
  }

  // 3. GRADE FANTASTIC FOUR
  const fplLiveRes = await fetchWithRetry(`https://fantasy.premierleague.com/api/event/${TARGET_GW}/live/`, { cache: 'no-store' })
  let fplLiveData: any = { elements: [] }
  let skipF4Update = false
  if (fplLiveRes.ok) {
    fplLiveData = await fplLiveRes.json()
  } else {
    console.warn(`FPL Live API returned status ${fplLiveRes.status} for GW ${TARGET_GW}. Skipping F4 live updates.`)
    skipF4Update = true
  }

  const { data: f4Picks } = await supabase
    .from('fantastic_four')
    .select('*')
    .eq('gameweek_id', TARGET_GW)
    .range(0, 9999)

  const f4Updates: any[] = []
  const f4UpdateData: any[] = []
  const userF4PicksMap = new Map<string, { count: number; points: number }>()

  if (f4Picks && f4Picks.length > 0) {
    for (const pick of f4Picks) {
      const playerStats = fplLiveData.elements?.find((el: any) => el.id === pick.player_id)
      const points = skipF4Update ? (pick.points_earned || 0) : (playerStats ? playerStats.stats.total_points : 0)

      const current = userF4PicksMap.get(pick.user_id) || { count: 0, points: 0 }
      userF4PicksMap.set(pick.user_id, { count: current.count + 1, points: current.points + points })

      if (!skipF4Update) {
        f4UpdateData.push({ ...pick, points_earned: points })
      }
    }
  }

  if (scorePickUpdateData.length > 0) {
    const chunks = chunkArray(scorePickUpdateData, 500)
    for (const chunk of chunks) {
      scorePickUpdates.push(supabase.from('score_predictions').upsert(chunk))
    }
  }
  if (f4UpdateData.length > 0) {
    const chunks = chunkArray(f4UpdateData, 500)
    for (const chunk of chunks) {
      f4Updates.push(supabase.from('fantastic_four').upsert(chunk))
    }
  }

  // Execute all updates sequentially to avoid connection pooling exhaustion on Supabase Free Tier
  const allUpsertQueries = [...scorePickUpdates, ...teamPickUpdates, ...f4Updates]
  for (const query of allUpsertQueries) {
    await query
  }

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
      .range(0, 9999)
    
    if (bPicks) {
      for (const pick of bPicks) {
        userBonusMap.set(pick.user_id, pick.awarded_points || 0)
      }
    }
  }

  // 4. LEADERBOARD AGGREGATION (0-Point Floor, No Negative Penalties)
  const leaderboardUpserts: any[] = []
  const userProfileStreakUpdates: { id: string; current_streak: number; best_streak: number }[] = []

  for (const user of allUsers) {
    const scorePts = userScorePicksMap.get(user.id) || 0
    const teamPts = userTeamPicksMap.get(user.id) || 0
    const f4Data = userF4PicksMap.get(user.id)
    const ffPts = f4Data ? f4Data.points : 0
    const bonusPts = userBonusMap.get(user.id) || 0
    const penaltyPts = 0

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

    // Compute updated streaks for profiles
    const userHistory = userHistoricalPicksMap.get(user.id) || []
    const userPicksByGw = new Map<number, any>()
    for (const hp of userHistory) {
      userPicksByGw.set(hp.gameweek_id, hp)
    }
    const currentPick = teamPicks?.find(p => p.user_id === user.id)
    if (currentPick) {
      const updatedPick = teamPickPointsUpdatesMap.get(currentPick.id)
      if (updatedPick) {
        userPicksByGw.set(TARGET_GW, { ...currentPick, ...updatedPick })
      }
    }

    let curStreak = 0
    let checkGw = TARGET_GW
    while (checkGw >= 1) {
      if (skippedGwsSet.has(checkGw)) {
        checkGw -= 1
        continue
      }
      const pastPick = userPicksByGw.get(checkGw)
      if (pastPick && (pastPick.match_result === 'win' || (pastPick.points_earned && pastPick.points_earned > 0))) {
        curStreak += 1
        checkGw -= 1
      } else {
        break
      }
    }

    let bstStreak = 0
    let tmpStreak = 0
    for (let gw = 1; gw <= 38; gw++) {
      if (skippedGwsSet.has(gw)) continue
      const pick = userPicksByGw.get(gw)
      if (pick && (pick.match_result === 'win' || (pick.points_earned && pick.points_earned > 0))) {
        tmpStreak += 1
        if (tmpStreak > bstStreak) bstStreak = tmpStreak
      } else {
        tmpStreak = 0
      }
    }

    userProfileStreakUpdates.push({
      id: user.id,
      current_streak: curStreak,
      best_streak: bstStreak,
    })
  }

  if (leaderboardUpserts.length > 0) {
    const chunks = chunkArray(leaderboardUpserts, 500)
    for (const chunk of chunks) {
      const { error: upsertError } = await supabase
        .from('user_gameweek_scores')
        .upsert(chunk, { onConflict: 'user_id, gameweek_id' })

      if (upsertError) throw upsertError
    }
  }

  if (userProfileStreakUpdates.length > 0) {
    const profileChunks = chunkArray(userProfileStreakUpdates, 500)
    for (const chunk of profileChunks) {
      const { error: profError } = await supabase
        .from('profiles')
        .upsert(chunk, { onConflict: 'id' })

      if (profError) {
        console.error('Error updating profile streaks:', profError)
      }
    }
  }

  return { success: true, users_processed: allUsers.length || 0, gw: TARGET_GW }
}

/**
 * Robust Sequential Window Grading:
 * Iterates through recent gameweeks (from currentGw - lookback up to currentGw)
 * to ensure that completed gameweeks are finalized with locked official points,
 * survivor streaks are chronologically evaluated, and live gameweeks are kept current.
 */
export async function calculateActiveScoresWindow(lookback = 1) {
  const supabase = createAdminClient()
  const { data: currentGws } = await supabase
    .from('gameweeks')
    .select('id')
    .eq('is_current', true)
    .order('id', { ascending: false })
    .limit(1)

  const currentGwId = currentGws?.[0]?.id || 1
  const startGw = Math.max(1, currentGwId - lookback)

  const results: any[] = []
  for (let gw = startGw; gw <= currentGwId; gw++) {
    const res = await calculateScores(gw)
    results.push(res)
  }

  return {
    success: true,
    currentGw: currentGwId,
    gradedWindow: `${startGw}..${currentGwId}`,
    results
  }
}

