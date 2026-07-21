// components/dashboard/leaderboard-ui.tsx
'use client'
import { useState, useMemo } from 'react'

export default function LeaderboardUI({ allScores, currentGwId }: { allScores: any[], currentGwId: number }) {
  const [filter, setFilter] = useState<'overall' | 'gameweek'>('overall')

  // Dynamically calculate the leaderboard based on the filter
  const leaderboardData = useMemo(() => {
    if (!allScores) return []

    const userMap = new Map()

    allScores.forEach((record: any) => {
      // If filtering by gameweek, skip records that don't match the current dashboard GW
      if (filter === 'gameweek' && record.gameweek_id !== currentGwId) return;

      const userId = record.user_id
      // NEW: We no longer need to parse the profile object, the view hands it to us directly!
      const managerName = record.manager_name || 'Unknown Manager'

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          user_id: userId,
          manager_name: managerName,
          total_score_points: 0,
          total_team_points: 0,
          total_ff_points: 0,
          total_penalty_points: 0,
          grand_total: 0,
          previous_grand_total: 0
        })
      }

      const userStat = userMap.get(userId)
      userStat.total_score_points += record.score_points
      userStat.total_team_points += record.team_points
      userStat.total_ff_points += record.fantastic_four_points
      userStat.total_penalty_points += record.penalty_points
      userStat.grand_total += record.total_points

      if (record.gameweek_id < currentGwId) {
        userStat.previous_grand_total += record.total_points
      }
    })

    const unsortedData = Array.from(userMap.values())

    const previousSorted = [...unsortedData].sort((a, b) => b.previous_grand_total - a.previous_grand_total)
    const previousRanks = new Map()
    previousSorted.forEach((user, index) => {
      previousRanks.set(user.user_id, index + 1)
    })

    const currentSorted = unsortedData.sort((a, b) => b.grand_total - a.grand_total)

    return currentSorted.map(user => ({
      ...user,
      previous_rank: previousRanks.get(user.user_id)
    }))
  }, [allScores, filter, currentGwId])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl p-4 transition-colors">
        <div className="text-sm text-indigo-900 dark:text-indigo-300">
          🏆 <strong>Global Standings:</strong> Track the cumulative season or drill down into Gameweek {currentGwId}.
        </div>

        {/* The Filter Toggle */}
        <div className="flex bg-white dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-700 shadow-sm">
          <button
            onClick={() => setFilter('overall')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${filter === 'overall' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            Overall
          </button>
          <button
            onClick={() => setFilter('gameweek')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${filter === 'gameweek' ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            GW {currentGwId}
          </button>
        </div>
      </div>

      {!leaderboardData || leaderboardData.length === 0 ? (
        <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <p className="text-slate-500 dark:text-slate-400">No scores found for this filter.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 transition-colors">
                <tr>
                  <th scope="col" className="px-4 py-4 text-center font-bold">Rank</th>
                  <th scope="col" className="px-4 py-4 font-bold">Manager</th>
                  <th scope="col" className="px-4 py-4 text-center font-bold">Scores</th>
                  <th scope="col" className="px-4 py-4 text-center font-bold">Team</th>
                  <th scope="col" className="px-4 py-4 text-center font-bold">F4</th>
                  <th scope="col" className="px-4 py-4 text-center font-bold text-red-500 dark:text-red-400">Penalties</th>
                  <th scope="col" className="px-4 py-4 text-center font-bold text-indigo-600 dark:text-indigo-400 text-base">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {leaderboardData.map((row, index) => {
                  const rank = index + 1;
                  let rankBadge = <span className="font-semibold text-slate-500 dark:text-slate-400">{rank}</span>;
                  let rowBg = "hover:bg-slate-50 dark:hover:bg-slate-800/50";

                  if (rank === 1) {
                    rankBadge = <span className="text-xl">🥇</span>;
                    rowBg = "bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20";
                  } else if (rank === 2) {
                    rankBadge = <span className="text-xl">🥈</span>;
                    rowBg = "bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/60";
                  } else if (rank === 3) {
                    rankBadge = <span className="text-xl">🥉</span>;
                    rowBg = "bg-orange-50/30 dark:bg-orange-900/10 hover:bg-orange-50 dark:hover:bg-orange-900/20";
                  }

                  return (
                    <tr key={row.user_id} className={`transition-colors ${rowBg}`}>
                      <td className="px-4 py-4 text-center align-middle">{rankBadge}</td>
                      <td className="px-4 py-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{row.manager_name}</span>
                          {filter === 'overall' && currentGwId > 1 && row.previous_rank !== undefined && (
                            <span className="text-xs font-bold">
                              {(row.previous_rank - rank) > 0 && <span className="text-green-500">▲ +{row.previous_rank - rank}</span>}
                              {(row.previous_rank - rank) < 0 && <span className="text-red-500">▼ {row.previous_rank - rank}</span>}
                              {(row.previous_rank - rank) === 0 && <span className="text-slate-400">•</span>}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-slate-600 dark:text-slate-300">{row.total_score_points}</td>
                      <td className="px-4 py-4 text-center text-slate-600 dark:text-slate-300">{row.total_team_points}</td>
                      <td className="px-4 py-4 text-center text-slate-600 dark:text-slate-300">{row.total_ff_points}</td>
                      <td className="px-4 py-4 text-center text-red-500 dark:text-red-400 font-medium">{row.total_penalty_points < 0 ? row.total_penalty_points : '-'}</td>
                      <td className="px-4 py-4 text-center font-bold text-indigo-700 dark:text-indigo-400 text-base">{row.grand_total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden flex flex-col divide-y divide-slate-100 dark:divide-slate-800/60">
            {leaderboardData.map((row, index) => {
              const rank = index + 1;
              let rankBadge = <span className="text-lg font-bold text-slate-500 dark:text-slate-400 w-6 text-center">{rank}</span>;
              let cardBg = "bg-white dark:bg-slate-900";

              if (rank === 1) {
                rankBadge = <span className="text-2xl w-6 text-center">🥇</span>;
                cardBg = "bg-amber-50/50 dark:bg-amber-900/10";
              } else if (rank === 2) {
                rankBadge = <span className="text-2xl w-6 text-center">🥈</span>;
                cardBg = "bg-slate-50 dark:bg-slate-800/30";
              } else if (rank === 3) {
                rankBadge = <span className="text-2xl w-6 text-center">🥉</span>;
                cardBg = "bg-orange-50/30 dark:bg-orange-900/10";
              }

              return (
                <div key={row.user_id} className={`p-4 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {rankBadge}
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-base">{row.manager_name}</span>
                        {filter === 'overall' && currentGwId > 1 && row.previous_rank !== undefined && (
                          <div className="text-xs font-bold mt-0.5">
                            {(row.previous_rank - rank) > 0 && <span className="text-green-500">▲ Up {row.previous_rank - rank}</span>}
                            {(row.previous_rank - rank) < 0 && <span className="text-red-500">▼ Down {Math.abs(row.previous_rank - rank)}</span>}
                            {(row.previous_rank - rank) === 0 && <span className="text-slate-400">• Maintained rank</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 leading-none">{row.grand_total}</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Total Pts</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex flex-col items-center p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                      <span className="text-[10px] text-slate-500 uppercase font-bold mb-1">Scores</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{row.total_score_points}</span>
                    </div>
                    <div className="flex flex-col items-center p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                      <span className="text-[10px] text-slate-500 uppercase font-bold mb-1">Team</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{row.total_team_points}</span>
                    </div>
                    <div className="flex flex-col items-center p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                      <span className="text-[10px] text-slate-500 uppercase font-bold mb-1">F4</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{row.total_ff_points}</span>
                    </div>
                    <div className="flex flex-col items-center p-2 rounded bg-red-50 dark:bg-red-900/10">
                      <span className="text-[10px] text-red-500 uppercase font-bold mb-1">Pens</span>
                      <span className="text-sm font-semibold text-red-600 dark:text-red-400">{row.total_penalty_points < 0 ? row.total_penalty_points : '0'}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}