import { Suspense } from 'react'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardTabs from '@/components/dashboard/dashboard-tabs'
import ThemeToggle from '@/components/theme-toggle'
import GameweekSelector from '@/components/dashboard/gameweek-selector'
import { getCachedBootstrapStatic, getCachedFixtures } from '@/lib/fpl-api'
import DeadlineBanner from '@/components/dashboard/deadline-banner'
import AnimatedNumber from '@/components/dashboard/animated-number'
import BonusQuestionClient from '@/components/dashboard/bonus-question-client'
import RefreshButton from '@/components/dashboard/refresh-button'
import AutoRefresh from '@/components/dashboard/auto-refresh'
import ManagerProfileButton from '@/components/dashboard/manager-profile-button'
import { createAdminClient } from '@/lib/supabase/admin'
import LeagueSelector from '@/components/dashboard/league-selector'
import { getUserLeagues } from '@/lib/actions/leagues'

// 1. KILL THE CACHE: This forces Next.js to always fetch live data from database
export const dynamic = 'force-dynamic' 

export default async function DashboardPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ gw?: string; league?: string }> 
}) {
  const [resolvedParams, supabase] = await Promise.all([
    searchParams,
    createClient()
  ])

  // Batch 1: Authenticate user & fetch gameweeks in parallel
  const [{ data: authData, error: authError }, { data: allGameweeks }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('gameweeks').select('*').order('id', { ascending: true })
  ])

  const user = authData?.user
  if (authError || !user) redirect('/')

  // Determine active league ID from URL searchParams
  const activeLeagueId = resolvedParams.league || null

  // Determine active and allowed gameweeks
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

  const adminClient = createAdminClient()

  // Batch 2: Execute all independent read queries, user leagues, and cached FPL data concurrently in parallel
  const [
    { data: fixtures },
    { data: teams },
    { data: players },
    { data: bonusQuestion },
    { data: allUserBonusPredictions },
    { data: allUserFantasticPicks },
    { data: allUserTeamPicks },
    { data: allUserScorePicks },
    { data: activeRound },
    { data: allUserSurvivorEntries },
    { data: allScores, error: scoresError },
    { data: allProfiles },
    { data: allTeamPredictions },
    userLeaguesRes,
    activeLeagueMembersData,
    fplDataResult,
    fplFixturesResult
  ] = await Promise.all([
    supabase.from('fixtures').select('id, home_score, away_score, kickoff_time, is_finished, is_selected, home_team:home_team_id (id, name, short_name, code), away_team:away_team_id (id, name, short_name, code)').eq('gameweek_id', selectedGwId).order('kickoff_time', { ascending: true }),
    supabase.from('teams').select('*').order('name', { ascending: true }),
    supabase.from('players').select('id, name, position, teams:team_id(code, short_name, name)').order('name', { ascending: true }),
    supabase.from('bonus_questions').select('*').eq('gameweek', selectedGwId).maybeSingle(),
    supabase.from('bonus_predictions').select('*').eq('user_id', user.id),
    supabase.from('fantastic_four').select('*').eq('user_id', user.id).eq('gameweek_id', selectedGwId),
    supabase.from('team_predictions').select('*').eq('user_id', user.id).order('gameweek_id', { ascending: true }),
    supabase.from('score_predictions').select('*').eq('user_id', user.id),
    supabase.from('survivor_rounds').select('*').eq('status', 'active').maybeSingle(),
    supabase.from('survivor_entries').select('*').eq('user_id', user.id),
    supabase.from('vw_user_scores_with_profiles').select('*').order('total_points', { ascending: false }),
    adminClient.from('profiles').select('id, full_name, nickname, email, avatar_url'),
    adminClient.from('team_predictions').select('user_id, gameweek_id, match_result, points_earned'),
    getUserLeagues(user.id),
    activeLeagueId ? adminClient.from('league_members').select('user_id').eq('league_id', activeLeagueId) : Promise.resolve({ data: null }),
    getCachedBootstrapStatic().catch((err: any) => { console.error('Failed to get bootstrap static:', err); return null; }),
    getCachedFixtures().catch((err: any) => { console.error('Failed to get fixtures:', err); return []; })
  ])

  if (scoresError) {
    console.error("Failed to fetch leaderboard data:", scoresError)
  }

  // Pre-calculate streaks for all users
  const userStreaksMap = new Map<string, { currentStreak: number; bestStreak: number }>()
  const skippedGwsSet = new Set<number>()
  allGameweeks?.forEach((gw: any) => {
    if (gw.is_survivor_skipped) skippedGwsSet.add(gw.id)
  })

  const picksByUser = new Map<string, Map<number, any>>()
  allTeamPredictions?.forEach((p: any) => {
    if (!picksByUser.has(p.user_id)) {
      picksByUser.set(p.user_id, new Map<number, any>())
    }
    picksByUser.get(p.user_id)!.set(p.gameweek_id, p)
  })

  allProfiles?.forEach((prof: any) => {
    const userPicksByGw = picksByUser.get(prof.id) || new Map<number, any>()
    
    let currentStreak = 0
    let checkGw = currentGwId - 1
    while (checkGw >= 1) {
      if (skippedGwsSet.has(checkGw)) {
        checkGw -= 1
        continue
      }
      const pastPick = userPicksByGw.get(checkGw)
      if (pastPick && (pastPick.match_result === 'win' || (pastPick.points_earned && pastPick.points_earned > 0))) {
        currentStreak += 1
        checkGw -= 1
      } else {
        break
      }
    }

    let bestStreak = 0
    let tempStreak = 0
    for (let gw = 1; gw <= 38; gw++) {
      if (skippedGwsSet.has(gw)) continue
      const pick = userPicksByGw.get(gw)
      if (pick && (pick.match_result === 'win' || (pick.points_earned && pick.points_earned > 0))) {
        tempStreak += 1
        if (tempStreak > bestStreak) bestStreak = tempStreak
      } else {
        tempStreak = 0
      }
    }

    userStreaksMap.set(prof.id, { currentStreak, bestStreak })
  })

  const userLeagues = userLeaguesRes.success && userLeaguesRes.leagues ? userLeaguesRes.leagues : []
  const activeLeague = userLeagues.find(l => l.id === activeLeagueId) || null

  const myProfile = allProfiles?.find((p: any) => p.id === user.id) || null

  // Synthesize complete leaderboard records including freshly registered users
  let groupScores: any[] = [...(allScores || [])]
  if (allProfiles && allProfiles.length > 0) {
    allProfiles.forEach((prof: any) => {
      const hasScore = groupScores.some((s: any) => s.user_id === prof.id)
      if (!hasScore) {
        const displayName = prof.nickname || prof.full_name || (prof.email ? prof.email.split('@')[0] : 'Manager')
        groupScores.push({
          id: `placeholder-${prof.id}`,
          user_id: prof.id,
          gameweek_id: selectedGwId,
          score_points: 0,
          team_points: 0,
          fantastic_four_points: 0,
          penalty_points: 0,
          total_points: 0,
          bonus_points: 0,
          manager_name: displayName,
          full_name: prof.full_name,
          nickname: prof.nickname,
          avatar_url: prof.avatar_url || null
        })
      }
    })
  }

  // Enrich all records with current_streak and best_streak
  groupScores.forEach((s: any) => {
    const st = userStreaksMap.get(s.user_id)
    s.current_streak = st?.currentStreak || 0
    s.best_streak = st?.bestStreak || 0
  })

  // Filter leaderboard scores strictly by active league if a league is selected
  let scopedScores: any[] = []
  if (activeLeague) {
    const memberUserIds: string[] = (activeLeagueMembersData?.data || []).map((m: any) => m.user_id)
    const memberIdSet = new Set(memberUserIds)
    scopedScores = groupScores.filter((score: any) => memberIdSet.has(score.user_id))
  } else {
    scopedScores = groupScores
  }

  // Bonus prediction for selected gameweek
  const bonusPrediction = bonusQuestion && allUserBonusPredictions
    ? allUserBonusPredictions.find((p: any) => p.question_id === bonusQuestion.id) || null
    : null

  // User picks for current selection
  const userPicks = allUserFantasticPicks || []
  const userTeamPick = allUserTeamPicks?.find((p: any) => p.gameweek_id === selectedGwId) || null

  let userScorePicks: any[] = []
  if (fixtures && fixtures.length > 0 && allUserScorePicks) {
    const fixtureIdSet = new Set(fixtures.map((f: any) => f.id))
    userScorePicks = allUserScorePicks.filter((p: any) => fixtureIdSet.has(p.fixture_id))
  }

  // Survivor entry resolution
  let survivorEntry = null
  let isNewRound = false
  if (activeRound && allUserSurvivorEntries) {
    survivorEntry = allUserSurvivorEntries.find((e: any) => e.round_id === activeRound.id) || null
    isNewRound = activeRound.start_gameweek_id === selectedGwId && !selectedGw.is_survivor_skipped
  }

  // FPL Data Processing (Form, PPG, Strength, Fixtures)
  let fplElements: any = {}
  let fplTeams: any = {}
  let fplEvents: any[] = []
  const fplFixtures: any[] = fplFixturesResult || []

  if (fplDataResult) {
    fplEvents = fplDataResult.events || []
    fplElements = (fplDataResult.elements || []).reduce((acc: any, el: any) => {
      acc[el.id] = {
        form: parseFloat(el.form) || 0,
        points_per_game: parseFloat(el.points_per_game) || 0,
        total_points: el.total_points || 0,
        selected_by_percent: parseFloat(el.selected_by_percent) || 0,
        status: el.status || 'a',
        news: el.news || '',
        chance_of_playing_next_round: el.chance_of_playing_next_round,
        event_points: el.event_points || 0,
        now_cost: el.now_cost ? (el.now_cost / 10).toFixed(1) : null
      }
      return acc
    }, {})
    fplTeams = (fplDataResult.teams || []).reduce((acc: any, team: any) => {
      acc[team.code] = {
        position: team.position,
        form: team.form,
        strength: team.strength,
      }
      return acc
    }, {})
  }

  // --- Calculate User Points and Rank for Hero Section (Scoped to active league or global) ---
  let userGrandTotal = 0;
  let userRank = 0;
  let userDisplayName = myProfile?.nickname || myProfile?.full_name || user?.email?.split('@')[0] || 'Manager';
  if (groupScores && groupScores.length > 0) {
    const userTotals = new Map<string, number>();
    groupScores.forEach(score => {
      const effectivePoints = (score.score_points || 0) + (score.team_points || 0) + (score.fantastic_four_points || 0) + (score.bonus_points || 0);
      userTotals.set(score.user_id, (userTotals.get(score.user_id) || 0) + effectivePoints);
    });
    userGrandTotal = userTotals.get(user.id) || 0;

    // Determine rank within the scoped league or global
    const scopedUserTotals = new Map<string, number>();
    scopedScores.forEach((score: any) => {
      const effectivePoints = (score.score_points || 0) + (score.team_points || 0) + (score.fantastic_four_points || 0) + (score.bonus_points || 0);
      scopedUserTotals.set(score.user_id, (scopedUserTotals.get(score.user_id) || 0) + effectivePoints);
    });

    const sortedUsers = Array.from(scopedUserTotals.entries()).sort((a, b) => b[1] - a[1]);
    const rankIndex = sortedUsers.findIndex(([id]) => id === user.id);
    userRank = rankIndex !== -1 ? rankIndex + 1 : 0;
  }
  // -------------------------------------------------------------

  // Pre-calculate team code to fixture lookup map in O(M) once
  const teamFixtureMap = new Map<number, string>()
  const teamFixtureObjMap = new Map<number, { opponentName: string; isHome: boolean }>()
  if (fixtures) {
    fixtures.forEach((f: any) => {
      const home = Array.isArray(f.home_team) ? f.home_team[0] : f.home_team
      const away = Array.isArray(f.away_team) ? f.away_team[0] : f.away_team
      if (home?.code) {
        teamFixtureMap.set(home.code, `${away?.short_name || 'UNK'} (H)`)
        teamFixtureObjMap.set(home.code, { opponentName: away?.name || 'Unknown', isHome: true })
      }
      if (away?.code) {
        teamFixtureMap.set(away.code, `${home?.short_name || 'UNK'} (A)`)
        teamFixtureObjMap.set(away.code, { opponentName: home?.name || 'Unknown', isHome: false })
      }
    })
  }

  const enhancedPlayers = (players || []).map(p => {
    const fplData = fplElements[p.id] || { form: 0, total_points: 0, points_per_game: 0, selected_by_percent: 0, status: 'a', news: '', chance_of_playing_next_round: null }
    const teamData = p.teams as any
    const teamCode = Array.isArray(teamData) ? teamData[0]?.code : teamData?.code
    const nextFixtureStr = teamCode ? (teamFixtureMap.get(teamCode) || 'No fixture') : 'No fixture'
    
    return {
      id: p.id,
      name: p.name,
      position: p.position,
      teams: p.teams,
      form: fplData.form,
      points_per_game: fplData.points_per_game,
      total_points: fplData.total_points,
      selected_by_percent: fplData.selected_by_percent,
      status: fplData.status,
      news: fplData.news,
      chance_of_playing_next_round: fplData.chance_of_playing_next_round,
      event_points: fplData.event_points || 0,
      now_cost: fplData.now_cost || null,
      next_fixture: nextFixtureStr
    }
  })

  const nextEvent = fplEvents.find((e: any) => e.is_next) || fplEvents.find((e: any) => e.is_current) || fplEvents[0]
  const fplNextGwId = nextEvent?.id || 1

  // Pre-index teams by ID for O(1) lookup when building next 3 fixtures
  const teamsByIdMap = new Map<number, any>()
  if (teams) {
    teams.forEach((t: any) => teamsByIdMap.set(t.id, t))
  }

  const enhancedTeams = (teams || []).map(t => {
    const fplT = fplTeams[t.code] || {}
    const teamFixtureInfo = teamFixtureObjMap.get(t.code)
    const nextFixtureStr = teamFixtureInfo 
      ? `${teamFixtureInfo.opponentName} (${teamFixtureInfo.isHome ? 'Home' : 'Away'})`
      : 'No fixture'

    // Find next 3 fixtures from FPL fixtures API data
    const teamNext3Fixtures = fplFixtures
      .filter((f: any) => f.event >= fplNextGwId && (f.team_h === t.id || f.team_a === t.id))
      .sort((a: any, b: any) => {
        if (a.event !== b.event) return (a.event || 99) - (b.event || 99)
        return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
      })
      .slice(0, 3)
      .map((f: any) => {
        const isHome = f.team_h === t.id
        const opponentId = isHome ? f.team_a : f.team_h
        const opponent = teamsByIdMap.get(opponentId)
        return {
          opponentName: opponent ? opponent.name : 'Unknown',
          opponentShortName: opponent ? opponent.short_name : 'UNK',
          isHome,
          event: f.event,
          difficulty: isHome ? f.team_h_difficulty : f.team_a_difficulty
        }
      })

    return {
      id: t.id,
      name: t.name,
      short_name: t.short_name,
      code: t.code,
      position: fplT.position || null,
      form: fplT.form || null,
      strength: fplT.strength || null,
      next_fixture: nextFixtureStr,
      next_3_fixtures: teamNext3Fixtures
    }
  })

  return (
    <div className="min-h-screen bg-background text-slate-900 dark:text-slate-100 pb-32 sm:pb-36 transition-colors duration-300 relative">
      <AutoRefresh />
      {/* Immersive Background Glows (Hardware-Accelerated Gradients) */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none gpu-accelerated" style={{ contain: 'strict' }}>
        <div 
          className="absolute -top-[10%] -right-[10%] h-[700px] w-[700px] rounded-full opacity-70 dark:opacity-40 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0) 70%)' }}
        />
        <div 
          className="absolute -bottom-[10%] -left-[10%] h-[700px] w-[700px] rounded-full opacity-70 dark:opacity-40 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(225,29,72,0.14) 0%, rgba(225,29,72,0) 70%)' }}
        />
        <div 
          className="absolute top-[40%] left-[50%] -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full opacity-40 dark:opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, rgba(99,102,241,0) 70%)' }}
        />
      </div>

      {/* Sleek App Navigation Header (Sticky on Mobile & Desktop with Blurred Backdrop) */}
      <header className="sticky top-0 z-50 w-full backdrop-blur-xl bg-background/85 dark:bg-neutral-950/85 border-b border-slate-200/50 dark:border-white/10 transition-colors shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-12 py-2.5 sm:py-4">
          {/* Desktop Layout (sm and up) */}
          <div className="hidden sm:flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden shadow-lg shadow-emerald-500/20 group hover:scale-105 transition-transform">
                <Image
                  src="/icon.svg"
                  alt="PPL Logo"
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                  priority
                />
              </div>
              <h1 className="text-2xl font-heading uppercase tracking-widest text-slate-900 dark:text-white drop-shadow-md">
                PPL
              </h1>
            </div>

            <div className="flex flex-nowrap items-center gap-2 sm:gap-4 glass px-4 py-2 rounded-full relative">
              <Suspense fallback={null}>
                <LeagueSelector userLeagues={userLeagues} activeLeague={activeLeague} currentUserId={user.id} />
              </Suspense>
              <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 shrink-0"></div>
              {allGameweeks && (
                <Suspense fallback={<span className="text-xs font-bold uppercase tracking-widest text-slate-500">Gameweek {selectedGwId}</span>}>
                  <GameweekSelector allGameweeks={allowedGameweeks} selectedGwId={selectedGwId} />
                </Suspense>
              )}
              <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 shrink-0"></div>
              <RefreshButton />
              <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 shrink-0"></div>
              <ThemeToggle />
              
              <div className="flex items-center gap-3 border-l border-slate-300 dark:border-slate-700 pl-3 ml-0 shrink-0">
                <ManagerProfileButton 
                  userDisplayName={userDisplayName} 
                  userEmail={user.email} 
                  currentNickname={myProfile?.nickname || ''} 
                  userFullName={myProfile?.full_name || ''} 
                />
                <form action={async () => {
                  'use server'; const supabase = await createClient(); await supabase.auth.signOut(); redirect('/');
                }}>
                  <button className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-rose-500 transition-colors whitespace-nowrap cursor-pointer">Log out</button>
                </form>
              </div>
            </div>
          </div>

          {/* Mobile Layout (< sm) */}
          <div className="flex sm:hidden flex-col gap-2.5 w-full">
            {/* Top Row: App Brand on Left, Theme & Profile on Right */}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden shadow-md shadow-emerald-500/20">
                  <Image
                    src="/icon.svg"
                    alt="PPL Logo"
                    width={32}
                    height={32}
                    className="h-8 w-8 object-contain"
                    priority
                  />
                </div>
                <span className="text-lg font-heading uppercase tracking-widest text-slate-900 dark:text-white">
                  PPL
                </span>
              </div>

              <div className="flex items-center gap-2">
                <ThemeToggle />
                <ManagerProfileButton 
                  userDisplayName={userDisplayName} 
                  userEmail={user.email} 
                  currentNickname={myProfile?.nickname || ''} 
                  userFullName={myProfile?.full_name || ''} 
                />
              </div>
            </div>

            {/* Bottom Row: Full-width 3-segment toolbar utilizing the whole bar */}
            <div className="flex items-center justify-between glass bg-white/80 dark:bg-neutral-900/80 border border-slate-200/80 dark:border-white/10 rounded-2xl p-1 shadow-xs w-full">
              {/* Segment 1: League Selector (Left segment) */}
              <div className="flex-1 min-w-0 flex items-center justify-center px-1">
                <Suspense fallback={null}>
                  <LeagueSelector userLeagues={userLeagues} activeLeague={activeLeague} currentUserId={user.id} />
                </Suspense>
              </div>

              <div className="w-px h-5 bg-slate-300/60 dark:bg-white/10 shrink-0" />

              {/* Segment 2: Gameweek Selector (Center segment) */}
              <div className="flex-1 min-w-0 flex items-center justify-center px-1">
                {allGameweeks && (
                  <Suspense fallback={<span className="text-xs font-bold uppercase tracking-widest text-slate-500">Gameweek {selectedGwId}</span>}>
                    <GameweekSelector allGameweeks={allowedGameweeks} selectedGwId={selectedGwId} />
                  </Suspense>
                )}
              </div>

              <div className="w-px h-5 bg-slate-300/60 dark:bg-white/10 shrink-0" />

              {/* Segment 3: Refresh Button (Right segment) */}
              <div className="px-2 flex items-center justify-center shrink-0">
                <RefreshButton />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-10">
        
        {/* HERO SECTION */}
        <section className="flex flex-col items-center justify-center text-center mb-4 sm:mb-8 relative">
          <div className="flex flex-wrap items-center justify-center gap-2 mb-1 sm:mb-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] sm:text-xs font-bold tracking-widest uppercase">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
              {selectedGw ? (selectedGw.name || `Gameweek ${selectedGw.id}`) : 'Season inactive'}
            </div>

            {activeLeague && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] sm:text-xs font-bold tracking-widest uppercase">
                <span>🏆</span>
                <span>{activeLeague.name}</span>
                <span className="text-[10px] opacity-70">({activeLeague.member_count} {activeLeague.member_count === 1 ? 'manager' : 'managers'})</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-6 md:gap-12 items-end mt-1 sm:mt-2">
            <div className="flex flex-col items-center">
              <span className="text-slate-500 dark:text-slate-400 font-bold text-[10px] sm:text-xs tracking-widest uppercase mb-0.5 sm:mb-1">Your Points</span>
              <span className="font-heading text-5xl sm:text-6xl md:text-8xl text-slate-900 dark:text-white drop-shadow-2xl leading-none">
                <AnimatedNumber value={userGrandTotal} />
              </span>
            </div>
            <div className="flex flex-col items-center pb-0.5 sm:pb-1 md:pb-2">
              <span className="text-slate-500 dark:text-slate-400 font-bold text-[9px] sm:text-[10px] tracking-widest uppercase mb-0.5 sm:mb-1">
                {activeLeague ? `${activeLeague.name} Rank` : 'Global Rank'}
              </span>
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

          {selectedGw?.is_survivor_skipped && (
            <div className="mt-4 sm:mt-6 max-w-2xl mx-auto w-full glass rounded-xl p-4 text-sm bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 border-l-4 text-left animate-in fade-in slide-in-from-bottom-4 duration-500 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
              <div className="flex items-start sm:items-center gap-3">
                <span className="text-2xl mt-0.5 sm:mt-0">⏸️</span>
                <div>
                  <strong className="font-bold uppercase tracking-wider block mb-0.5 sm:mb-1">Survivor Mode Paused</strong> 
                  The admin has paused Survivor Mode for this gameweek. No streak breaks will occur!
                </div>
              </div>
            </div>
          )}
        </section>

        {bonusQuestion && (
          <BonusQuestionClient 
            question={bonusQuestion} 
            prediction={bonusPrediction} 
            isLocked={selectedGw?.deadline_time ? new Date(selectedGw.deadline_time) <= new Date() : false} 
          />
        )}

        {/* DASHBOARD CONTENT (TABS/GAME MODES) */}
        <DashboardTabs 
          currentGw={selectedGw} 
          fixtures={fixtures || []} 
          teams={enhancedTeams} 
          players={enhancedPlayers} 
          initialPicks={userPicks || []} 
          initialTeamPick={userTeamPick}
          initialScorePicks={userScorePicks || []}
          leaderboard={scopedScores || []}
          allUserTeamPicks={allUserTeamPicks || []}
          allUserFantasticPicks={allUserFantasticPicks || []}
          fplFixtures={fplFixtures}
          fplEvents={fplEvents}
          survivorEntry={survivorEntry}
          isNewRound={isNewRound}
          actualCurrentGwId={currentGwId}
          currentUserId={user?.id}
          activeLeague={activeLeague}
          allGameweeks={allGameweeks || []}
        />
      </main>
    </div>
  )
}