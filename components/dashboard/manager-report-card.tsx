import { useMemo, useState, useEffect } from 'react'
import { getManagerPastPicks } from '@/lib/actions/manager-picks'
import React from 'react'

interface ManagerReportCardProps {
  isOpen: boolean
  onClose: () => void
  managerId: string
  managerName: string
  allScores: any[]
}

export default function ManagerReportCard({ isOpen, onClose, managerId, managerName, allScores }: ManagerReportCardProps) {
  const [picks, setPicks] = useState<Record<number, any> | null>(null)
  const [loadingPicks, setLoadingPicks] = useState(false)
  const [expandedGw, setExpandedGw] = useState<number | null>(null)

  useEffect(() => {
    if (isOpen && managerId) {
      setLoadingPicks(true)
      setPicks(null)
      setExpandedGw(null)
      getManagerPastPicks(managerId).then(res => {
        if (res.success && res.data) {
          setPicks(res.data)
        }
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

    userScores.forEach(score => {
      const gwTotal = score.total_points
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
      totalPoints
    }
  }, [managerId, allScores])

  if (!isOpen) return null

  const toggleExpand = (gwId: number) => {
    setExpandedGw(prev => prev === gwId ? null : gwId)
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-white/10 bg-neutral-950/80 flex flex-col max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-black/40 shrink-0">
          <h2 className="text-2xl font-heading uppercase tracking-widest text-white flex items-center gap-3">
            <span className="text-3xl drop-shadow-md">📊</span> {managerName}
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/40 text-white hover:bg-black/60 transition-colors backdrop-blur-md border border-white/5"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {!stats ? (
            <p className="text-center text-slate-500 py-8 font-bold tracking-widest uppercase">No historical data found for this manager.</p>
          ) : (
            <div className="space-y-8">
              {/* Stats Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="glass bg-white/50 dark:bg-black/20 border border-slate-200/50 dark:border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 text-center">Total Pts</span>
                  <span className="font-heading text-4xl text-emerald-600 dark:text-emerald-400 drop-shadow-md">{stats.totalPoints}</span>
                </div>
                <div className="glass bg-white/50 dark:bg-black/20 border border-slate-200/50 dark:border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 text-center">Highest GW</span>
                  <span className="font-heading text-4xl text-slate-700 dark:text-white drop-shadow-md">{stats.highestScore}</span>
                </div>
                <div className="glass bg-white/50 dark:bg-black/20 border border-slate-200/50 dark:border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 text-center">Lowest GW</span>
                  <span className="font-heading text-4xl text-slate-700 dark:text-white drop-shadow-md">{stats.lowestScore}</span>
                </div>
                <div className="glass bg-white/50 dark:bg-black/20 border border-slate-200/50 dark:border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 text-center">Average</span>
                  <span className="font-heading text-4xl text-slate-700 dark:text-white drop-shadow-md">{stats.avgScore}</span>
                </div>
              </div>

              {/* History Table */}
              <div>
                <div className="flex items-center justify-between mb-4 px-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Gameweek History</h3>
                  {loadingPicks && <span className="text-xs text-indigo-500 font-bold uppercase tracking-widest animate-pulse">Loading...</span>}
                </div>
                <div className="glass rounded-3xl overflow-hidden border border-white/10">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-black/20 border-b border-white/10">
                        <tr>
                          <th className="px-2 py-4 text-center"></th>
                          <th className="px-4 py-4 text-center">GW</th>
                          <th className="px-4 py-4 text-center">Scores</th>
                          <th className="px-4 py-4 text-center">Team</th>
                          <th className="px-4 py-4 text-center">F4</th>
                          <th className="px-4 py-4 text-center">Bonus</th>
                          <th className="px-4 py-4 text-center">Pens</th>
                          <th className="px-4 py-4 text-center text-emerald-500">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {stats.history.map((record) => {
                          const gwId = record.gameweek_id
                          const isExpanded = expandedGw === gwId
                          const gwPicks = picks?.[gwId]
                          const hasPicksData = !!gwPicks

                          return (
                            <React.Fragment key={gwId}>
                              <tr
                                onClick={() => { if (hasPicksData) toggleExpand(gwId) }}
                                className={`transition-colors duration-300 ${hasPicksData ? 'cursor-pointer hover:bg-white/10' : 'opacity-50 grayscale'}`}
                              >
                                <td className="px-2 py-3 text-center text-slate-400">
                                  {hasPicksData ? (
                                    isExpanded ? '▲' : '▼'
                                  ) : (
                                    <span className="text-[10px]" title="Picks hidden until deadline passes">🔒</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 font-heading text-xl text-slate-700 dark:text-slate-300 text-center">{gwId}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-bold text-center">{record.score_points}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-bold text-center">{record.team_points}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-bold text-center">{record.fantastic_four_points}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-bold text-center">{record.bonus_points || 0}</td>
                                <td className="px-4 py-3 text-rose-500 font-bold text-center">{record.penalty_points < 0 ? record.penalty_points : '-'}</td>
                                <td className="px-4 py-3 font-heading text-2xl text-emerald-600 dark:text-emerald-400 drop-shadow-sm text-center">{record.total_points}</td>
                              </tr>
                              {isExpanded && gwPicks && (
                                <tr className="bg-black/30">
                                  <td colSpan={8} className="p-6 border-t border-white/5">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                      {/* Score Picks */}
                                      <div>
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Score Predictions</h4>
                                        {gwPicks.scorePicks && gwPicks.scorePicks.length > 0 ? (
                                          <div className="space-y-2">
                                            {gwPicks.scorePicks.map((sp: any) => (
                                              <div key={sp.id} className="flex items-center justify-between text-xs bg-white/50 dark:bg-black/20 px-3 py-2 rounded-xl border border-slate-200/50 dark:border-white/5">
                                                <span className="truncate flex-1 text-right font-semibold text-slate-800 dark:text-slate-200">{sp.home_team || 'Home'}</span>
                                                <span className="font-heading text-lg px-3 text-emerald-500 drop-shadow-sm w-16 text-center">{sp.predicted_home_score} - {sp.predicted_away_score}</span>
                                                <span className="truncate flex-1 text-left font-semibold text-slate-800 dark:text-slate-200">{sp.away_team || 'Away'}</span>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 italic">No score predictions</div>
                                        )}
                                      </div>

                                      {/* Team & F4 */}
                                      <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-8">
                                        <div>
                                          <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Survivor Pick</h4>
                                            {gwPicks.eliminatedGameweekId === gwId && (
                                              <span className="px-2 py-0.5 bg-rose-500/20 text-rose-500 text-[9px] font-bold uppercase tracking-wider rounded border border-rose-500/30">
                                                ❌ Eliminated
                                              </span>
                                            )}
                                          </div>
                                          {gwPicks.teamPick ? (
                                            <div className="bg-white/50 dark:bg-black/20 px-4 py-3 rounded-xl border border-slate-200/50 dark:border-white/5 flex items-center justify-center">
                                              <span className="font-heading text-xl text-slate-800 dark:text-slate-100 uppercase tracking-wider">{gwPicks.teamPick.team?.name || 'Unknown Team'}</span>
                                            </div>
                                          ) : (
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 italic">No survivor pick</div>
                                          )}
                                        </div>

                                        <div>
                                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Fantastic Four</h4>
                                          {gwPicks.f4Picks && gwPicks.f4Picks.length > 0 ? (
                                            <div className="grid grid-cols-1 gap-2">
                                              {gwPicks.f4Picks.map((f4: any) => (
                                                <div key={f4.id} className="text-xs bg-white/50 dark:bg-black/20 px-3 py-2 rounded-xl border border-slate-200/50 dark:border-white/5 flex justify-between items-center">
                                                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                    {f4.player_name} {f4.team_short_name ? <span className="font-normal text-slate-400 ml-1">({f4.team_short_name})</span> : ''}
                                                  </span>
                                                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{f4.position}</span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 italic">No fantastic four picks</div>
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
    </div>
  )
}

