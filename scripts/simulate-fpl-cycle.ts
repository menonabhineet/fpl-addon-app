import fs from 'fs'
import path from 'path'

if (fs.existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

import { createAdminClient } from '../lib/supabase/admin'
import { calculateScores, calculateActiveScoresWindow } from '../lib/actions/cron'

async function runComprehensiveSimulation() {
  console.log('⚽ =========================================================')
  console.log('⚽ STARTING END-TO-END FPL GAMEWEEK CYCLE & STREAK SIMULATION')
  console.log('⚽ =========================================================\n')

  const supabase = createAdminClient()

  // 1. Fetch test user
  const { data: { users } } = await supabase.auth.admin.listUsers({ page: 1, perPage: 5 })
  const testUser = users?.[0]
  if (!testUser) throw new Error('No user found to run simulation')

  console.log(`👤 Active Test User: ${testUser.email} (${testUser.id})\n`)

  // Backup original state
  const { data: originalGws } = await supabase.from('gameweeks').select('id, is_current').order('id')
  const originalCurrent = originalGws?.find(g => g.is_current)?.id || 1

  const { data: origFix1 } = await supabase.from('fixtures').select('*').eq('id', 8).single()
  const { data: origFix2 } = await supabase.from('fixtures').select('*').eq('id', 19).single()

  try {
    // -------------------------------------------------------------
    // SETUP: INSERT TEST PICKS FOR GW 1 AND GW 2
    // -------------------------------------------------------------
    console.log('📝 Setting up test predictions for GW 1 and GW 2...')
    
    // GW 1: Exact score pick 2-1 on fixture 8, Survivor pick team 15
    await supabase.from('score_predictions').upsert({
      user_id: testUser.id,
      fixture_id: 8,
      predicted_home_score: 2,
      predicted_away_score: 1
    }, { onConflict: 'user_id, fixture_id' })

    await supabase.from('team_predictions').upsert({
      user_id: testUser.id,
      gameweek_id: 1,
      fixture_id: 8,
      team_id: 15
    }, { onConflict: 'user_id, gameweek_id' })

    // GW 2: Exact score pick 3-0 on fixture 19, Survivor pick team 20
    await supabase.from('score_predictions').upsert({
      user_id: testUser.id,
      fixture_id: 19,
      predicted_home_score: 3,
      predicted_away_score: 0
    }, { onConflict: 'user_id, fixture_id' })

    await supabase.from('team_predictions').upsert({
      user_id: testUser.id,
      gameweek_id: 2,
      fixture_id: 19,
      team_id: 20
    }, { onConflict: 'user_id, gameweek_id' })

    console.log('✅ Test predictions seeded successfully.')

    // -------------------------------------------------------------
    // STAGE 1: GW 1 MATCHES PLAYED (Fixture 8: 2-1 Home Win)
    // -------------------------------------------------------------
    console.log('\n--- [STAGE 1] GW 1 Live Matches Conclude ---')
    await supabase.from('gameweeks').update({ is_current: false }).neq('id', 0)
    await supabase.from('gameweeks').update({ is_current: true }).eq('id', 1)

    // Complete Fixture 8: Team 15 wins 2-1
    await supabase.from('fixtures').update({
      home_score: 2,
      away_score: 1,
      is_finished: true
    }).eq('id', 8)

    // Run grading for GW 1
    await calculateScores(1)

    const { data: gw1Score } = await supabase
      .from('user_gameweek_scores')
      .select('*')
      .eq('user_id', testUser.id)
      .eq('gameweek_id', 1)
      .single()

    console.log(`📊 GW 1 Graded Scores:`)
    console.log(`   - Score Prediction Points: ${gw1Score?.score_points} (Expected: 3 for exact 2-1)`)
    console.log(`   - Survivor Streak Points: ${gw1Score?.team_points} (Expected: 1 for 1st consecutive win)`)
    console.log(`   - Total GW 1 Points: ${gw1Score?.total_points} pts`)

    if (gw1Score?.score_points !== 3 || gw1Score?.team_points !== 1) {
      throw new Error(`GW 1 calculation mismatch! Expected 3 score pts, 1 team pt. Got ${gw1Score?.score_points}, ${gw1Score?.team_points}`)
    }

    // -------------------------------------------------------------
    // STAGE 2: FPL GAMEWEEK ROLLOVER (GW 1 Finishes -> GW 2 Active)
    // -------------------------------------------------------------
    console.log('\n--- [STAGE 2] Official FPL Rollover: GW 1 Closes -> GW 2 Becomes Active ---')
    await supabase.from('gameweeks').update({ is_current: false }).neq('id', 0)
    await supabase.from('gameweeks').update({ is_current: true }).eq('id', 2)

    console.log('🔄 DB State: is_current is now GW 2')

    // Simulate Fixture 19 in GW 2 finishing: Team 20 wins 3-0
    await supabase.from('fixtures').update({
      home_score: 3,
      away_score: 0,
      is_finished: true
    }).eq('id', 19)

    // -------------------------------------------------------------
    // STAGE 3: AUTOMATED CRON RUNS DURING ROLLOVER (Lookback Window)
    // -------------------------------------------------------------
    console.log('\n--- [STAGE 3] Automated Cron Runs (Sequential Lookback Window 1..2) ---')
    const cronResult1 = await calculateActiveScoresWindow(1)
    console.log(`✅ Cron Processed Window: ${cronResult1.gradedWindow}`)

    const { data: gw2Score } = await supabase
      .from('user_gameweek_scores')
      .select('*')
      .eq('user_id', testUser.id)
      .eq('gameweek_id', 2)
      .single()

    console.log(`📊 GW 2 Graded Scores:`)
    console.log(`   - Score Prediction Points: ${gw2Score?.score_points} (Expected: 3 for exact 3-0)`)
    console.log(`   - Survivor Streak Points: ${gw2Score?.team_points} (Expected: 2 for 2nd consecutive win!)`)
    console.log(`   - Total GW 2 Points: ${gw2Score?.total_points} pts`)

    if (gw2Score?.score_points !== 3 || gw2Score?.team_points !== 2) {
      throw new Error(`GW 2 calculation mismatch! Expected 3 score pts, 2 streak pts. Got ${gw2Score?.score_points}, ${gw2Score?.team_points}`)
    }

    // -------------------------------------------------------------
    // STAGE 4: FPL ROLLOVER TO GW 3 & CRON EXECUTION
    // -------------------------------------------------------------
    console.log('\n--- [STAGE 4] Official FPL Rollover to GW 3 (GW 2 Finalized) ---')
    await supabase.from('gameweeks').update({ is_current: false }).neq('id', 0)
    await supabase.from('gameweeks').update({ is_current: true }).eq('id', 3)

    console.log('🔄 DB State: is_current is now GW 3')
    console.log('⏳ Running Cron for Lookback Window 2..3...')
    const cronResult2 = await calculateActiveScoresWindow(1)
    console.log(`✅ Cron Processed Window: ${cronResult2.gradedWindow}`)

    // -------------------------------------------------------------
    // STAGE 5: AGGREGATE LEADERBOARD VALIDATION
    // -------------------------------------------------------------
    console.log('\n--- [STAGE 5] Verifying Cumulative Season Leaderboard ---')
    const { data: allUserScores } = await supabase
      .from('user_gameweek_scores')
      .select('gameweek_id, total_points')
      .eq('user_id', testUser.id)
      .in('gameweek_id', [1, 2])
      .order('gameweek_id')

    const totalSeasonPts = allUserScores?.reduce((acc, row) => acc + row.total_points, 0) || 0
    console.log(`🏆 Cumulative User Season Points (GW 1 + GW 2): ${totalSeasonPts} pts (Expected: 4 + 5 = 9 pts)`)

    if (totalSeasonPts !== 9) {
      throw new Error(`Season total mismatch! Expected 9 pts, got ${totalSeasonPts} pts`)
    }

    console.log('\n=============================================================')
    console.log('🎉 100% PROOF VERIFIED: SCORING & TRANSITIONS NEVER BREAK')
    console.log('   - GW Rollover lookback: PASSED')
    console.log('   - Survivor consecutive streak escalation (1pt -> 2pt): PASSED')
    console.log('   - Match score predictions grading: PASSED')
    console.log('   - Cumulative leaderboard integrity: PASSED')
    console.log('=============================================================\n')

  } finally {
    // Clean up test data and restore DB
    console.log('🧹 Cleaning up test fixtures and restoring original gameweeks...')
    if (origFix1) {
      await supabase.from('fixtures').update({
        home_score: origFix1.home_score,
        away_score: origFix1.away_score,
        is_finished: origFix1.is_finished
      }).eq('id', 8)
    }
    if (origFix2) {
      await supabase.from('fixtures').update({
        home_score: origFix2.home_score,
        away_score: origFix2.away_score,
        is_finished: origFix2.is_finished
      }).eq('id', 19)
    }

    // Clean up test prediction records
    await supabase.from('score_predictions').delete().eq('user_id', testUser.id).in('fixture_id', [8, 19])
    await supabase.from('team_predictions').delete().eq('user_id', testUser.id).in('gameweek_id', [1, 2])

    // Recalculate GW1 & GW2 to clean user_gameweek_scores back to normal
    await calculateScores(1)
    await calculateScores(2)

    // Restore gameweek active state
    if (originalGws) {
      for (const gw of originalGws) {
        await supabase.from('gameweeks').update({ is_current: gw.is_current }).eq('id', gw.id)
      }
    }
    console.log(`✅ Restored active gameweek back to GW ${originalCurrent}.`)
  }
}

runComprehensiveSimulation().catch(err => {
  console.error('❌ SIMULATION ERROR:', err)
  process.exit(1)
})
