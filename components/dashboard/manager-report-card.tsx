'use client'

import { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { getManagerPastPicks } from '@/lib/actions/manager-picks'
import React from 'react'

interface ManagerReportCardProps {
  isOpen: boolean
  onClose: () => void
  managerId: string
  managerName: string
  allScores: any[]
}

// In-memory client cache for manager report card picks
const managerPicksCache = new Map<string, { data: Record<number, any>; timestamp: number }>()
const REPORT_CARD_CACHE_TTL = 60 * 1000 // 60 seconds

export default function ManagerReportCard({ isOpen, onClose, managerId, managerName, allScores }: ManagerReportCardProps) {
  const [mounted, setMounted] = useState(false)
  const [picks, setPicks] = useState<Record<number, any> | null>(null)
  const [loadingPicks, setLoadingPicks] = useState(false)
  const [expandedGw, setExpandedGw] = useState<number | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock background scroll when modal is open on mobile and desktop
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && managerId) {
      setExpandedGw(null)
      const cached = managerPicksCache.get(managerId)
      const isValid = cached && (Date.now() - cached.timestamp < REPORT_CARD_CACHE_TTL)

      if (isValid) {
        setPicks(cached.data)
        setLoadingPicks(false)
        return
      }

      setLoadingPicks(true)
      setPicks(null)
      getManagerPastPicks(managerId).then(res => {
        if (res.success && res.data) {
          managerPicksCache.set(managerId, {
            data: res.data,
            timestamp: Date.now()
          })
          setPicks(res.data)
        }
        setLoadingPicks(false)
      }).catch(() => {
        setLoadingPicks(false)
      })
    }
  }, [isOpen, managerId])

  const stats = useMemo(() => {
    if (!managerId || !allScores) return null

    const userScores = allScores.filter(s => s.user_id === managerId).sort((a, b) => b.gameweek_id - a.gameweek_id)

    if (userScores.length === 0) return null

    let highestScore = -Infinity
    let lowestScore = Infinity
    let totalPoints = 0
    const currentStreak = userScores[0]?.current_streak || 0
    const bestStreak = userScores[0]?.best_streak || 0

    userScores.forEach(score => {
      const gwTotal = (score.score_points || 0) + (score.team_points || 0) + (score.fantastic_four_points || 0) + (score.bonus_points || 0)
      if (gwTotal > highestScore) highestScore = gwTotal
      if (gwTotal < lowestScore) lowestScore = gwTotal
      totalPoints += gwTotal
    })

    const avgScore = totalPoints / userScores.length

    return {
      history: userScores,
      highestScore: highestScore === -Infinity ? 0 : highestScore,
      lowestScore: lowestScore === Infinity ? 0 : lowestScore,
      avgScore: avgScore.toFixed(1),
      totalPoints,
      currentStreak,
      bestStreak
    }
  }, [managerId, allScores])

  if (!isOpen || !mounted) return null

  const toggleExpand = (gwId: number) => {
    setExpandedGw(prev => prev === gwId ? null : gwId)
  }

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-xs transition-opacity duration-150 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl md:max-w-3xl lg:max-w-4xl bg-white dark:bg-neutral-950 border border-slate-200 dark:border-white/10 rounded-2xl sm:rounded-[2rem] shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden text-slate-800 dark:text-slate-100 animate-in zoom-in-95 duration-150 transform-gpu will-change-transform"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header with Close Button pinned at top */}
        <div className="sticky top-0 z-20 flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-white/5 bg-slate-50/95 dark:bg-neutral-900/95 backdrop-blur-md shrink-0">
          <h2 className="text-xl sm:text-2xl font-heading uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-2.5 sm:gap-3 truncate">
            <div className="relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl overflow-hidden shadow-md shadow-emerald-500/20 shrink-0">
              <Image
                src="/icon.svg"
                alt="PPL Logo"
                width={36}
                height={36}
                className="h-8 w-8 sm:h-9 sm:w-9 object-contain"
                priority
              />
            </div>
            <span className="truncate">{managerName}</span>
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-colors border border-slate-300 dark:border-white/5 cursor-pointer shrink-0 ml-2"
            aria-label="Close report card"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0 overscroll-contain">
          {!stats ? (
            <p className="text-center text-slate-500 py-8 font-bold tracking-widest uppercase text-xs">No historical data found for this manager.</p>
          ) : (
            <div className="space-y-6 sm:space-y-8">
              {/* Stats Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
                <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200/80 dark:border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col items-center justify-center">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 text-center">Total Pts</span>
                  <span className="font-heading text-2xl sm:text-4xl text-emerald-600 dark:text-emerald-400 drop-shadow-md">{stats.totalPoints}</span>
                </div>
                <div className="bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200/80 dark:border-orange-500/20 p-3 sm:p-4 rounded-2xl flex flex-col items-center justify-center">
                  <span className="text-[10px] sm:text-[11px] font-bold text-orange-500 uppercase tracking-widest mb-1 text-center">Active Streak</span>
                  <span className="font-heading text-2xl sm:text-4xl text-orange-600 dark:text-orange-400 drop-shadow-md">
                    {stats.currentStreak > 0 ? `🔥 ${stats.currentStreak}` : '0'}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200/80 dark:border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col items-center justify-center">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 text-center">Best Streak</span>
                  <span className="font-heading text-2xl sm:text-4xl text-slate-700 dark:text-white drop-shadow-md">
                    {stats.bestStreak > 0 ? `🏆 ${stats.bestStreak}` : '0'}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200/80 dark:border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col items-center justify-center">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 text-center">Highest GW</span>
                  <span className="font-heading text-2xl sm:text-4xl text-slate-700 dark:text-white drop-shadow-md">{stats.highestScore}</span>
                </div>
                <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200/80 dark:border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col items-center justify-center col-span-2 sm:col-span-1">
                  <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 text-center">Average</span>
                  <span className="font-heading text-2xl sm:text-4xl text-slate-700 dark:text-white drop-shadow-md">{stats.avgScore}</span>
                </div>
              </div>

              {/* History Table */}
              <div>
                <div className="flex items-center justify-between mb-3 sm:mb-4 px-1">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Gameweek History</h3>
                  {loadingPicks && <span className="text-xs text-indigo-500 font-bold uppercase tracking-widest animate-pulse">Loading picks...</span>}
                </div>
                <div className="glass rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-200/80 dark:border-white/10">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100/50 dark:bg-black/20 border-b border-slate-200/80 dark:border-white/10">
                        <tr>
                          <th className="px-2 py-3.5 text-center"></th>
                          <th className="px-3 sm:px-4 py-3.5 text-center">GW</th>
                          <th className="px-3 sm:px-4 py-3.5 text-center">Scores</th>
                          <th className="px-3 sm:px-4 py-3.5 text-center">Streak Pick</th>
                          <th className="px-3 sm:px-4 py-3.5 text-center">F4</th>
                          <th className="px-3 sm:px-4 py-3.5 text-center text-emerald-500 font-black">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                        {stats.history.map((record) => {
                          const gwId = record.gameweek_id
                          const isExpanded = expandedGw === gwId
                          const gwPicks = picks?.[gwId]
                          const hasPicksData = !!gwPicks
                          const effectiveGwTotal = (record.score_points || 0) + (record.team_points || 0) + (record.fantastic_four_points || 0) + (record.bonus_points || 0)

                          return (
                            <React.Fragment key={gwId}>
                              <tr
                                onClick={() => { if (hasPicksData) toggleExpand(gwId) }}
                                className={`transition-colors duration-150 ${hasPicksData ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5' : 'opacity-50 grayscale'}`}
                              >
                                <td className="px-2 py-3 text-center text-slate-400">
                                  {hasPicksData ? (
                                    <span className="inline-block text-[11px] font-bold text-slate-500 dark:text-slate-400">{isExpanded ? '▲' : '▼'}</span>
                                  ) : (
                                    <span className="text-[10px]" title="Picks hidden until deadline passes">🔒</span>
                                  )}
                                </td>
                                <td className="px-3 sm:px-4 py-3 font-heading text-lg sm:text-xl text-slate-700 dark:text-slate-300 text-center">{gwId}</td>
                                <td className="px-3 sm:px-4 py-3 text-slate-600 dark:text-slate-400 font-bold text-center">{record.score_points}</td>
                                <td className="px-3 sm:px-4 py-3 text-center font-bold">
                                  {record.team_points > 0 ? (
                                    <span className="text-orange-500 font-black flex items-center justify-center gap-0.5">
                                      <span>🔥</span> +{record.team_points}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 dark:text-slate-400">0</span>
                                  )}
                                </td>
                                <td className="px-3 sm:px-4 py-3 text-slate-600 dark:text-slate-400 font-bold text-center">{record.fantastic_four_points}</td>
                                <td className="px-3 sm:px-4 py-3 font-heading text-xl sm:text-2xl text-emerald-600 dark:text-emerald-400 drop-shadow-sm text-center">{effectiveGwTotal}</td>
                              </tr>
                              {isExpanded && gwPicks && (
                                <tr className="bg-slate-50/80 dark:bg-black/40">
                                  <td colSpan={6} className="p-4 sm:p-6 border-t border-slate-200/60 dark:border-white/5">
                                    {/* Responsive 2-Column Desktop Grid for Ample Breathing Room */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                                      
                                      {/* Left Column: Score Predictions */}
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between pb-1 border-b border-slate-200/60 dark:border-white/5">
                                          <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                            <span>🎯</span> Score Predictions
                                          </h4>
                                          <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">{record.score_points} pts total</span>
                                        </div>
                                        {gwPicks.scorePicks && gwPicks.scorePicks.length > 0 ? (
                                          <div className="space-y-2">
                                            {gwPicks.scorePicks.map((sp: any) => (
                                              <div key={sp.id || sp.fixture_id} className="flex items-center justify-between text-xs bg-white dark:bg-neutral-900 px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-white/5 shadow-2xs">
                                                <div className="flex items-center justify-center gap-1 sm:gap-2 flex-1 min-w-0">
                                                  <span className="w-12 sm:w-14 text-right font-bold text-slate-800 dark:text-slate-200 shrink-0 uppercase tracking-wide">{sp.home_team || 'Home'}</span>
                                                  <span className="font-heading text-sm sm:text-base px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 text-center font-bold tracking-tight">{sp.predicted_home_score} - {sp.predicted_away_score}</span>
                                                  <span className="w-12 sm:w-14 text-left font-bold text-slate-800 dark:text-slate-200 shrink-0 uppercase tracking-wide">{sp.away_team || 'Away'}</span>
                                                </div>
                                                {sp.is_finished ? (
                                                  <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap shrink-0 ml-2 ${
                                                    (sp.points_earned || 0) > 0
                                                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                                      : 'text-slate-400 dark:text-slate-500 bg-slate-500/10 border-slate-500/20'
                                                  }`}>
                                                    {(sp.points_earned || 0) > 0 ? `+${sp.points_earned}` : 0} pts
                                                  </span>
                                                ) : sp.has_started ? (
                                                  <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap shrink-0 ml-2 text-rose-500 bg-rose-500/10 border-rose-500/20 flex items-center gap-1 shadow-2xs">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span> Live
                                                  </span>
                                                ) : (
                                                  <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap shrink-0 ml-2 text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20">
                                                    ⏳ Pending
                                                  </span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 italic py-2">No score predictions</div>
                                        )}
                                      </div>

                                      {/* Right Column: Survivor Streak Pick + Fantastic Four */}
                                      <div className="space-y-6">
                                        {/* Survivor Streak Pick */}
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between pb-1 border-b border-slate-200/60 dark:border-white/5">
                                            <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                              <span>🔥</span> Survivor Streak Pick
                                            </h4>
                                          </div>
                                          {gwPicks.teamPick ? (
                                            <div className="bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-slate-200/80 dark:border-white/5 flex items-center justify-between shadow-2xs">
                                              <span className="font-heading text-base sm:text-lg text-slate-800 dark:text-slate-100 uppercase tracking-wider font-bold truncate mr-2">
                                                {gwPicks.teamPick.team?.name || 'Unknown Team'}
                                              </span>
                                              <div className="shrink-0">
                                                {gwPicks.teamPick.match_result === 'win' && (
                                                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                                                    <span>✅</span> Won (+{gwPicks.teamPick.points_earned || 1} pts)
                                                  </span>
                                                )}
                                                {gwPicks.teamPick.match_result === 'draw' && (
                                                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                                                    <span>🤝</span> Draw (0 pts - Streak Reset)
                                                  </span>
                                                )}
                                                {gwPicks.teamPick.match_result === 'loss' && (
                                                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1 bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/20">
                                                    <span>❌</span> Lost (0 pts - Streak Reset)
                                                  </span>
                                                )}
                                                {!gwPicks.teamPick.match_result && (
                                                  gwPicks.teamPick.has_started ? (
                                                    <span className="text-xs font-bold text-rose-500 flex items-center gap-1 bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/20">
                                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span> Live
                                                    </span>
                                                  ) : (
                                                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                                                      <span>⏳</span> Pending
                                                    </span>
                                                  )
                                                )}
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 italic py-2">No streak pick</div>
                                          )}
                                        </div>

                                        {/* Fantastic Four */}
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between pb-1 border-b border-slate-200/60 dark:border-white/5">
                                            <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                              <span>⭐</span> Fantastic Four
                                            </h4>
                                            <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">{record.fantastic_four_points} pts total</span>
                                          </div>
                                          {gwPicks.f4Picks && gwPicks.f4Picks.length > 0 ? (
                                            <div className="grid grid-cols-1 gap-2">
                                              {gwPicks.f4Picks.map((f4: any) => (
                                                <div key={f4.id || f4.player_id} className="text-xs bg-white dark:bg-neutral-900 px-3.5 py-2 rounded-xl border border-slate-200/80 dark:border-white/5 flex justify-between items-center gap-2 shadow-2xs">
                                                  <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 shrink-0">{f4.position}</span>
                                                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                      {f4.player_name} {f4.team_short_name ? <span className="font-normal text-slate-400">({f4.team_short_name})</span> : ''}
                                                    </span>
                                                  </div>
                                                  {f4.is_finished ? (
                                                    <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap shrink-0 ml-2 ${
                                                      (f4.points_earned || 0) > 0
                                                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                                        : 'text-slate-400 dark:text-slate-500 bg-slate-500/10 border-slate-500/20'
                                                    }`}>
                                                      {(f4.points_earned || 0) > 0 ? `+${f4.points_earned}` : 0} pts
                                                    </span>
                                                  ) : f4.has_started ? (
                                                    <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap shrink-0 ml-2 flex items-center gap-1 ${
                                                      (f4.points_earned || 0) > 0
                                                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                                        : 'text-rose-500 bg-rose-500/10 border-rose-500/20'
                                                    }`}>
                                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span> {(f4.points_earned || 0) > 0 ? `+${f4.points_earned} pts` : 'Live'}
                                                    </span>
                                                  ) : (
                                                    <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap shrink-0 ml-2 text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20">
                                                      ⏳ Pending
                                                    </span>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 italic py-2">No fantastic four picks</div>
                                          )}
                                        </div>
                                      </div>

                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
