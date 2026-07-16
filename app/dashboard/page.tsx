// app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardTabs from '@/components/dashboard/dashboard-tabs'
import ThemeToggle from '@/components/theme-toggle'
import GameweekSelector from '@/components/dashboard/gameweek-selector'

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
  const { data: players } = await supabase.from('players').select('id, name, position, teams:team_id(code)').order('name', { ascending: true })

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
          players={players || []} 
          initialPicks={userPicks || []} 
          initialTeamPick={userTeamPick}
          initialScorePicks={userScorePicks || []}
          leaderboard={allScores || []} // We now pass RAW scores, not the aggregated view
        />
      </main>
    </div>
  )
}