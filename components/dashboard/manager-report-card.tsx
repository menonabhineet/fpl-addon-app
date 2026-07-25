import { useMemo } from 'react'

interface ManagerReportCardProps {
  isOpen: boolean
  onClose: () => void
  managerId: string
  managerName: string
  allScores: any[]
}

export default function ManagerReportCard({ isOpen, onClose, managerId, managerName, allScores }: ManagerReportCardProps) {
  const stats = useMemo(() => {
    if (!managerId || !allScores) return null

    const userScores = allScores.filter(s => s.user_id === managerId).sort((a, b) => a.gameweek_id - b.gameweek_id)
    
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all">
      <div 
        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="text-2xl">📊</span> {managerName}&apos;s Report Card
          </h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          {!stats ? (
            <p className="text-center text-slate-500 py-8">No historical data found for this manager.</p>
          ) : (
            <div className="space-y-8">
              {/* Stats Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 p-4 rounded-xl flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1">Total Points</span>
                  <span className="text-2xl font-black text-indigo-700 dark:text-indigo-400">{stats.totalPoints}</span>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 p-4 rounded-xl flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1">Highest GW</span>
                  <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{stats.highestScore}</span>
                </div>
                <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 p-4 rounded-xl flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-rose-500 uppercase tracking-wider mb-1">Lowest GW</span>
                  <span className="text-2xl font-black text-rose-700 dark:text-rose-400">{stats.lowestScore}</span>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 p-4 rounded-xl flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-1">Average</span>
                  <span className="text-2xl font-black text-amber-700 dark:text-amber-400">{stats.avgScore}</span>
                </div>
              </div>

              {/* History Table */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-4 px-1">Gameweek History</h3>
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-3 font-bold text-center">GW</th>
                          <th className="px-4 py-3 font-bold text-center">Scores</th>
                          <th className="px-4 py-3 font-bold text-center">Team</th>
                          <th className="px-4 py-3 font-bold text-center">F4</th>
                          <th className="px-4 py-3 font-bold text-center">Pens</th>
                          <th className="px-4 py-3 font-bold text-center text-indigo-600 dark:text-indigo-400">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {stats.history.map((record) => (
                          <tr key={record.gameweek_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300 text-center">{record.gameweek_id}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-center">{record.score_points}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-center">{record.team_points}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-center">{record.fantastic_four_points}</td>
                            <td className="px-4 py-3 text-red-500 dark:text-red-400 font-medium text-center">{record.penalty_points < 0 ? record.penalty_points : '-'}</td>
                            <td className="px-4 py-3 font-bold text-indigo-700 dark:text-indigo-400 text-center">{record.total_points}</td>
                          </tr>
                        ))}
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
