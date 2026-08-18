import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function fetchAllSupabaseData(supabase: any, table: string, selectQuery: string, currentGwId: number, ltColumn: string, orderByColumn?: string) {
  let allData: any[] = []
  let fetchStart = 0
  const fetchLimit = 1000
  while (true) {
    let query = supabase.from(table).select(selectQuery).lt(ltColumn, currentGwId)
    if (orderByColumn) {
      query = query.order(orderByColumn, { ascending: true })
    }
    const { data: batch, error } = await query.range(fetchStart, fetchStart + fetchLimit - 1)
    
    if (error) {
      console.error(`Error fetching ${table}:`, error)
      break
    }
    if (!batch || batch.length === 0) break
    allData = allData.concat(batch)
    if (batch.length < fetchLimit) break
    fetchStart += fetchLimit
  }
  return allData
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Verify admin access (case-insensitive)
    const adminEmails = process.env.ADMIN_EMAIL?.split(',').map(e => e.trim().toLowerCase()) || []
    if (!user.email || !adminEmails.includes(user.email.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 1. Get current gameweek to know which gameweeks to export (only completed/previous ones)
    const { data: allGameweeks } = await supabase.from('gameweeks').select('*').order('id', { ascending: true }).range(0, 9999)
    if (!allGameweeks || allGameweeks.length === 0) {
      return NextResponse.json({ error: 'No gameweeks found' }, { status: 404 })
    }
    
    const currentGwObj = allGameweeks.find(gw => gw.is_current) || allGameweeks[0]
    const currentGwId = currentGwObj.id || 1

    // 2. Fetch required reference data to map IDs to readable names
    const { data: playersData } = await supabase.from('players').select('id, name').range(0, 9999)
    const { data: teamsData } = await supabase.from('teams').select('id, name, short_name').range(0, 9999)
    const { data: fixturesData } = await supabase.from('fixtures').select('id, home_team:home_team_id (name, short_name), away_team:away_team_id (name, short_name)').range(0, 9999)
    
    const playersMap = new Map(playersData?.map(p => [p.id, p.name]) || [])
    const teamsMap = new Map(teamsData?.map(t => [t.id, t.name]) || [])
    const fixturesMap = new Map(fixturesData?.map(f => {
      const home = Array.isArray(f.home_team) ? f.home_team[0] : f.home_team
      const away = Array.isArray(f.away_team) ? f.away_team[0] : f.away_team
      return [f.id, `${home?.short_name || 'Home'} vs ${away?.short_name || 'Away'}`]
    }) || [])

    // 3. Fetch user profiles directly for sub-50ms execution
    const { data: profilesData } = await supabase.from('profiles').select('id, full_name, nickname, email, current_streak, best_streak').range(0, 9999)
    const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || [])
    
    const userNamesMap = new Map<string, string>()
    profilesData?.forEach(p => {
      const name = p.nickname || p.full_name || (p.email ? p.email.split('@')[0] : 'Unknown Manager')
      userNamesMap.set(p.id, name)
    })

    // 4. Fetch user scores for leaderboard aggregation up to previous gameweek
    const { data: leaderboardData } = await supabase.from('vw_user_scores_with_profiles').select('*').range(0, 9999)
    const userLeaderboardMap = new Map<string, {
      Manager_Name: string
      Total_Score_Points: number
      Total_Team_Points: number
      Total_Fantastic_Four_Points: number
      Total_Bonus_Points: number
      Total_Penalty_Points: number
      Grand_Total: number
    }>()
    
    if (leaderboardData) {
      leaderboardData.forEach((record: any) => {
        const userId = record.user_id
        const managerName = userNamesMap.get(userId) || record.manager_name || 'Unknown Manager'
        
        // Only sum points for gameweeks strictly prior to the current gameweek
        if (record.gameweek_id < currentGwId) {
          if (!userLeaderboardMap.has(userId)) {
            userLeaderboardMap.set(userId, {
              Manager_Name: managerName,
              Total_Score_Points: 0,
              Total_Team_Points: 0,
              Total_Fantastic_Four_Points: 0,
              Total_Bonus_Points: 0,
              Total_Penalty_Points: 0,
              Grand_Total: 0
            })
          }
          const userStat = userLeaderboardMap.get(userId)!
          userStat.Total_Score_Points += record.score_points || 0
          userStat.Total_Team_Points += record.team_points || 0
          userStat.Total_Fantastic_Four_Points += record.fantastic_four_points || 0
          userStat.Total_Bonus_Points += record.bonus_points || 0
          userStat.Total_Penalty_Points += record.penalty_points || 0
          userStat.Grand_Total += record.total_points || 0
        }
      })
    }

    // Build enriched Leaderboard sheet data including current & best streaks
    const leaderboardExportData = Array.from(userLeaderboardMap.entries()).map(([userId, stat]) => {
      const prof = profilesMap.get(userId)
      return {
        Manager_Name: stat.Manager_Name,
        Current_Streak: prof?.current_streak || 0,
        Best_Streak: prof?.best_streak || 0,
        Total_Score_Points: stat.Total_Score_Points,
        Total_Survivor_Points: stat.Total_Team_Points,
        Total_Fantastic_Four_Points: stat.Total_Fantastic_Four_Points,
        Total_Bonus_Points: stat.Total_Bonus_Points,
        Total_Penalty_Points: stat.Total_Penalty_Points,
        Grand_Total: stat.Grand_Total
      }
    }).sort((a, b) => b.Grand_Total - a.Grand_Total)

    // 5. Fetch the selections up to currentGwId - 1
    const scorePicks = await fetchAllSupabaseData(supabase, 'score_predictions', '*, fixtures!inner(gameweek_id)', currentGwId, 'fixtures.gameweek_id')
    const teamPicks = await fetchAllSupabaseData(supabase, 'team_predictions', '*', currentGwId, 'gameweek_id', 'gameweek_id')
    const fantasticPicks = await fetchAllSupabaseData(supabase, 'fantastic_four', '*', currentGwId, 'gameweek_id', 'gameweek_id')
    const bonusPicks = await fetchAllSupabaseData(supabase, 'bonus_predictions', '*, bonus_questions!inner(gameweek, question, correct_answer)', currentGwId, 'bonus_questions.gameweek')

    // 6. Transform data for Excel Sheets
    const scoreExportData = (scorePicks || []).map(pick => ({
      Manager_Name: userNamesMap.get(pick.user_id) || 'Unknown',
      Gameweek: (pick.fixtures as any)?.gameweek_id || 'Unknown',
      Fixture: fixturesMap.get(pick.fixture_id) || `Fixture ${pick.fixture_id}`,
      Predicted_Home_Score: pick.predicted_home_score,
      Predicted_Away_Score: pick.predicted_away_score,
      Points_Earned: pick.points_earned || 0,
      Created_At: pick.created_at ? new Date(pick.created_at).toISOString() : ''
    }))

    const teamExportData = (teamPicks || []).map(pick => {
      let result = 'Pending'
      if (pick.match_result === 'win') result = 'Win'
      else if (pick.match_result === 'draw') result = 'Draw'
      else if (pick.match_result === 'loss') result = 'Loss'

      return {
        Manager_Name: userNamesMap.get(pick.user_id) || 'Unknown',
        Gameweek: pick.gameweek_id,
        Predicted_Team: teamsMap.get(pick.team_id) || `Team ${pick.team_id}`,
        Match_Result: result,
        Points_Earned: pick.points_earned || 0,
        Created_At: pick.created_at ? new Date(pick.created_at).toISOString() : ''
      }
    })

    const fantasticExportData = (fantasticPicks || []).map(pick => ({
      Manager_Name: userNamesMap.get(pick.user_id) || 'Unknown',
      Gameweek: pick.gameweek_id,
      Position: pick.position || 'FWD',
      Player: playersMap.get(pick.player_id) || pick.player_name || `Player ${pick.player_id}`,
      Points_Earned: pick.points_earned || 0,
      Created_At: pick.created_at ? new Date(pick.created_at).toISOString() : ''
    }))

    const bonusExportData = (bonusPicks || []).map(pick => ({
      Manager_Name: userNamesMap.get(pick.user_id) || 'Unknown',
      Gameweek: (pick.bonus_questions as any)?.gameweek || 'Unknown',
      Question: (pick.bonus_questions as any)?.question || 'Unknown',
      Manager_Answer: pick.answer,
      Correct_Answer: (pick.bonus_questions as any)?.correct_answer || 'Pending',
      Points_Earned: pick.awarded_points || 0,
      Created_At: pick.created_at ? new Date(pick.created_at).toISOString() : ''
    }))

    // Survivor Streak Summary Sheet (Replaces legacy tournament knockout status)
    const survivorStreakSummaryData = Array.from(profilesMap.values()).map(prof => {
      const name = prof.nickname || prof.full_name || (prof.email ? prof.email.split('@')[0] : 'Unknown Manager')
      const userStat = userLeaderboardMap.get(prof.id)
      const curStreak = prof.current_streak || 0
      const bestStreak = prof.best_streak || 0
      return {
        Manager_Name: name,
        Current_Streak: curStreak,
        Best_Streak: bestStreak,
        Total_Survivor_Points: userStat?.Total_Team_Points || 0,
        Status: curStreak > 0 ? `Active 🔥 (${curStreak} consecutive wins)` : 'Streak Reset / Inactive'
      }
    }).sort((a, b) => b.Current_Streak - a.Current_Streak || b.Best_Streak - a.Best_Streak)

    // 7. Build the Excel Workbook
    const workbook = XLSX.utils.book_new()

    // Create sheets (handle empty arrays with default headers)
    const scoreSheet = XLSX.utils.json_to_sheet(scoreExportData.length > 0 ? scoreExportData : [{ Manager_Name: '', Gameweek: '', Fixture: '', Predicted_Home_Score: '', Predicted_Away_Score: '', Points_Earned: '', Created_At: '' }])
    const survivorSheet = XLSX.utils.json_to_sheet(teamExportData.length > 0 ? teamExportData : [{ Manager_Name: '', Gameweek: '', Predicted_Team: '', Match_Result: '', Points_Earned: '', Created_At: '' }])
    const fantasticSheet = XLSX.utils.json_to_sheet(fantasticExportData.length > 0 ? fantasticExportData : [{ Manager_Name: '', Gameweek: '', Position: '', Player: '', Points_Earned: '', Created_At: '' }])
    const bonusSheet = XLSX.utils.json_to_sheet(bonusExportData.length > 0 ? bonusExportData : [{ Manager_Name: '', Gameweek: '', Question: '', Manager_Answer: '', Correct_Answer: '', Points_Earned: '', Created_At: '' }])
    const leaderboardSheet = XLSX.utils.json_to_sheet(leaderboardExportData.length > 0 ? leaderboardExportData : [{ Manager_Name: '', Current_Streak: '', Best_Streak: '', Total_Score_Points: '', Total_Survivor_Points: '', Total_Fantastic_Four_Points: '', Total_Bonus_Points: '', Total_Penalty_Points: '', Grand_Total: '' }])
    const survivorStreaksSheet = XLSX.utils.json_to_sheet(survivorStreakSummaryData.length > 0 ? survivorStreakSummaryData : [{ Manager_Name: '', Current_Streak: '', Best_Streak: '', Total_Survivor_Points: '', Status: '' }])

    XLSX.utils.book_append_sheet(workbook, scoreSheet, "Score Predictions")
    XLSX.utils.book_append_sheet(workbook, survivorSheet, "Survivor Mode")
    XLSX.utils.book_append_sheet(workbook, fantasticSheet, "Fantastic 4")
    XLSX.utils.book_append_sheet(workbook, bonusSheet, "Bonus Question")
    XLSX.utils.book_append_sheet(workbook, leaderboardSheet, "Leaderboard")
    XLSX.utils.book_append_sheet(workbook, survivorStreaksSheet, "Survivor Streaks")

    // 8. Write the file to a buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    // 9. Return response
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="PPL_Selections_Backup_until_GW${currentGwId - 1}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Error exporting selections:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
