// components/dashboard/leaderboard-ui.tsx
'use client'
import { useState, useMemo, useEffect } from 'react'
import ManagerReportCard from './manager-report-card'

export default function LeaderboardUI({ allScores, currentGwId }: { allScores: any[], currentGwId: number }) {
  const [filter, setFilter] = useState<'overall' | 'gameweek'>('overall')
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'grand_total', direction: 'desc' })
  const [selectedManager, setSelectedManager] = useState<{ id: string, name: string } | null>(null)
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Reset page when filter, sort, or itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1)
  }, [filter, sortConfig, itemsPerPage])

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc'
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc'
    }
    setSortConfig({ key, direction })
  }

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return null
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓'
  }

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
          total_bonus_points: 0,
          total_penalty_points: 0,
          grand_total: 0,
          previous_grand_total: 0
        })
      }

      const userStat = userMap.get(userId)
      userStat.total_score_points += record.score_points || 0
      userStat.total_team_points += record.team_points || 0
      userStat.total_ff_points += record.fantastic_four_points || 0
      userStat.total_bonus_points += record.bonus_points || 0
      userStat.total_penalty_points += record.penalty_points || 0
      userStat.grand_total += record.total_points || 0

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

    const currentSorted = unsortedData.sort((a, b) => {
      const aValue = a[sortConfig.key]
      const bValue = b[sortConfig.key]

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      return sortConfig.direction === 'asc'
        ? aValue - bValue
        : bValue - aValue
    })

    return currentSorted.map(user => ({
      ...user,
      previous_rank: previousRanks.get(user.user_id)
    }))
  }, [allScores, filter, currentGwId, sortConfig])

  // Pagination Logic
  const totalPages = Math.ceil((leaderboardData?.length || 0) / itemsPerPage)
  const paginatedData = useMemo(() => {
    if (!leaderboardData) return []
    const start = (currentPage - 1) * itemsPerPage
    return leaderboardData.slice(start, start + itemsPerPage)
  }, [leaderboardData, currentPage, itemsPerPage])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 glass rounded-xl p-4 transition-colors">
        <div className="text-sm text-slate-700 dark:text-slate-300">
          🏆 <strong>Global Standings:</strong> Track the cumulative season or drill down into Gameweek {currentGwId}.
        </div>

        {/* The Filter Toggle */}
        <div className="flex bg-white/50 dark:bg-black/20 rounded-lg p-1 border border-slate-200 dark:border-white/10 shadow-inner">
          <button
            onClick={() => setFilter('overall')}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-300 ${filter === 'overall' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            Overall
          </button>
          <button
            onClick={() => setFilter('gameweek')}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-300 ${filter === 'gameweek' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
          >
            GW {currentGwId}
          </button>
        </div>
      </div>

      {!leaderboardData || leaderboardData.length === 0 ? (
        <div className="text-center p-12 glass rounded-3xl">
          <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">No scores found for this filter.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="hidden md:flex items-center justify-end gap-6 px-6 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <span className="mr-auto">Rank / Manager</span>
            <div className="flex gap-4">
              <button onClick={() => handleSort('total_score_points')} className={`transition-colors ${sortConfig.key === 'total_score_points' ? 'text-emerald-500' : 'hover:text-emerald-500'}`}>Scores {getSortIcon('total_score_points')}</button>
              <button onClick={() => handleSort('total_team_points')} className={`transition-colors ${sortConfig.key === 'total_team_points' ? 'text-emerald-500' : 'hover:text-emerald-500'}`}>Surv {getSortIcon('total_team_points')}</button>
              <button onClick={() => handleSort('total_ff_points')} className={`transition-colors ${sortConfig.key === 'total_ff_points' ? 'text-emerald-500' : 'hover:text-emerald-500'}`}>F4 {getSortIcon('total_ff_points')}</button>
              <button onClick={() => handleSort('total_bonus_points')} className={`transition-colors ${sortConfig.key === 'total_bonus_points' ? 'text-emerald-500' : 'hover:text-emerald-500'}`}>Bonus {getSortIcon('total_bonus_points')}</button>
              <button onClick={() => handleSort('total_penalty_points')} className={`transition-colors ${sortConfig.key === 'total_penalty_points' ? 'text-rose-500' : 'hover:text-rose-500'}`}>Pens {getSortIcon('total_penalty_points')}</button>
            </div>
            <button onClick={() => handleSort('grand_total')} className={`pl-8 transition-colors ${sortConfig.key === 'grand_total' ? 'text-emerald-500' : 'text-emerald-500/80 hover:text-emerald-500'}`}>Total {getSortIcon('grand_total')}</button>
          </div>
          
          <div className="md:hidden flex flex-wrap items-center justify-center gap-2 px-2 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <span className="w-full text-center mb-1">Sort by</span>
            <button onClick={() => handleSort('grand_total')} className={`px-2 py-1 rounded-full border ${sortConfig.key === 'grand_total' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500' : 'border-white/10 bg-black/20'}`}>Total {getSortIcon('grand_total')}</button>
            <button onClick={() => handleSort('total_score_points')} className={`px-2 py-1 rounded-full border ${sortConfig.key === 'total_score_points' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500' : 'border-white/10 bg-black/20'}`}>Scores {getSortIcon('total_score_points')}</button>
            <button onClick={() => handleSort('total_team_points')} className={`px-2 py-1 rounded-full border ${sortConfig.key === 'total_team_points' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500' : 'border-white/10 bg-black/20'}`}>Surv {getSortIcon('total_team_points')}</button>
            <button onClick={() => handleSort('total_ff_points')} className={`px-2 py-1 rounded-full border ${sortConfig.key === 'total_ff_points' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500' : 'border-white/10 bg-black/20'}`}>F4 {getSortIcon('total_ff_points')}</button>
            <button onClick={() => handleSort('total_bonus_points')} className={`px-2 py-1 rounded-full border ${sortConfig.key === 'total_bonus_points' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500' : 'border-white/10 bg-black/20'}`}>Bonus {getSortIcon('total_bonus_points')}</button>
            <button onClick={() => handleSort('total_penalty_points')} className={`px-2 py-1 rounded-full border ${sortConfig.key === 'total_penalty_points' ? 'border-rose-500/50 bg-rose-500/10 text-rose-500' : 'border-white/10 bg-black/20'}`}>Pens {getSortIcon('total_penalty_points')}</button>
          </div>
          
          {paginatedData.map((row, index) => {
            const rank = (currentPage - 1) * itemsPerPage + index + 1;
            let rankDisplay = <span className="font-heading text-3xl md:text-4xl text-slate-400 dark:text-slate-600">#{rank}</span>;
            let cardClasses = "glass border border-slate-200/50 dark:border-white/5 opacity-90";
            let glowEffect = null;

            if (rank === 1) {
              rankDisplay = <span className="font-heading text-5xl md:text-6xl text-amber-500 drop-shadow-md">1</span>;
              cardClasses = "glass border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.2)] z-10 scale-[1.01]";
              glowEffect = <div className="absolute inset-0 bg-amber-500/10 blur-xl pointer-events-none" />;
            } else if (rank === 2) {
              rankDisplay = <span className="font-heading text-4xl md:text-5xl text-slate-400 drop-shadow-sm">2</span>;
              cardClasses = "glass border-slate-400/50 shadow-[0_0_20px_rgba(148,163,184,0.15)] z-10";
            } else if (rank === 3) {
              rankDisplay = <span className="font-heading text-4xl md:text-5xl text-orange-400 drop-shadow-sm">3</span>;
              cardClasses = "glass border-orange-400/30 shadow-[0_0_20px_rgba(251,146,60,0.1)] z-10";
            }

            return (
              <div 
                key={row.user_id} 
                className={`relative group flex flex-col md:flex-row items-start md:items-center justify-between p-4 md:p-6 rounded-3xl transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-white/10 ${cardClasses}`}
                onClick={() => setSelectedManager({ id: row.user_id, name: row.manager_name })}
              >
                {glowEffect}
                
                {/* Left side: Rank & Name */}
                <div className="flex items-center gap-6 md:gap-8 w-full md:w-auto mb-4 md:mb-0 relative z-10">
                  <div className="w-12 md:w-16 flex justify-center shrink-0">
                    {rankDisplay}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-heading text-2xl md:text-3xl text-slate-900 dark:text-white uppercase tracking-wide group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {row.manager_name}
                    </span>
                    {filter === 'overall' && row.previous_rank !== undefined && (
                      <div className="text-[10px] md:text-xs font-bold uppercase tracking-wider mt-1">
                        {(row.previous_rank - rank) > 0 && <span className="text-emerald-500">▲ Up {row.previous_rank - rank}</span>}
                        {(row.previous_rank - rank) < 0 && <span className="text-rose-500">▼ Down {Math.abs(row.previous_rank - rank)}</span>}
                        {(row.previous_rank - rank) === 0 && <span className="text-slate-400 dark:text-slate-500">• Maintained</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right side: Stats Grid & Total */}
                <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-2 md:gap-8 relative z-10 mt-2 md:mt-0">
                  <div className="flex flex-wrap gap-1.5 md:gap-4 text-center justify-start flex-1 md:flex-none">
                    <div className="flex flex-col items-center bg-white/50 dark:bg-black/20 rounded-xl px-2 py-1.5 md:px-3 md:py-2 border border-slate-200/50 dark:border-white/5">
                      <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 md:mb-1">Scores</span>
                      <span className="font-heading text-lg md:text-xl">{row.total_score_points}</span>
                    </div>
                    <div className="flex flex-col items-center bg-white/50 dark:bg-black/20 rounded-xl px-2 py-1.5 md:px-3 md:py-2 border border-slate-200/50 dark:border-white/5">
                      <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 md:mb-1">Surv</span>
                      <span className="font-heading text-lg md:text-xl">{row.total_team_points}</span>
                    </div>
                    <div className="flex flex-col items-center bg-white/50 dark:bg-black/20 rounded-xl px-2 py-1.5 md:px-3 md:py-2 border border-slate-200/50 dark:border-white/5">
                      <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 md:mb-1">F4</span>
                      <span className="font-heading text-lg md:text-xl">{row.total_ff_points}</span>
                    </div>
                    <div className="flex flex-col items-center bg-white/50 dark:bg-black/20 rounded-xl px-2 py-1.5 md:px-3 md:py-2 border border-slate-200/50 dark:border-white/5">
                      <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 md:mb-1">Bonus</span>
                      <span className="font-heading text-lg md:text-xl">{row.total_bonus_points}</span>
                    </div>
                    <div className="flex flex-col items-center bg-rose-50/50 dark:bg-rose-900/20 rounded-xl px-2 py-1.5 md:px-3 md:py-2 border border-rose-200/50 dark:border-rose-500/20">
                      <span className="text-[9px] md:text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-0.5 md:mb-1">Pens</span>
                      <span className="font-heading text-lg md:text-xl text-rose-600 dark:text-rose-400">{row.total_penalty_points < 0 ? row.total_penalty_points : '0'}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end shrink-0 pl-2 md:pl-4 border-l border-slate-200 dark:border-white/10">
                    <span className="text-[9px] md:text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Total Pts</span>
                    <span className="font-heading text-4xl sm:text-5xl md:text-6xl text-emerald-600 dark:text-emerald-400 drop-shadow-md leading-none">{row.grand_total}</span>
                  </div>
                </div>
              </div>
            )
          })}
          
          {/* Pagination Controls */}
          {leaderboardData.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 glass p-4 rounded-2xl border border-slate-200/50 dark:border-white/5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Rows per page:</span>
                <select 
                  value={itemsPerPage} 
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="bg-white/50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, leaderboardData.length)} of {leaderboardData.length}
                </span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg glass bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-white hover:dark:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold"
                  >
                    ←
                  </button>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg glass bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-white hover:dark:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold"
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manager Report Card Modal */}
      <ManagerReportCard 
        isOpen={!!selectedManager} 
        onClose={() => setSelectedManager(null)} 
        managerId={selectedManager?.id || ''} 
        managerName={selectedManager?.name || ''}
        allScores={allScores} 
      />
    </div>
  )
}