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
          grand_total: 0
        })
      }

      const userStat = userMap.get(userId)
      userStat.total_score_points += record.score_points
      userStat.total_team_points += record.team_points
      userStat.total_ff_points += record.fantastic_four_points
      userStat.total_penalty_points += record.penalty_points
      userStat.grand_total += record.total_points
    })

    // Convert map to array and sort by grand_total descending
    return Array.from(userMap.values()).sort((a, b) => b.grand_total - a.grand_total)
  }, [allScores, filter, currentGwId])

  if (!leaderboardData || leaderboardData.length === 0) {
    return (
      <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
        <p className="text-slate-500 dark:text-slate-400">No scores found for this filter.</p>
      </div>
    )
  }

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

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
        <div className="overflow-x-auto">
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
                    <td className="px-4 py-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{row.manager_name}</td>
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
      </div>
    </div>
  )
}