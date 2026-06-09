// app/api/cron/calculate-scores/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin' // Upgraded to Admin Client

export async function GET() {
  try {
    // The Admin Client bypasses Row Level Security so the server can grade everyone at once
    const supabase = createAdminClient()
    const TARGET_GW = 1

    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('*')
      .eq('gameweek_id', TARGET_GW)
      .eq('is_finished', true)

    if (!fixtures || fixtures.length === 0) {
      return NextResponse.json({ success: true, message: 'No finished fixtures to grade yet.' })
    }

    const fixtureIds = fixtures.map(f => f.id)

    // ==========================================
    // 1. GRADE INDIVIDUAL ROWS (Scores, Teams, FF)
    // ==========================================
    
    // A. Grade Score Predictions
    const { data: scorePicks } = await supabase.from('score_predictions').select('*').in('fixture_id', fixtureIds)
    if (scorePicks) {
      for (const pick of scorePicks) {
        const match = fixtures.find(f => f.id === pick.fixture_id)
        if (!match) continue

        let points = 0
        const actualOutcome = match.home_score > match.away_score ? 'H' : match.home_score < match.away_score ? 'A' : 'D'
        const predOutcome = pick.predicted_home_score > pick.predicted_away_score ? 'H' : pick.predicted_home_score < pick.predicted_away_score ? 'A' : 'D'

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
        await supabase.from('score_predictions').update({ points_earned: points }).eq('id', pick.id)
      }
    }

    // B. Grade Team Picks
    const { data: teamPicks } = await supabase.from('team_predictions').select('*').eq('gameweek_id', TARGET_GW)
    if (teamPicks) {
      for (const pick of teamPicks) {
        const match = fixtures.find(f => f.home_team_id === pick.team_id || f.away_team_id === pick.team_id)
        let points = 0
        if (match) {
          const isHomeTeam = match.home_team_id === pick.team_id
          const teamWon = isHomeTeam ? match.home_score > match.away_score : match.away_score > match.home_score
          if (teamWon) points = 3
        }
        await supabase.from('team_predictions').update({ points_earned: points }).eq('id', pick.id)
      }
    }

    // C. Grade Fantastic Four
    const fplLiveRes = await fetch(`https://fantasy.premierleague.com/api/event/${TARGET_GW}/live/`)
    const fplLiveData = await fplLiveRes.json()
    const { data: f4Picks } = await supabase.from('fantastic_four').select('*').eq('gameweek_id', TARGET_GW)
    
    if (f4Picks) {
      for (const pick of f4Picks) {
        const playerStats = fplLiveData.elements.find((el: any) => el.id === pick.player_id)
        const points = playerStats ? playerStats.stats.total_points : 0
        await supabase.from('fantastic_four').update({ points_earned: points }).eq('id', pick.id)
      }
    }

    // ==========================================
    // 2. THE PENALTY AUDIT & LEADERBOARD AGGREGATION
    // ==========================================
    
    // Fetch every user registered in your Supabase authentication system
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers()
    if (authError) throw authError

    for (const user of users) {
      let scorePts = 0, teamPts = 0, ffPts = 0, penaltyPts = 0

      // Audit Score Picks
      const { data: userScorePicks } = await supabase.from('score_predictions').select('points_earned').eq('user_id', user.id).in('fixture_id', fixtureIds)
      if (!userScorePicks || userScorePicks.length === 0) {
        penaltyPts -= 1 // Complete ghosting penalty
      } else {
        scorePts = userScorePicks.reduce((sum, pick) => sum + (pick.points_earned || 0), 0)
      }

      // Audit Team Picks
      const { data: userTeamPick } = await supabase.from('team_predictions').select('points_earned').eq('user_id', user.id).eq('gameweek_id', TARGET_GW).maybeSingle()
      if (!userTeamPick) {
        penaltyPts -= 1 // Forgot to pick a team
      } else {
        teamPts = userTeamPick.points_earned || 0
      }

      // Audit Fantastic Four
      const { data: userFFPicks } = await supabase.from('fantastic_four').select('points_earned').eq('user_id', user.id).eq('gameweek_id', TARGET_GW)
      if (!userFFPicks || userFFPicks.length === 0) {
        penaltyPts -= 5 // Forgot the Fantastic Four entirely (1 pick saves them)
      } else {
        ffPts = userFFPicks.reduce((sum, pick) => sum + (pick.points_earned || 0), 0)
      }

      // Final Math
      const totalPts = scorePts + teamPts + ffPts + penaltyPts

      // Upsert into our new Leaderboard Report Card
      await supabase.from('user_gameweek_scores').upsert({
        user_id: user.id,
        gameweek_id: TARGET_GW,
        score_points: scorePts,
        team_points: teamPts,
        fantastic_four_points: ffPts,
        penalty_points: penaltyPts,
        total_points: totalPts
      }, { 
        onConflict: 'user_id, gameweek_id' // If we run this script twice, it just updates the existing row
      })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Successfully graded predictions, applied penalties, and updated the leaderboard cache!' 
    })

  } catch (error: any) {
    console.error('Grading Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}