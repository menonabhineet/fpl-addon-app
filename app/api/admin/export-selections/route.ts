import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Verify admin access
    const adminEmails = process.env.ADMIN_EMAIL?.split(',').map(e => e.trim()) || []
    if (!user.email || !adminEmails.includes(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 1. Get current gameweek to know which gameweeks to export (only previous ones)
    const { data: allGameweeks } = await supabase.from('gameweeks').select('*').order('id', { ascending: true })
    if (!allGameweeks || allGameweeks.length === 0) {
      return NextResponse.json({ error: 'No gameweeks found' }, { status: 404 })
    }
    
    const currentGwObj = allGameweeks.find(gw => gw.is_current) || allGameweeks[0]
    const currentGwId = currentGwObj.id || 1

    // 2. Fetch required reference data to map IDs to readable names
    const { data: playersData } = await supabase.from('players').select('id, name')
    const { data: teamsData } = await supabase.from('teams').select('id, name, short_name')
    const { data: fixturesData } = await supabase.from('fixtures').select('id, home_team:home_team_id (name, short_name), away_team:away_team_id (name, short_name)')
    
    const playersMap = new Map(playersData?.map(p => [p.id, p.name]) || [])
    const teamsMap = new Map(teamsData?.map(t => [t.id, t.name]) || [])
    const fixturesMap = new Map(fixturesData?.map(f => {
      const home = Array.isArray(f.home_team) ? f.home_team[0] : f.home_team
      const away = Array.isArray(f.away_team) ? f.away_team[0] : f.away_team
      return [f.id, `${home?.short_name || 'Home'} vs ${away?.short_name || 'Away'}`]
    }) || [])

    // 3. Fetch user profiles and leaderboard info
    const { data: leaderboardData } = await supabase.from('vw_user_scores_with_profiles').select('*')
    
    const userNamesMap = new Map()

    // Fetch all users from Auth as a fallback for users without scores
    try {
      const adminClient = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { data: authData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (authData?.users) {
        authData.users.forEach(u => {
          const name = u.user_metadata?.name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'Unknown'
          userNamesMap.set(u.id, name)
        })
      }
    } catch (err) {
      console.error("Failed to fetch auth users for names fallback", err)
    }
    const leaderboardExportData: any[] = []
    
    // We only want the leaderboard up to the PREVIOUS gameweek
    const userLeaderboardMap = new Map()
    
    if (leaderboardData) {
      leaderboardData.forEach((record: any) => {
        const userId = record.user_id
        const managerName = record.manager_name || 'Unknown Manager'
        userNamesMap.set(userId, managerName)
        
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
          const userStat = userLeaderboardMap.get(userId)
          userStat.Total_Score_Points += record.score_points || 0
          userStat.Total_Team_Points += record.team_points || 0
          userStat.Total_Fantastic_Four_Points += record.fantastic_four_points || 0
          userStat.Total_Bonus_Points += record.bonus_points || 0
          userStat.Total_Penalty_Points += record.penalty_points || 0
          userStat.Grand_Total += record.total_points || 0
        }
      })
      
      // Sort leaderboard by Grand Total descending
      leaderboardExportData.push(...Array.from(userLeaderboardMap.values()).sort((a: any, b: any) => b.Grand_Total - a.Grand_Total))
    }

    // 4. Fetch the selections up to currentGwId - 1
    const { data: scorePicks } = await supabase.from('score_predictions').select('*, fixtures!inner(gameweek_id)').lt('fixtures.gameweek_id', currentGwId)
    const { data: teamPicks } = await supabase.from('team_predictions').select('*').lt('gameweek_id', currentGwId).order('gameweek_id', { ascending: true })
    const { data: fantasticPicks } = await supabase.from('fantastic_four').select('*').lt('gameweek_id', currentGwId).order('gameweek_id', { ascending: true })
    const { data: bonusPicks } = await supabase.from('bonus_predictions').select('*, bonus_questions!inner(gameweek, question, correct_answer)').lt('bonus_questions.gameweek', currentGwId)
    const { data: survivorEntries } = await supabase.from('survivor_entries').select('*').order('round_id', { ascending: true })

    // 5. Transform data for Excel Sheets
    const scoreExportData = (scorePicks || []).map(pick => ({
      Manager_Name: userNamesMap.get(pick.user_id) || 'Unknown',
      Gameweek: (pick.fixtures as any)?.gameweek_id || 'Unknown',
      Fixture: fixturesMap.get(pick.fixture_id) || `Fixture ${pick.fixture_id}`,
      Predicted_Home_Score: pick.predicted_home_score,
      Predicted_Away_Score: pick.predicted_away_score,
      Points_Earned: pick.points_earned || 0,
      Created_At: pick.created_at ? new Date(pick.created_at).toISOString() : ''
    }))

    const teamExportData = (teamPicks || []).map(pick => ({
      Manager_Name: userNamesMap.get(pick.user_id) || 'Unknown',
      Gameweek: pick.gameweek_id,
      Predicted_Team: teamsMap.get(pick.team_id) || `Team ${pick.team_id}`,
      Points_Earned: pick.points_earned || 0,
      Created_At: pick.created_at ? new Date(pick.created_at).toISOString() : ''
    }))

    const fantasticExportData = (fantasticPicks || []).map(pick => ({
      Manager_Name: userNamesMap.get(pick.user_id) || 'Unknown',
      Gameweek: pick.gameweek_id,
      Player: playersMap.get(pick.player_id) || `Player ${pick.player_id}`,
      Is_Captain: pick.is_captain ? 'Yes' : 'No',
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

    const survivorStatusExportData = (survivorEntries || []).map(entry => ({
      Manager_Name: userNamesMap.get(entry.user_id) || 'Unknown',
      Round: entry.round_id,
      Status: entry.status,
      Eliminated_Gameweek: entry.eliminated_gameweek_id || 'N/A'
    }))

    // 6. Build the Excel Workbook
    const workbook = XLSX.utils.book_new()

    // Create sheets (handle empty arrays by providing a default object structure so headers still appear)
    const scoreSheet = XLSX.utils.json_to_sheet(scoreExportData.length > 0 ? scoreExportData : [{ Manager_Name: '', Gameweek: '', Fixture: '', Predicted_Home_Score: '', Predicted_Away_Score: '', Points_Earned: '', Created_At: '' }])
    const survivorSheet = XLSX.utils.json_to_sheet(teamExportData.length > 0 ? teamExportData : [{ Manager_Name: '', Gameweek: '', Predicted_Team: '', Points_Earned: '', Created_At: '' }])
    const fantasticSheet = XLSX.utils.json_to_sheet(fantasticExportData.length > 0 ? fantasticExportData : [{ Manager_Name: '', Gameweek: '', Player: '', Is_Captain: '', Points_Earned: '', Created_At: '' }])
    const bonusSheet = XLSX.utils.json_to_sheet(bonusExportData.length > 0 ? bonusExportData : [{ Manager_Name: '', Gameweek: '', Question: '', Manager_Answer: '', Correct_Answer: '', Points_Earned: '', Created_At: '' }])
    const leaderboardSheet = XLSX.utils.json_to_sheet(leaderboardExportData.length > 0 ? leaderboardExportData : [{ Manager_Name: '', Total_Score_Points: '', Total_Team_Points: '', Total_Fantastic_Four_Points: '', Total_Bonus_Points: '', Total_Penalty_Points: '', Grand_Total: '' }])
    const survivorStatusSheet = XLSX.utils.json_to_sheet(survivorStatusExportData.length > 0 ? survivorStatusExportData : [{ Manager_Name: '', Round: '', Status: '', Eliminated_Gameweek: '' }])

    XLSX.utils.book_append_sheet(workbook, scoreSheet, "Score Predictions")
    XLSX.utils.book_append_sheet(workbook, survivorSheet, "Survivor Mode")
    XLSX.utils.book_append_sheet(workbook, fantasticSheet, "Fantastic 4")
    XLSX.utils.book_append_sheet(workbook, bonusSheet, "Bonus Question")
    XLSX.utils.book_append_sheet(workbook, leaderboardSheet, "Leaderboard")
    XLSX.utils.book_append_sheet(workbook, survivorStatusSheet, "Survivor Status")

    // 7. Write the file to a buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    // 8. Return response
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
