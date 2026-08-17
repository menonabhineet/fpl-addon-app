'use client'

import { useState, useTransition, useEffect, useMemo, memo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { submitTeamPrediction, clearSurvivorPick } from '@/lib/actions/team-prediction'

const TeamPredictionUI = memo(function TeamPredictionUI({ teams, currentGw, initialTeamPick, allUserTeamPicks = [], fixtures = [], actualCurrentGwId, allGameweeks = [] }: any) {
  const router = useRouter()
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(initialTeamPick?.team_id || null)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(initialTeamPick ? { type: 'success', text: '✓ Your team is securely locked in' } : null)
  
  // Clear Pick Modal & Portal Mounted check
  const [showClearModal, setShowClearModal] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Modal state for DGW
  const [showModal, setShowModal] = useState(false)
  const [modalTeamId, setModalTeamId] = useState<number | null>(null)
  const [modalFixtures, setModalFixtures] = useState<any[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (initialTeamPick?.team_id) {
      setSelectedTeamId(initialTeamPick.team_id)
      setMessage({ type: 'success', text: '✓ Your team is securely locked in' })
    } else {
      setSelectedTeamId(null)
      setMessage(null)
    }
  }, [initialTeamPick?.team_id])

  const getFixtureTeamId = (teamProp: any): number | null => {
    if (!teamProp) return null
    return Array.isArray(teamProp) ? teamProp[0]?.id : teamProp?.id
  }

  const getFixtureTeamObj = (teamProp: any): any => {
    if (!teamProp) return null
    return Array.isArray(teamProp) ? teamProp[0] : teamProp
  }

  const isLocked = currentGw?.deadline_time ? new Date(currentGw.deadline_time) <= new Date() : false
  const tableRulesApply = currentGw.id > 1 && !currentGw.is_survivor_skipped
  const selectedTeam = teams.find((t: any) => t.id === selectedTeamId)

  const skippedGwsSet = useMemo(() => {
    const set = new Set<number>()
    allGameweeks.forEach((gw: any) => {
      if (gw.is_survivor_skipped) set.add(gw.id)
    })
    return set
  }, [allGameweeks])

  // Calculate streaks and teams locked by the user's active winning streak
  const { activeStreak, bestStreak, activeStreakTeamIds } = useMemo(() => {
    if (!allUserTeamPicks || allUserTeamPicks.length === 0) {
      return { activeStreak: 0, bestStreak: 0, activeStreakTeamIds: new Set<number>() }
    }

    const userPicksByGw = new Map<number, any>()
    for (const p of allUserTeamPicks) {
      if (p.gameweek_id < currentGw.id) {
        userPicksByGw.set(p.gameweek_id, p)
      }
    }

    // Trace active streak strictly checking consecutive gameweeks backwards from currentGw.id - 1
    const activeTeams = new Set<number>()
    let checkGw = currentGw.id - 1
    let runningStreak = 0
    while (checkGw >= 1) {
      if (skippedGwsSet.has(checkGw)) {
        checkGw -= 1
        continue
      }
      const pastPick = userPicksByGw.get(checkGw)
      if (pastPick && (pastPick.match_result === 'win' || (pastPick.points_earned && pastPick.points_earned > 0))) {
        activeTeams.add(pastPick.team_id)
        runningStreak += 1
        checkGw -= 1
      } else {
        // Missed gameweek or loss/draw breaks active streak
        break
      }
    }

    // All-time best streak across entire season history
    let maxStreak = 0
    let tempStreak = 0
    for (let gw = 1; gw < currentGw.id; gw++) {
      if (skippedGwsSet.has(gw)) continue
      const pick = userPicksByGw.get(gw)
      if (pick && (pick.match_result === 'win' || (pick.points_earned && pick.points_earned > 0))) {
        tempStreak += 1
        if (tempStreak > maxStreak) maxStreak = tempStreak
      } else {
        tempStreak = 0
      }
    }

    return { 
      activeStreak: runningStreak, 
      bestStreak: maxStreak, 
      activeStreakTeamIds: activeTeams 
    }
  }, [allUserTeamPicks, currentGw.id, skippedGwsSet])

  // Club Cycle Reset (Edge Case): If active streak locks leave 0 selectable teams for this GW,
  // cycle the used teams back while maintaining the player's active streak number!
  const effectiveActiveStreakTeamIds = useMemo(() => {
    if (activeStreakTeamIds.size === 0 || !tableRulesApply) {
      return activeStreakTeamIds
    }

    const validNonTableTeams = teams.filter((team: any) => {
      const isTop3 = team.position !== null && team.position !== undefined && team.position >= 1 && team.position <= 3
      const teamFixtures = fixtures.filter((f: any) => {
        const hId = getFixtureTeamId(f.home_team)
        const aId = getFixtureTeamId(f.away_team)
        return hId === team.id || aId === team.id
      })
      if (teamFixtures.length === 0) return false

      let isTop3Clash = false
      let isBottom3Clash = false
      let isVsBottom3 = false

      teamFixtures.forEach((f: any) => {
        const hId = getFixtureTeamId(f.home_team)
        const oppId = hId === team.id ? getFixtureTeamId(f.away_team) : hId
        const oppTeam = teams.find((t: any) => t.id === oppId)
        
        if (isTop3 && oppTeam && oppTeam.position !== null && oppTeam.position >= 1 && oppTeam.position <= 3) {
          isTop3Clash = true
        }
        
        const isSelfBottom3 = team.position !== null && team.position >= 18 && team.position <= 20
        const isOppBottom3 = oppTeam && oppTeam.position !== null && oppTeam.position >= 18 && oppTeam.position <= 20
        if (isSelfBottom3 && isOppBottom3) {
          isBottom3Clash = true
        } else if (isOppBottom3 && !isSelfBottom3) {
          isVsBottom3 = true
        }
      })

      const blockedByTop3 = isTop3 && !isTop3Clash
      const blockedByBottom3 = isVsBottom3 && !isBottom3Clash

      return !blockedByTop3 && !blockedByBottom3
    })

    const hasSelectable = validNonTableTeams.some((t: any) => !activeStreakTeamIds.has(t.id))
    if (!hasSelectable && validNonTableTeams.length > 0) {
      // 0 selectable teams left -> release active streak locks (Club Cycle Reset)
      return new Set<number>()
    }

    return activeStreakTeamIds
  }, [activeStreakTeamIds, tableRulesApply, teams, fixtures])

  const handleSelectTeam = (teamId: number) => {
    if (currentGw.is_finished || currentGw.is_survivor_skipped || isLocked) return;
    
    const teamFixtures = fixtures.filter((f: any) => {
      const hId = getFixtureTeamId(f.home_team)
      const aId = getFixtureTeamId(f.away_team)
      return hId === teamId || aId === teamId
    })
    
    if (teamFixtures.length > 1) {
      setModalTeamId(teamId)
      setModalFixtures(teamFixtures)
      setShowModal(true)
    } else {
      const fixtureId = teamFixtures.length === 1 ? teamFixtures[0].id : null
      submitPick(teamId, fixtureId)
    }
  }

  const submitPick = (teamId: number, fixtureId: number | null) => {
    setShowModal(false)
    setSelectedTeamId(teamId)
    setMessage(null)

    const pickedTeam = teams.find((t: any) => t.id === teamId)
    const teamName = pickedTeam?.name || 'Team'

    startTransition(async () => {
      const formData = new FormData()
      formData.append('teamId', teamId.toString())
      formData.append('gameweekId', currentGw.id.toString())
      if (fixtureId) {
        formData.append('fixtureId', fixtureId.toString())
      }
      
      const result = await submitTeamPrediction(formData)
      if (result.success) {
        setMessage({ type: 'success', text: `${teamName} Locked In!` })
        toast.success(result.message || `${teamName} locked in for Gameweek ${currentGw.id}!`)
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save prediction.' })
        toast.error(result.error || `Failed to lock in ${teamName}`)
        setSelectedTeamId(initialTeamPick?.team_id || null)
      }
    })
  }

  const handleClearPick = async () => {
    if (isLocked) {
      toast.error('Gameweek deadline has passed. Survivor picks are locked.')
      return
    }
    const prevTeam = teams.find((t: any) => t.id === selectedTeamId)
    const teamName = prevTeam?.name || 'Survivor team'

    setIsClearing(true)
    try {
      const res = await clearSurvivorPick({ gameweekId: currentGw.id })
      if (res.success) {
        setSelectedTeamId(null)
        setMessage(null)
        setShowClearModal(false)
        toast.success(`Cleared ${teamName} from Gameweek ${currentGw.id}`)
      } else {
        toast.error(res.error || `Failed to clear ${teamName}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to clear ${teamName}`
      toast.error(msg)
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      {/* Rules Banner */}
      <div className="glass rounded-2xl p-4 sm:p-5 text-sm text-slate-700 dark:text-slate-300 border-indigo-500/30 border-l-4 space-y-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg">🔥</span>
          <strong className="text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider text-sm sm:text-base">Survivor Streak Rules:</strong>
          <span className="font-medium">Back 1 team to win each gameweek. Build your consecutive win streak for escalating point bonuses!</span>
        </div>

        <div className="grid sm:grid-cols-2 gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 pt-0.5">
          <div className="flex items-center gap-2 bg-emerald-500/5 dark:bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
            <span className="text-emerald-500 text-sm">⚡</span>
            <span><strong>Escalating Points:</strong> 1st win = <strong className="text-emerald-600 dark:text-emerald-400">1 pt</strong>, 2nd win = <strong className="text-emerald-600 dark:text-emerald-400">2 pts</strong>, 3rd win = <strong className="text-emerald-600 dark:text-emerald-400">3 pts</strong> (+1 bonus per streak win)!</span>
          </div>
          <div className="flex items-center gap-2 bg-rose-500/5 dark:bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
            <span className="text-rose-500 text-sm">💔</span>
            <span><strong>Streak Reset:</strong> Draw or loss = <strong className="text-rose-600 dark:text-rose-400">0 pts</strong> (streak resets to 0 for next week).</span>
          </div>
        </div>

        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 pt-0.5 leading-relaxed">
          🚫 <strong className="text-slate-800 dark:text-slate-200">Restrictions:</strong> You can only use each team <strong>once per active streak</strong>. Teams in 1st–3rd place, and clubs facing 18th–20th opponents are off the board <em>unless playing each other (Top 3 vs Top 3, or Bottom 3 vs Bottom 3)</em>. (Gameweek 1 is exempt).
          <span className="inline-block ml-2 text-emerald-600 dark:text-emerald-400 font-bold">H = Home</span>, <span className="inline-block text-sky-500 dark:text-sky-400 font-bold">A = Away</span>.
        </div>
      </div>

      {/* Active Streak & Potential Bonus Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="glass bg-white/70 dark:bg-black/30 border border-slate-200/80 dark:border-white/10 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Current Streak</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-lg sm:text-2xl">🔥</span>
            <span className="font-heading text-2xl sm:text-4xl text-slate-900 dark:text-white leading-none">
              {activeStreak}
            </span>
            <span className="text-[10px] sm:text-xs font-bold uppercase text-slate-400">{activeStreak === 1 ? 'Win' : 'Wins'}</span>
          </div>
        </div>

        <div className="glass bg-white/70 dark:bg-black/30 border border-slate-200/80 dark:border-white/10 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Next Win Value</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="font-heading text-2xl sm:text-4xl text-emerald-600 dark:text-emerald-400 leading-none">
              +{activeStreak + 1}
            </span>
            <span className="text-[10px] sm:text-xs font-bold uppercase text-emerald-600/80 dark:text-emerald-400/80">
              {activeStreak > 0 ? `(${1} + ${activeStreak} bonus)` : 'Pt'}
            </span>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 glass bg-white/70 dark:bg-black/30 border border-slate-200/80 dark:border-white/10 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">All-Time Best</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-lg sm:text-2xl">🏆</span>
            <span className="font-heading text-2xl sm:text-4xl text-amber-500 leading-none">
              {bestStreak}
            </span>
            <span className="text-[10px] sm:text-xs font-bold uppercase text-slate-400">{bestStreak === 1 ? 'Win' : 'Wins'}</span>
          </div>
        </div>
      </div>
      
      {currentGw.is_survivor_skipped && (
        <div className="glass rounded-xl p-4 text-sm bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 border-l-4">
          ⏸️ <strong className="font-bold uppercase tracking-wider">Survivor Mode Skipped:</strong> The admin has skipped this gameweek. No streak breaks will occur!
        </div>
      )}

      {currentGw.id > actualCurrentGwId && (
        <div className="glass rounded-xl p-4 text-sm bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 border-l-4">
          ⏳ <strong className="font-bold uppercase tracking-wider">Future Gameweek:</strong> You can only make a streak pick for the current active gameweek.
        </div>
      )}

      {/* Action Header: Status & Clear Pick */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 glass rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-3">
          {selectedTeam ? (
            <div className="flex items-center gap-2.5">
              <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                Your Pick: <span className="text-indigo-600 dark:text-indigo-400 font-heading text-base uppercase tracking-wider">{selectedTeam.name}</span>
              </span>
              <img 
                src={`https://resources.premierleague.com/premierleague/badges/t${selectedTeam.code}.png`} 
                alt={selectedTeam.name}
                className="w-5 h-5 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
              />
            </div>
          ) : (
            <span className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400">
              Pick: <span className="italic text-slate-400">No team selected yet</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedTeamId && !isLocked && !currentGw.is_finished && !currentGw.is_survivor_skipped && (
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              disabled={isClearing || isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 border border-rose-500/30 transition-all hover:scale-105 disabled:opacity-50 cursor-pointer shadow-sm"
              title="Clear survivor pick"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              <span>Clear Pick</span>
            </button>
          )}
          {isLocked && (
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              🔒 Picks Locked
            </span>
          )}
        </div>
      </div>

      <div className={`glass rounded-3xl p-6 sm:p-8 relative overflow-hidden group transition-colors duration-300 border border-slate-200/50 dark:border-white/5 ${currentGw.id > actualCurrentGwId ? 'opacity-60 pointer-events-none grayscale' : ''}`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        
        {message && message.type === 'success' && (
          <div className="mb-8 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center shadow-[0_0_15px_rgba(16,185,129,0.1)] relative z-10">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm tracking-widest uppercase">{message.text}</span>
          </div>
        )}
        
        {message && message.type === 'error' && (
          <div className="mb-8 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-center shadow-[0_0_15px_rgba(225,29,72,0.1)] relative z-10">
            <span className="text-rose-600 dark:text-rose-400 font-bold text-sm tracking-widest uppercase">⚠ {message.text}</span>
          </div>
        )}

        {isPending && (
          <div className="mb-8 flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-500">Saving Prediction...</span>
          </div>
        )}

        {/* 3D Grid of Teams */}
        <div className={`grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3.5 sm:gap-4 mb-8 relative z-10 transition-opacity ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
          {teams.map((team: any) => {
            const isUsedInStreak = effectiveActiveStreakTeamIds.has(team.id);
            
            // Check Top 3 (strictly 1st, 2nd, or 3rd place)
            const isTop3 = tableRulesApply && team.position !== null && team.position !== undefined && team.position >= 1 && team.position <= 3;
            
            // Check Fixtures, Clash Rules, and Bottom 3 Opponent
            const teamFixtures = fixtures.filter((f: any) => {
              const hId = getFixtureTeamId(f.home_team)
              const aId = getFixtureTeamId(f.away_team)
              return hId === team.id || aId === team.id
            });

            const hasNoFixture = teamFixtures.length === 0;
            const isSelfBottom3 = team.position !== null && team.position !== undefined && team.position >= 18 && team.position <= 20;

            let isTop3Clash = false;
            let isBottom3Clash = false;
            let isVsBottom3 = false;

            if (tableRulesApply && teamFixtures.length > 0) {
              teamFixtures.forEach((f: any) => {
                const hId = getFixtureTeamId(f.home_team);
                const oppId = hId === team.id ? getFixtureTeamId(f.away_team) : hId;
                const oppTeam = teams.find((t: any) => t.id === oppId);

                // Top 3 vs Top 3 Clash Check
                if (isTop3 && oppTeam && oppTeam.position !== null && oppTeam.position >= 1 && oppTeam.position <= 3) {
                  isTop3Clash = true;
                }

                // Bottom 3 Opponent & Clash Check
                const isOppBottom3 = oppTeam && oppTeam.position !== null && oppTeam.position >= 18 && oppTeam.position <= 20;
                if (isSelfBottom3 && isOppBottom3) {
                  isBottom3Clash = true;
                } else if (isOppBottom3 && !isSelfBottom3) {
                  isVsBottom3 = true;
                }
              });
            }

            const isBlockedByTop3 = isTop3 && !isTop3Clash;
            const isBlockedByBottom3 = isVsBottom3 && !isBottom3Clash;

            // Determine badge label and color
            let badgeLabel: string | null = null;
            let badgeColor = 'text-rose-500';

            if (isUsedInStreak) {
              badgeLabel = 'In Streak';
              badgeColor = 'text-rose-500';
            } else if (isBlockedByTop3) {
              badgeLabel = 'Top 3';
              badgeColor = 'text-amber-500';
            } else if (isBlockedByBottom3) {
              badgeLabel = 'Vs Bottom 3';
              badgeColor = 'text-orange-500';
            } else if (hasNoFixture) {
              badgeLabel = 'Blank GW';
              badgeColor = 'text-slate-400';
            }

            const isDisabled = isUsedInStreak || isBlockedByTop3 || isBlockedByBottom3 || hasNoFixture || currentGw.is_finished || currentGw.is_survivor_skipped || isLocked;

            return (
              <div 
                key={team.id}
                onClick={() => {
                  if (!isDisabled) handleSelectTeam(team.id)
                }}
                className={`relative rounded-2xl border-2 p-3 sm:p-4 flex flex-col items-center justify-center gap-2 transition-all duration-300 overflow-hidden ${
                  isDisabled ? 'opacity-40 cursor-not-allowed bg-black/5 dark:bg-white/5 grayscale border-transparent' : 'cursor-pointer'
                } ${
                  selectedTeamId === team.id && !isDisabled
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 shadow-[0_0_20px_rgba(99,102,241,0.2)] scale-[1.04] z-10' 
                    : !isDisabled ? 'border-white/10 hover:border-indigo-500/30 bg-white/40 dark:bg-black/20 backdrop-blur-sm hover:bg-white/60 dark:hover:bg-white/10 hover:scale-[1.02]' : ''
                }`}
              >
                {selectedTeamId === team.id && !isDisabled && <div className="absolute inset-0 bg-indigo-500/10 blur-xl pointer-events-none" />}
                
                {/* Rule badge if disabled (Top Right Corner) */}
                {isDisabled && badgeLabel && (
                  <span className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-extrabold uppercase tracking-wider ${badgeColor} bg-black/60 dark:bg-black/80 backdrop-blur-xs border border-white/10 z-20`}>
                    {badgeLabel}
                  </span>
                )}

                {/* Clash Matchup Unlocked Badge (if team unlocked via special clash) */}
                {!isDisabled && isTop3Clash && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-extrabold uppercase tracking-wider text-amber-500 bg-amber-500/10 border border-amber-500/30 z-20" title="Top 3 Clash: Matchup unlocked!">
                    ⚔️ Clash
                  </span>
                )}

                {!isDisabled && isBottom3Clash && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-extrabold uppercase tracking-wider text-cyan-500 bg-cyan-500/10 border border-cyan-500/30 z-20" title="Relegation Battle: Matchup unlocked!">
                    ⚔️ Clash
                  </span>
                )}

                {/* Team Crest */}
                <img 
                  src={`https://resources.premierleague.com/premierleague/badges/t${team.code}.png`} 
                  alt={team.name}
                  className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-md relative z-10"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
                />

                {/* Team Short Name + Opponent Fixture Subtext */}
                <div className="flex flex-col items-center relative z-10 text-center gap-0.5 w-full">
                  <span className="font-heading text-lg sm:text-xl uppercase tracking-wide text-slate-900 dark:text-white leading-none">
                    {team.short_name}
                  </span>

                  {/* Opponent Subtext (e.g. H v COV or A v BHA) */}
                  {teamFixtures.length > 0 ? (
                    <div className="flex flex-col items-center gap-0.5 w-full mt-0.5">
                      {teamFixtures.map((f: any, idx: number) => {
                        const isHome = getFixtureTeamId(f.home_team) === team.id;
                        const oppObj = isHome ? getFixtureTeamObj(f.away_team) : getFixtureTeamObj(f.home_team);
                        if (!oppObj) return null;

                        return (
                          <div key={f.id || idx} className="flex items-center justify-center gap-1 text-[11px] sm:text-xs font-semibold tracking-tight">
                            <span className={`font-black text-[11px] sm:text-xs ${isHome ? 'text-emerald-500 dark:text-emerald-400' : 'text-sky-500 dark:text-sky-400'}`}>
                              {isHome ? 'H' : 'A'}
                            </span>
                            <span className="text-slate-400 dark:text-slate-500 text-[10px] lowercase font-medium">v</span>
                            <span className="text-slate-700 dark:text-slate-300 font-bold text-[11px] sm:text-xs uppercase">
                              {oppObj.short_name || 'UNK'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                      Blank GW
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected Team Stats Panel */}
        {selectedTeamId && selectedTeam && (
          <div className="p-6 glass bg-white/50 dark:bg-black/20 border border-slate-200/50 dark:border-white/5 rounded-2xl animate-in slide-in-from-bottom-4 flex flex-col md:flex-row gap-6 items-center justify-between relative z-10 shadow-[0_0_15px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-4">
              <img 
                src={`https://resources.premierleague.com/premierleague/badges/t${selectedTeam.code}.png`} 
                alt={selectedTeam.name}
                className="w-16 h-16 object-contain drop-shadow-md"
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
              />
              <div>
                <h3 className="font-heading text-2xl uppercase tracking-widest text-slate-900 dark:text-white drop-shadow-sm">{selectedTeam.name}</h3>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Form: <span className="text-indigo-600 dark:text-indigo-400">{selectedTeam.form || 'N/A'}</span></p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8">
              <div className="flex flex-col items-center bg-white/40 dark:bg-white/5 px-4 py-2 rounded-xl border border-slate-200/50 dark:border-white/5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Position</span>
                <span className="font-heading text-2xl text-slate-800 dark:text-slate-200">{selectedTeam.position || '-'}</span>
              </div>
              <div className="flex flex-col items-center bg-white/40 dark:bg-white/5 px-4 py-2 rounded-xl border border-slate-200/50 dark:border-white/5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Strength</span>
                <span className="font-heading text-2xl text-slate-800 dark:text-slate-200">{selectedTeam.strength || '-'}</span>
              </div>
              <div className="flex flex-col items-center bg-white/40 dark:bg-white/5 px-4 py-2 rounded-xl border border-slate-200/50 dark:border-white/5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Upcoming Fixtures</span>
                <div className="flex items-center gap-3">
                  {selectedTeam.next_3_fixtures && selectedTeam.next_3_fixtures.length > 0 ? (
                    <>
                      <span className="font-heading text-xl text-slate-800 dark:text-slate-200">{selectedTeam.next_3_fixtures[0].opponentShortName} ({selectedTeam.next_3_fixtures[0].isHome ? 'H' : 'A'})</span>
                      {selectedTeam.next_3_fixtures.length > 1 && (
                         <div className="flex items-center gap-2 opacity-60">
                           {selectedTeam.next_3_fixtures.slice(1).map((f: any, i: number) => (
                             <span key={i} className="font-heading text-sm text-slate-800 dark:text-slate-200">{f.opponentShortName} ({f.isHome ? 'H' : 'A'})</span>
                           ))}
                         </div>
                      )}
                    </>
                  ) : (
                    <span className="font-heading text-xl text-slate-800 dark:text-slate-200">{selectedTeam.next_fixture || 'N/A'}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clear Confirmation Modal */}
      {showClearModal && mounted && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowClearModal(false)}
        >
          <div 
            className="glass max-w-md w-full p-6 sm:p-8 rounded-3xl border border-white/10 bg-neutral-950/95 shadow-2xl space-y-6 text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </div>
              <h3 className="text-xl font-heading uppercase tracking-wider text-slate-900 dark:text-white">Clear Pick?</h3>
            </div>
            
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to remove your streak pick ({selectedTeam?.name}) for <strong>Gameweek {currentGw.id}</strong>? You will be able to select another team before the deadline.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearPick}
                disabled={isClearing}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-500 active:scale-95 shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isClearing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Clearing...</span>
                  </>
                ) : (
                  <span>Yes, Clear Pick</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
})

export default TeamPredictionUI