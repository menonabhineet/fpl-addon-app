// components/dashboard/leaderboard-ui.tsx
'use client'
import { useState, useMemo, useEffect, memo } from 'react'
import ManagerReportCard from './manager-report-card'
import { LeagueSummary } from '@/lib/actions/leagues'
import LeagueSettingsDialog from './league-settings-dialog'

interface LeaderboardUIProps {
  allScores: any[]
  currentGwId: number
  currentUserId?: string
  activeLeague?: LeagueSummary | null
}

const LeaderboardUI = memo(function LeaderboardUI({ allScores, currentGwId, currentUserId, activeLeague }: LeaderboardUIProps) {
  const [filter, setFilter] = useState<'overall' | 'gameweek'>('overall')
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'grand_total', direction: 'desc' })
  const [selectedManager, setSelectedManager] = useState<{ id: string, name: string } | null>(null)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  
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
      const managerName = record.manager_name || 'Unknown Manager'
      const fullName = record.full_name || null
      const nickname = record.nickname || null

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          user_id: userId,
          manager_name: managerName,
          full_name: fullName,
          nickname: nickname,
          total_score_points: 0,
          total_team_points: 0,
          total_ff_points: 0,
          total_penalty_points: 0,
          grand_total: 0,
          previous_grand_total: 0
        })
      }

      const userStat = userMap.get(userId)
      userStat.total_score_points += record.score_points || 0
      userStat.total_team_points += record.team_points || 0
      userStat.total_ff_points += record.fantastic_four_points || 0
      userStat.total_penalty_points += record.penalty_points || 0
      const gwPoints = (record.score_points || 0) + (record.team_points || 0) + (record.fantastic_four_points || 0) + (record.penalty_points || 0)
      userStat.grand_total += gwPoints

      if (record.gameweek_id < currentGwId) {
        userStat.previous_grand_total += gwPoints
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

  // Badges & Banter calculations (Rocket Man, Free Fall, Nostradamus)
  const badgeStats = useMemo(() => {
    if (!leaderboardData || leaderboardData.length === 0) {
      return {
        rocketManUserIds: new Set<string>(),
        freeFallUserIds: new Set<string>(),
        nostradamusUserIds: new Set<string>(),
        maxClimb: 0,
        maxDrop: 0,
        maxScorePoints: 0
      }
    }

    // Natural ranking is based on grand_total descending
    const naturalRanking = [...leaderboardData].sort((a, b) => b.grand_total - a.grand_total)
    const naturalRanks = new Map<string, number>()
    naturalRanking.forEach((u, idx) => {
      naturalRanks.set(u.user_id, idx + 1)
    })

    let maxClimb = 0
    let maxDrop = 0

    // Only compute rank movement when previous history exists and viewing Overall
    const hasPreviousHistory = leaderboardData.some(u => (u.previous_grand_total || 0) > 0)

    if (hasPreviousHistory && filter === 'overall') {
      leaderboardData.forEach(u => {
        const curRank = naturalRanks.get(u.user_id) || 1
        if (u.previous_rank !== undefined && u.previous_rank !== null) {
          const delta = u.previous_rank - curRank
          if (delta > maxClimb) maxClimb = delta
          if (delta < maxDrop) maxDrop = delta
        }
      })
    }

    const rocketManUserIds = new Set<string>()
    if (maxClimb >= 1) {
      leaderboardData.forEach(u => {
        const curRank = naturalRanks.get(u.user_id) || 1
        if (u.previous_rank !== undefined && (u.previous_rank - curRank) === maxClimb) {
          rocketManUserIds.add(u.user_id)
        }
      })
    }

    const freeFallUserIds = new Set<string>()
    if (maxDrop <= -1) {
      leaderboardData.forEach(u => {
        const curRank = naturalRanks.get(u.user_id) || 1
        if (u.previous_rank !== undefined && (u.previous_rank - curRank) === maxDrop) {
          freeFallUserIds.add(u.user_id)
        }
      })
    }

    // Nostradamus: Manager(s) with the most points from score predictions
    let maxScorePoints = 0
    leaderboardData.forEach(u => {
      if ((u.total_score_points || 0) > maxScorePoints) {
        maxScorePoints = u.total_score_points
      }
    })

    const nostradamusUserIds = new Set<string>()
    if (maxScorePoints > 0) {
      leaderboardData.forEach(u => {
        if ((u.total_score_points || 0) === maxScorePoints) {
          nostradamusUserIds.add(u.user_id)
        }
      })
    }

    return {
      rocketManUserIds,
      freeFallUserIds,
      nostradamusUserIds,
      maxClimb,
      maxDrop,
      maxScorePoints
    }
  }, [leaderboardData, filter])

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
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <span>{activeLeague ? '🏆' : '🌐'}</span>
          <strong>{activeLeague ? activeLeague.name : 'Global Standings'}:</strong>
          <span className="text-slate-500 dark:text-slate-400">
            {activeLeague ? `(${leaderboardData.length} ${leaderboardData.length === 1 ? 'manager' : 'managers'})` : `Track cumulative season or GW ${currentGwId}.`}
          </span>
          {activeLeague && (
            <button
              onClick={() => setShowSettingsDialog(true)}
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded-md transition-colors cursor-pointer ml-1"
            >
              <span>⚙️</span> Invite & Info
            </button>
          )}
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
            <button onClick={() => handleSort('total_penalty_points')} className={`px-2 py-1 rounded-full border ${sortConfig.key === 'total_penalty_points' ? 'border-rose-500/50 bg-rose-500/10 text-rose-500' : 'border-white/10 bg-black/20'}`}>Pens {getSortIcon('total_penalty_points')}</button>
          </div>
          
          {paginatedData.map((row, index) => {
            const rank = (currentPage - 1) * itemsPerPage + index + 1;
            const isCurrentUser = Boolean(currentUserId && row.user_id === currentUserId);
            const isRocketMan = badgeStats.rocketManUserIds.has(row.user_id);
            const isFreeFall = badgeStats.freeFallUserIds.has(row.user_id);
            const isNostradamus = badgeStats.nostradamusUserIds.has(row.user_id);

            let rankDisplay = <span className="font-heading text-3xl md:text-4xl text-slate-400 dark:text-slate-600">#{rank}</span>;
            let cardClasses = isCurrentUser
              ? "glass border-emerald-500/70 ring-2 ring-emerald-500/80 dark:ring-emerald-400/80 bg-emerald-500/10 dark:bg-emerald-500/15 shadow-[0_0_30px_rgba(16,185,129,0.25)] z-20"
              : "glass border border-slate-200/50 dark:border-white/5 opacity-90";
            let glowEffect = isCurrentUser ? <div className="absolute inset-0 bg-emerald-500/15 blur-xl pointer-events-none rounded-3xl" /> : null;

            if (rank === 1) {
              rankDisplay = <span className="font-heading text-5xl md:text-6xl text-amber-500 drop-shadow-md">1</span>;
              cardClasses = isCurrentUser 
                ? "glass border-amber-500 ring-2 ring-emerald-400 shadow-[0_0_35px_rgba(245,158,11,0.3)] z-20 scale-[1.01] bg-amber-500/10"
                : "glass border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.2)] z-10 scale-[1.01]";
              glowEffect = <div className="absolute inset-0 bg-amber-500/10 blur-xl pointer-events-none" />;
            } else if (rank === 2) {
              rankDisplay = <span className="font-heading text-4xl md:text-5xl text-slate-400 drop-shadow-sm">2</span>;
              cardClasses = isCurrentUser
                ? "glass border-slate-400 ring-2 ring-emerald-400 shadow-[0_0_25px_rgba(148,163,184,0.25)] z-20 bg-slate-400/10"
                : "glass border-slate-400/50 shadow-[0_0_20px_rgba(148,163,184,0.15)] z-10";
            } else if (rank === 3) {
              rankDisplay = <span className="font-heading text-4xl md:text-5xl text-orange-400 drop-shadow-sm">3</span>;
              cardClasses = isCurrentUser
                ? "glass border-orange-400 ring-2 ring-emerald-400 shadow-[0_0_25px_rgba(251,146,60,0.2)] z-20 bg-orange-400/10"
                : "glass border-orange-400/30 shadow-[0_0_20px_rgba(251,146,60,0.1)] z-10";
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-heading text-2xl md:text-3xl uppercase tracking-wide transition-colors ${isCurrentUser ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400'}`}>
                        {row.manager_name}
                      </span>
                      {isCurrentUser && (
                        <span className="px-2.5 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-wider bg-emerald-500 text-white rounded-full shadow-md shadow-emerald-500/30 flex items-center gap-1">
                          <span>👤</span> You
                        </span>
                      )}
                      {isRocketMan && (
                        <span 
                          className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.25)] flex items-center gap-1 animate-in zoom-in duration-300"
                          title={`Biggest rank climber this week (+${badgeStats.maxClimb} spots)`}
                        >
                          <span>🚀</span> Rocket Man (+{badgeStats.maxClimb})
                        </span>
                      )}
                      {isFreeFall && (
                        <span 
                          className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-full shadow-[0_0_12px_rgba(244,63,94,0.25)] flex items-center gap-1 animate-in zoom-in duration-300"
                          title={`Biggest rank drop this week (${badgeStats.maxDrop} spots)`}
                        >
                          <span>📉</span> Free Fall ({badgeStats.maxDrop})
                        </span>
                      )}
                      {isNostradamus && (
                        <span 
                          className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 rounded-full shadow-[0_0_12px_rgba(168,85,247,0.25)] flex items-center gap-1 animate-in zoom-in duration-300"
                          title={`Top score predictor (${row.total_score_points} pts from score picks)`}
                        >
                          <span>🔮</span> Nostradamus
                        </span>
                      )}
                    </div>
                    {/* Original name shown in small letters underneath custom nickname */}
                    {row.full_name && row.nickname && row.full_name.trim().toLowerCase() !== row.nickname.trim().toLowerCase() && (
                      <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">
                        {row.full_name}
                      </span>
                    )}
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

      {/* League Settings Dialog */}
      {activeLeague && (
        <LeagueSettingsDialog
          league={activeLeague}
          currentUserId={currentUserId}
          isOpen={showSettingsDialog}
          onClose={() => setShowSettingsDialog(false)}
          onLeagueUpdated={() => {
            window.location.reload()
          }}
        />
      )}
    </div>
  )
})

export default LeaderboardUI