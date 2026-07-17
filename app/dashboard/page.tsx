// app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardTabs from '@/components/dashboard/dashboard-tabs'
import ThemeToggle from '@/components/theme-toggle'
import GameweekSelector from '@/components/dashboard/gameweek-selector'
import { fetchBootstrapStatic } from '@/lib/fpl-api'

// 1. KILL THE CACHE: This forces Next.js to always fetch live data
export const dynamic = 'force-dynamic' 

export default async function DashboardPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ gw?: string }> 
}) {
  // 2. Await the Promise to extract the actual URL parameters!
  const resolvedParams = await searchParams
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/')

  // 2. Determine which Gameweek to view
  const { data: allGameweeks } = await supabase.from('gameweeks').select('*').order('id', { ascending: true })
  const currentGwObj = allGameweeks?.find(gw => gw.is_current) || allGameweeks?.[0]
  
  // If URL has ?gw=2, use 2. Otherwise default to current.
  const selectedGwId = resolvedParams.gw ? parseInt(resolvedParams.gw) : currentGwObj?.id || 1
  const selectedGw = allGameweeks?.find(gw => gw.id === selectedGwId)

  // 3. Fetch data specifically for the SELECTED Gameweek
  const { data: fixtures } = await supabase.from('fixtures').select('id, home_score, away_score, kickoff_time, is_finished, home_team:home_team_id (id, name, short_name, code), away_team:away_team_id (id, name, short_name, code)').eq('gameweek_id', selectedGwId).order('kickoff_time', { ascending: true })
  const { data: teams } = await supabase.from('teams').select('*').order('name', { ascending: true })
  const { data: players } = await supabase.from('players').select('id, name, position, teams:team_id(code, short_name, name)').order('name', { ascending: true })

  // 4. Fetch user's historical picks for this Gameweek
  const { data: userPicks } = await supabase.from('fantastic_four').select('*').eq('user_id', user.id).eq('gameweek_id', selectedGwId)
  const { data: userTeamPick } = await supabase.from('team_predictions').select('*').eq('user_id', user.id).eq('gameweek_id', selectedGwId).maybeSingle()
  
  let userScorePicks: any[] = []
  if (fixtures && fixtures.length > 0) {
    const fixtureIds = fixtures.map((f: any) => f.id)
    const { data } = await supabase.from('score_predictions').select('*').eq('user_id', user.id).in('fixture_id', fixtureIds)
    userScorePicks = data || []
  }

  // 5. Fetch raw scoring data to power the dynamic Leaderboard UI
  const { data: allScores, error: scoresError } = await supabase
    .from('vw_user_scores_with_profiles')
    .select('*')

  if (scoresError) {
    console.error("Failed to fetch leaderboard data:", scoresError)
  }

  // 6. Fetch FPL live stats for form, points, ownership
  let fplElements: any = {};
  try {
    const fplData = await fetchBootstrapStatic();
    fplElements = fplData.elements.reduce((acc: any, el: any) => {
      acc[el.id] = {
        form: parseFloat(el.form) || 0,
        points_per_game: parseFloat(el.points_per_game) || 0,
        total_points: el.total_points || 0,
        selected_by_percent: parseFloat(el.selected_by_percent) || 0,
        status: el.status || 'a',
        news: el.news || ''
      };
      return acc;
    }, {});
  } catch (err) {
    console.error("Failed to fetch FPL stats:", err);
  }

  const enhancedPlayers = (players || []).map(p => {
    const fplData = fplElements[p.id] || { form: 0, total_points: 0, selected_by_percent: 0, status: 'a', news: '' };
    
    // Find upcoming fixture for this gameweek
    let nextFixtureStr = 'No fixture';
    if (fixtures && p.teams) {
      const teamData = p.teams as any;
      const teamCode = Array.isArray(teamData) ? teamData[0]?.code : teamData?.code;
      if (teamCode) {
        const playerFixture = fixtures.find((f: any) => {
          const home = Array.isArray(f.home_team) ? f.home_team[0] : f.home_team;
          const away = Array.isArray(f.away_team) ? f.away_team[0] : f.away_team;
          return home?.code === teamCode || away?.code === teamCode;
        });
        if (playerFixture) {
          const f = playerFixture as any;
          const home = Array.isArray(f.home_team) ? f.home_team[0] : f.home_team;
          const away = Array.isArray(f.away_team) ? f.away_team[0] : f.away_team;
          const isHome = home?.code === teamCode;
          const opponent = isHome ? away?.short_name : home?.short_name;
          nextFixtureStr = `${opponent} (${isHome ? 'H' : 'A'})`;
        }
      }
    }
    
    return {
      ...p,
      ...fplData,
      next_fixture: nextFixtureStr
    };
  });

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 transition-colors duration-300">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 shadow-sm transition-colors duration-300">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-indigo-950 dark:text-indigo-400">Pro Pundits League</h1>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {selectedGw ? `Viewing History` : 'Season inactive'}
              </p>
            </div>
            {/* The new Dropdown! */}
            {allGameweeks && <GameweekSelector allGameweeks={allGameweeks} selectedGwId={selectedGwId} />}
          </div>
          
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <span className="hidden sm:inline-block text-sm font-medium text-slate-600 dark:text-slate-300">{user.email}</span>
            <form action={async () => {
              'use server'; const supabase = await createClient(); await supabase.auth.signOut(); redirect('/');
            }}>
              <button className="rounded-full bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Log out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 sm:p-6 mt-4">
        <DashboardTabs 
          currentGw={selectedGw} 
          fixtures={fixtures || []} 
          teams={teams || []} 
          players={enhancedPlayers} 
          initialPicks={userPicks || []} 
          initialTeamPick={userTeamPick}
          initialScorePicks={userScorePicks || []}
          leaderboard={allScores || []} // We now pass RAW scores, not the aggregated view
        />
      </main>
    </div>
  )
}