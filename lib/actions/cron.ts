import { createAdminClient } from '@/lib/supabase/admin'
import { fetchWithRetry } from '@/lib/fpl-api'

export async function syncResults() {
  const supabase = createAdminClient()

  const response = await fetchWithRetry('https://fantasy.premierleague.com/api/fixtures/', { cache: 'no-store' })
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
          is_finished: gw.finished || false,
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
    const { data: currentGw } = await supabase
      .from('gameweeks')
      .select('id, is_survivor_skipped')
      .eq('is_current', true)
      .maybeSingle()

    TARGET_GW = currentGw?.id || 1
  }

  // Fetch gameweek details for the target
  const { data: gwDetails } = await supabase
    .from('gameweeks')
    .select('deadline_time, is_survivor_skipped')
    .eq('id', TARGET_GW)
    .single()
    
  const isSurvivorSkipped = gwDetails?.is_survivor_skipped || false
  const isPastDeadline = gwDetails?.deadline_time ? new Date() > new Date(gwDetails.deadline_time) : false

  // Fetch ALL users with pagination to prevent 1000-user cap
  let allUsers: any[] = []
  let page = 1
  let hasMoreUsers = true
  while (hasMoreUsers) {
    const { data: { users: pageUsers }, error: authError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (authError) throw authError
    if (pageUsers && pageUsers.length > 0) {
      allUsers.push(...pageUsers)
      page++
    } else {
      hasMoreUsers = false
    }
  }

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
  const allFixtureIds = allFixturesGw.map((f) => f.id)

  // 1. GRADE SCORE PREDICTIONS
  // For actual grading, we only care about finished fixtures
  const { data: scorePicks } = await supabase
    .from('score_predictions')
    .select('*')
    .in('fixture_id', fixtureIds)
    .limit(10000)
    
  // For penalty logic, we need to know if they made ANY picks for this gameweek
  const { data: allScorePicksGw } = await supabase
    .from('score_predictions')
    .select('user_id')
    .in('fixture_id', allFixtureIds)
    .limit(10000)
    
  const usersWithScorePicksGw = new Set(allScorePicksGw?.map(p => p.user_id) || [])

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

  // 2. GRADE SURVIVOR PICKS & UPDATE LEADERBOARD POINTS
  const userTeamPicksMap = new Map<string, number>()
  const teamPickUpdates: any[] = []
  const teamPickPointsUpdatesMap = new Map<string, { points_earned: number, match_result: string | null }>()
  const survivorEntryUpdates: any[] = []
  
  // Determine if this is a Historic Regrade
  const { data: activeRound } = await supabase.from('survivor_rounds').select('*').eq('status', 'active').maybeSingle()
  const isHistoricRegrade = activeRound ? TARGET_GW < activeRound.start_gameweek_id : true
  
  // Fetch historic round completions to restore survivor bonuses during regrades
  const { data: endingRounds } = await supabase
    .from('survivor_rounds')
    .select('id')
    .eq('end_gameweek_id', TARGET_GW)
    
  let historicWinners = new Set<string>()
  if (isHistoricRegrade && endingRounds && endingRounds.length > 0) {
    const roundIds = endingRounds.map(r => r.id)
    const { data: winnerEntries } = await supabase
      .from('survivor_entries')
      .select('user_id')
      .in('round_id', roundIds)
      .eq('status', 'winner')
    historicWinners = new Set(winnerEntries?.map(w => w.user_id) || [])
  }
  
  // A. Grade ALL team picks for this Gameweek (for points/leaderboard)
  const { data: teamPicks } = await supabase
    .from('team_predictions')
    .select('*')
    .eq('gameweek_id', TARGET_GW)
    .limit(10000)

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
          points = 1
          matchResult = 'win'
        } else {
          matchResult = isDraw ? 'draw' : 'loss'
        }
      } else {
        // Match not finished or invalid. 
        if (isGameweekFullyFinished) {
          matchResult = 'loss'
        }
      }
      
      if (isSurvivorSkipped) {
         points = 0 // No points awarded if skipped
      } else if (isHistoricRegrade && historicWinners.has(pick.user_id)) {
         points += 1 // Restore historic survivor bonus
      }
      
      userTeamPicksMap.set(pick.user_id, points)
      
      // Update team_predictions if match is finished or gameweek is fully finished
      if (match || isGameweekFullyFinished) {
         teamPickPointsUpdatesMap.set(pick.id, { points_earned: points, match_result: matchResult })
      }
    }
  }

  // B. Resolve Survivor State Machine (ONLY if we are processing the LIVE gameweek)
  
  if (activeRound && !isHistoricRegrade && !isSurvivorSkipped) {
    // Query all entries that entered this gameweek as 'alive' (or were marked eliminated in this specific gameweek during previous runs)
    const { data: roundEntries } = await supabase
      .from('survivor_entries')
      .select('*')
      .eq('round_id', activeRound.id)
      .or(`status.eq.alive,and(status.eq.eliminated,eliminated_gameweek_id.eq.${TARGET_GW})`)
      .limit(10000)

    let survivorsAfterGrading: any[] = []
    let eliminatedThisGw: any[] = []

    if (roundEntries && roundEntries.length > 0) {
      for (const entry of roundEntries) {
        // Look up user pick for this gameweek
        const pick = teamPicks?.find(p => p.user_id === entry.user_id)
        
        if (!pick) {
          if (isGameweekFullyFinished || isPastDeadline) {
             eliminatedThisGw.push(entry)
          } else {
            survivorsAfterGrading.push(entry) // Waiting for deadline
          }
        } else {
          // Check match outcome
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
            if (teamWon) {
              survivorsAfterGrading.push(entry)
            } else {
              eliminatedThisGw.push(entry)
            }
          } else {
             if (isGameweekFullyFinished) {
                eliminatedThisGw.push(entry) // Match never played or invalid
             } else {
                survivorsAfterGrading.push(entry) // Match pending
             }
          }
        }
      }
      
      // We ONLY commit official survivor entry status transitions and round completions when the gameweek is fully finished
      if (isGameweekFullyFinished) {
        // Check Round Resolution (round ends when 3 or fewer survivors remain)
        if (survivorsAfterGrading.length <= 3) {
          // If 1-3 players survived, they win the round and get the winner bonus
          if (survivorsAfterGrading.length > 0) {
            for (const winner of survivorsAfterGrading) {
              const currentPts = userTeamPicksMap.get(winner.user_id) || 0
              userTeamPicksMap.set(winner.user_id, currentPts + 1) // +1 survivor win bonus
              survivorEntryUpdates.push(
                supabase.from('survivor_entries').update({ status: 'winner' }).eq('user_id', winner.user_id).eq('round_id', activeRound.id)
              )
              
              // Also update the pick's points_earned in team_predictions to reflect the bonus
              const winnerPick = teamPicks?.find(p => p.user_id === winner.user_id)
              if (winnerPick) {
                 const existingUpdate = teamPickPointsUpdatesMap.get(winnerPick.id) || { points_earned: 0, match_result: 'win' }
                 teamPickPointsUpdatesMap.set(winnerPick.id, { ...existingUpdate, points_earned: existingUpdate.points_earned + 1 })
              }
            }
          }
          // If 0 players survived (total wipeout in the same week):
          // "If everybody falls in the same week, that week scores nothing, but you keep every point already banked."
          // Nobody receives a winner bonus. Everyone who fell this week is marked eliminated.
          
          // Mark all eliminated players for this round
          for (const elim of eliminatedThisGw) {
            survivorEntryUpdates.push(
              supabase.from('survivor_entries').update({ status: 'eliminated', eliminated_gameweek_id: TARGET_GW }).eq('user_id', elim.user_id).eq('round_id', activeRound.id)
            )
          }

          // Complete the active round
          teamPickUpdates.push(
            supabase.from('survivor_rounds').update({ status: 'completed', end_gameweek_id: TARGET_GW }).eq('id', activeRound.id)
          )
          
          // Start the next round for TARGET_GW + 1 (all users re-entered with full club reset)
          const { data: existingNextRound } = await supabase
            .from('survivor_rounds')
            .select('id')
            .eq('start_gameweek_id', TARGET_GW + 1)
            .eq('status', 'active')
            .maybeSingle()

          if (!existingNextRound) {
            const { data: newRound } = await supabase
              .from('survivor_rounds')
              .insert({ start_gameweek_id: TARGET_GW + 1 })
              .select('id')
              .single()

            if (newRound && allUsers.length > 0) {
              const newEntries = allUsers.map(u => ({ round_id: newRound.id, user_id: u.id, status: 'alive' }))
              teamPickUpdates.push(supabase.from('survivor_entries').insert(newEntries))
            }
          }
        } else {
          // More than 3 survivors remain: round continues to next gameweek
          for (const elim of eliminatedThisGw) {
            survivorEntryUpdates.push(
              supabase.from('survivor_entries').update({ status: 'eliminated', eliminated_gameweek_id: TARGET_GW }).eq('user_id', elim.user_id).eq('round_id', activeRound.id)
            )
          }
          for (const surv of survivorsAfterGrading) {
            survivorEntryUpdates.push(
              supabase.from('survivor_entries').update({ status: 'alive' }).eq('user_id', surv.user_id).eq('round_id', activeRound.id)
            )
          }
        }
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
    teamPickUpdates.push(supabase.from('team_predictions').upsert(teamPredictionUpserts))
  }

  if (survivorEntryUpdates.length > 0) {
    const results = await Promise.all(survivorEntryUpdates)
    for (const res of results) {
      if (res.error) console.error("Survivor Entry Update Error:", res.error)
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
    .limit(10000)

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
    scorePickUpdates.push(supabase.from('score_predictions').upsert(scorePickUpdateData))
  }
  if (f4UpdateData.length > 0) {
    f4Updates.push(supabase.from('fantastic_four').upsert(f4UpdateData))
  }

  // Execute all updates simultaneously
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
      .limit(10000)
    
    if (bPicks) {
      for (const pick of bPicks) {
        userBonusMap.set(pick.user_id, pick.awarded_points || 0)
      }
    }
  }

  // 4. PENALTY AUDIT & LEADERBOARD AGGREGATION
  const leaderboardUpserts: any[] = []

  for (const user of allUsers) {
    let scorePts = 0, teamPts = 0, ffPts = 0, penaltyPts = 0

    const hasScorePicks = usersWithScorePicksGw.has(user.id)
    const bonusPts = userBonusMap.get(user.id) || 0

    if (!hasScorePicks && isPastDeadline) {
      scorePts = -1
      penaltyPts -= 1
    } else {
      scorePts = userScorePicksMap.get(user.id) || 0
    }

    const hasTeamPick = userTeamPicksMap.has(user.id)
    if (hasTeamPick) {
      teamPts = userTeamPicksMap.get(user.id) || 0
    } else {
      teamPts = 0
    }

    const f4Data = userF4PicksMap.get(user.id)
    if ((!f4Data || f4Data.count === 0) && isPastDeadline) {
      ffPts = -5
      penaltyPts -= 5
    } else {
      ffPts = f4Data ? f4Data.points : 0
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

  return { success: true, users_processed: allUsers.length || 0, gw: TARGET_GW }
}
