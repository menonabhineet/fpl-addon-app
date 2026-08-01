// app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardTabs from '@/components/dashboard/dashboard-tabs'
import ThemeToggle from '@/components/theme-toggle'
import GameweekSelector from '@/components/dashboard/gameweek-selector'
import { fetchBootstrapStatic } from '@/lib/fpl-api'
import DeadlineBanner from '@/components/dashboard/deadline-banner'
import AnimatedNumber from '@/components/dashboard/animated-number'

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
  
  const currentGwId = currentGwObj?.id || 1
  
  // Filter gameweeks to only those that are current/historic OR explicitly made available to players by the admin
  const allowedGameweeks = allGameweeks?.filter(gw => gw.id <= currentGwId || gw.is_available_to_players) || []

  // If URL has ?gw=2, use 2. Otherwise default to current.
  const requestedGwId = resolvedParams.gw ? parseInt(resolvedParams.gw) : currentGwId
  
  // Ensure the requested gameweek is in the allowed list, otherwise fallback to current
  let selectedGw = allowedGameweeks.find(gw => gw.id === requestedGwId)
  if (!selectedGw) {
    selectedGw = allowedGameweeks.find(gw => gw.id === currentGwId) || allowedGameweeks[0]
  }
  const selectedGwId = selectedGw?.id || 1

  // 3. Fetch data specifically for the SELECTED Gameweek
  const { data: fixtures } = await supabase.from('fixtures').select('id, home_score, away_score, kickoff_time, is_finished, is_selected, home_team:home_team_id (id, name, short_name, code), away_team:away_team_id (id, name, short_name, code)').eq('gameweek_id', selectedGwId).order('kickoff_time', { ascending: true })
  const { data: teams } = await supabase.from('teams').select('*').order('name', { ascending: true })
  const { data: players } = await supabase.from('players').select('id, name, position, teams:team_id(code, short_name, name)').order('name', { ascending: true })

  // 4. Fetch user's historical picks for this season to enforce constraints
  const { data: allUserFantasticPicks } = await supabase.from('fantastic_four').select('*').eq('user_id', user.id)
  const userPicks = allUserFantasticPicks?.filter((p: any) => p.gameweek_id === selectedGwId) || []

  const { data: allUserTeamPicks } = await supabase.from('team_predictions').select('*').eq('user_id', user.id)
  const userTeamPick = allUserTeamPicks?.find((p: any) => p.gameweek_id === selectedGwId) || null
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
  let fplTeams: any = {};
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
    fplTeams = (fplData.teams || []).reduce((acc: any, team: any) => {
      acc[team.code] = {
        position: team.position,
        form: team.form,
        strength: team.strength,
      };
      return acc;
    }, {});
  } catch (err) {
    console.error("Failed to fetch FPL stats:", err);
  }

  // --- NEW: Calculate User Points and Rank for Hero Section ---
  let userGrandTotal = 0;
  let userRank = 0;
  if (allScores) {
    const userTotals = new Map<string, number>();
    allScores.forEach(score => {
      userTotals.set(score.user_id, (userTotals.get(score.user_id) || 0) + score.total_points);
    });
    userGrandTotal = userTotals.get(user.id) || 0;
    
    const sortedUsers = Array.from(userTotals.entries()).sort((a, b) => b[1] - a[1]);
    const rankIndex = sortedUsers.findIndex(([id]) => id === user.id);
    userRank = rankIndex !== -1 ? rankIndex + 1 : 0;
  }
  // -------------------------------------------------------------

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

  const enhancedTeams = (teams || []).map(t => {
    const fplT = fplTeams[t.code] || {};
    
    // Find upcoming fixture for this gameweek
    let nextFixtureStr = 'No fixture';
    if (fixtures) {
      const teamFixture = fixtures.find((f: any) => {
        const home = Array.isArray(f.home_team) ? f.home_team[0] : f.home_team;
        const away = Array.isArray(f.away_team) ? f.away_team[0] : f.away_team;
        return home?.code === t.code || away?.code === t.code;
      });
      if (teamFixture) {
        const f = teamFixture as any;
        const home = Array.isArray(f.home_team) ? f.home_team[0] : f.home_team;
        const away = Array.isArray(f.away_team) ? f.away_team[0] : f.away_team;
        const isHome = home?.code === t.code;
        const opponent = isHome ? away?.name : home?.name;
        nextFixtureStr = `${opponent} (${isHome ? 'Home' : 'Away'})`;
      }
    }

    return {
      ...t,
      ...fplT,
      next_fixture: nextFixtureStr
    };
  });

  return (
    <div className="min-h-screen bg-background text-slate-900 dark:text-slate-100 pb-20 transition-colors duration-300 relative overflow-hidden">
      {/* Immersive Background Glows */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-emerald-500/10 blur-[200px] mix-blend-multiply dark:mix-blend-screen opacity-70" />
        <div className="absolute bottom-0 left-0 h-[800px] w-[800px] rounded-full bg-rose-600/10 blur-[200px] mix-blend-multiply dark:mix-blend-screen opacity-70" />
        <div className="absolute top-[40%] left-[50%] h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/5 blur-[150px] mix-blend-multiply dark:mix-blend-screen" />
      </div>

      {/* Floating Sleek Header */}
      <header className="relative z-50 flex flex-col sm:flex-row items-center justify-between px-6 sm:px-12 py-6 w-full max-w-7xl mx-auto gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-heading uppercase tracking-widest text-slate-900 dark:text-white drop-shadow-md">
            PPL
          </h1>
        </div>
        
        <div className="flex items-center gap-4 glass px-4 py-2 rounded-full">
          {allGameweeks && <GameweekSelector allGameweeks={allowedGameweeks} selectedGwId={selectedGwId} />}
          <div className="w-px h-6 bg-slate-300 dark:bg-slate-700"></div>
          <ThemeToggle />
          <div className="w-px h-6 bg-slate-300 dark:bg-slate-700"></div>
          <form action={async () => {
            'use server'; const supabase = await createClient(); await supabase.auth.signOut(); redirect('/');
          }}>
            <button className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-rose-500 transition-colors">Log out</button>
          </form>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-10">
        
        {/* HERO SECTION */}
        <section className="flex flex-col items-center justify-center text-center mb-4 sm:mb-8 relative">
          <div className="mb-1 sm:mb-2 inline-flex items-center gap-2 px-3 py-1 rounded-full glass border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] sm:text-xs font-bold tracking-widest uppercase">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
            {selectedGw ? (selectedGw.name || `Gameweek ${selectedGw.id}`) : 'Season inactive'}
          </div>

          <div className="flex flex-wrap justify-center gap-6 md:gap-12 items-end mt-1 sm:mt-2">
            <div className="flex flex-col items-center">
              <span className="text-slate-500 dark:text-slate-400 font-bold text-[10px] sm:text-xs tracking-widest uppercase mb-0.5 sm:mb-1">Your Points</span>
              <span className="font-heading text-5xl sm:text-6xl md:text-8xl text-slate-900 dark:text-white drop-shadow-2xl leading-none">
                <AnimatedNumber value={userGrandTotal} />
              </span>
            </div>
            <div className="flex flex-col items-center pb-0.5 sm:pb-1 md:pb-2">
              <span className="text-slate-500 dark:text-slate-400 font-bold text-[9px] sm:text-[10px] tracking-widest uppercase mb-0.5 sm:mb-1">Global Rank</span>
              <span className="font-heading text-3xl sm:text-4xl md:text-5xl text-emerald-600 dark:text-emerald-400 drop-shadow-md leading-none">
                #{userRank > 0 ? <AnimatedNumber value={userRank} /> : '-'}
              </span>
            </div>
          </div>

          {selectedGw?.deadline_time && (
            <div className="mt-4 sm:mt-6 scale-90 md:scale-100 transform origin-top">
              <DeadlineBanner deadlineTime={selectedGw.deadline_time} />
            </div>
          )}
        </section>

        {/* DASHBOARD CONTENT (TABS/GAME MODES) */}
        <DashboardTabs 
          currentGw={selectedGw} 
          fixtures={fixtures || []} 
          teams={enhancedTeams} 
          players={enhancedPlayers} 
          initialPicks={userPicks || []} 
          initialTeamPick={userTeamPick}
          initialScorePicks={userScorePicks || []}
          leaderboard={allScores || []}
          allUserTeamPicks={allUserTeamPicks || []}
          allUserFantasticPicks={allUserFantasticPicks || []}
        />
      </main>
    </div>
  )
}