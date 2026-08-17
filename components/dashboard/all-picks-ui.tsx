'use client'

import { useState, useEffect, useMemo, memo } from 'react'
import { getAllPicksForGameweek } from '@/lib/actions/manager-picks'

interface AllPicksUIProps {
  currentGw: any
  fixtures: any[]
  leaderboard: any[]
}

// In-memory client cache to make tab switching instant
const allPicksCache = new Map<number, { data: Record<string, any>; deadlinePassed: boolean; timestamp: number }>()
const CACHE_TTL_MS = 60 * 1000 // 60 seconds

const AllPicksUI = memo(function AllPicksUI({ currentGw, fixtures, leaderboard }: AllPicksUIProps) {
  const gwId = currentGw?.id
  const cached = gwId ? allPicksCache.get(gwId) : null
  const isCacheValid = cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)

  const [picksData, setPicksData] = useState<Record<string, any> | null>(isCacheValid ? cached.data : null)
  const [loading, setLoading] = useState(!isCacheValid)
  const [deadlinePassed, setDeadlinePassed] = useState(isCacheValid ? cached.deadlinePassed : false)
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Reset page when itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1)
  }, [itemsPerPage])

  useEffect(() => {
    if (!gwId) return

    const cachedEntry = allPicksCache.get(gwId)
    const valid = cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS)

    if (valid) {
      setPicksData(cachedEntry.data)
      setDeadlinePassed(cachedEntry.deadlinePassed)
      setLoading(false)
      return
    }

    setLoading(true)
    getAllPicksForGameweek(gwId).then(res => {
      if (res.success && res.data) {
        allPicksCache.set(gwId, {
          data: res.data,
          deadlinePassed: !!res.deadlinePassed,
          timestamp: Date.now()
        })
        setPicksData(res.data)
        setDeadlinePassed(!!res.deadlinePassed)
      }
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [gwId])

  // Get unique pundits from leaderboard and sort alphabetically
  const pundits = useMemo(() => {
    if (!leaderboard) return []
    const uniqueUsers = new Map<string, string>()
    leaderboard.forEach(record => {
      uniqueUsers.set(record.user_id, record.manager_name)
    })
    
    return Array.from(uniqueUsers.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [leaderboard])

  // Pre-filter selected fixtures
  const selectedFixtures = useMemo(() => {
    return (fixtures || []).filter((f: any) => f.is_selected)
  }, [fixtures])

  // Pagination Logic
  const totalPages = Math.ceil(pundits.length / itemsPerPage)
  const paginatedPundits = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return pundits.slice(start, start + itemsPerPage)
  }, [pundits, currentPage, itemsPerPage])

  // Pre-index user score picks for O(1) table lookup
  const userScorePicksLookup = useMemo(() => {
    if (!picksData) return new Map<string, Map<number, string>>()
    const map = new Map<string, Map<number, string>>()

    for (const [userId, uData] of Object.entries(picksData)) {
      const userMap = new Map<number, string>()
      if (uData?.isRevealed && Array.isArray(uData.scorePicks)) {
        for (const sp of uData.scorePicks) {
          userMap.set(sp.fixture_id, `${sp.predicted_home_score}-${sp.predicted_away_score}`)
        }
      }
      map.set(userId, userMap)
    }
    return map
  }, [picksData])

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-emerald-500 font-bold uppercase tracking-widest animate-pulse">
        Loading Picks...
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      {!deadlinePassed && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 p-4 rounded-xl text-center text-sm font-bold uppercase tracking-widest backdrop-blur-sm">
          ⏳ Other players' picks are hidden until the gameweek deadline passes.
        </div>
      )}

      {/* SCORE PREDICTIONS */}
      <div className="glass rounded-xl sm:rounded-[2rem] border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-xl">
        <div className="p-4 sm:p-6 md:p-8 bg-black/5 border-b border-slate-200/50 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-6 bg-rose-500 rounded-full"></div>
            <h2 className="text-xl sm:text-2xl font-heading uppercase tracking-widest text-slate-800 dark:text-white drop-shadow-md">
              Score Predictions
            </h2>
          </div>
        </div>
        
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-black/10 border-b border-slate-200/50 dark:border-white/5">
              <tr>
                <th className="px-6 py-4 sticky left-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 w-48 border-r border-slate-200/50 dark:border-white/5 shadow-[4px_0_12px_rgba(0,0,0,0.05)]">Pundit</th>
                {selectedFixtures.map(f => {
                  const home = Array.isArray(f.home_team) ? f.home_team[0] : f.home_team
                  const away = Array.isArray(f.away_team) ? f.away_team[0] : f.away_team
                  const header = `${home?.short_name || 'HOME'} v ${away?.short_name || 'AWAY'}`
                  return (
                    <th key={f.id} className="px-6 py-4 text-center">{header}</th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
              {paginatedPundits.map(pundit => {
                const userPicksData = picksData?.[pundit.id]
                const isMe = userPicksData?.isCurrentUser
                const userScores = userScorePicksLookup.get(pundit.id)

                return (
                  <tr key={pundit.id} className="hover:bg-black/5 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300 sticky left-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 border-r border-slate-200/50 dark:border-white/5 shadow-[4px_0_12px_rgba(0,0,0,0.05)]">
                      {pundit.name} {isMe && <span className="text-[10px] text-emerald-500 ml-1">• you</span>}
                    </td>
                    {selectedFixtures.map(f => {
                      const display = userScores?.get(f.id) || '—'
                      return (
                        <td key={f.id} className="px-6 py-4 text-center font-heading text-lg text-slate-600 dark:text-slate-400">
                          {display}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SURVIVOR */}
        <div className="glass rounded-xl sm:rounded-[2rem] border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-xl flex flex-col h-full">
          <div className="p-4 sm:p-6 md:p-8 bg-black/5 border-b border-slate-200/50 dark:border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-rose-500 rounded-full"></div>
              <h2 className="text-xl sm:text-2xl font-heading uppercase tracking-widest text-slate-800 dark:text-white drop-shadow-md">
                Survivor Streak 🔥
              </h2>
            </div>
          </div>
          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-black/10 border-b border-slate-200/50 dark:border-white/5">
                <tr>
                  <th className="px-6 py-4 w-1/2">Pundit</th>
                  <th className="px-6 py-4 text-center">Pick</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                {paginatedPundits.map(pundit => {
                  const userPicksData = picksData?.[pundit.id]
                  const isRevealed = userPicksData?.isRevealed
                  const isMe = userPicksData?.isCurrentUser

                  return (
                    <tr key={pundit.id} className="hover:bg-black/5 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300">
                        {pundit.name} {isMe && <span className="text-[10px] text-emerald-500 ml-1">• you</span>}
                      </td>
                      <td className="px-6 py-4 text-center font-heading text-lg text-slate-600 dark:text-slate-400">
                        {(() => {
                          if (isRevealed) {
                            if (userPicksData?.teamPick) {
                              const teamName = userPicksData.teamPick.team?.short_name || userPicksData.teamPick.team?.name || '—'
                              const result = userPicksData.teamPick.match_result
                              return (
                                <div className="flex items-center justify-center gap-2">
                                  <span>{teamName}</span>
                                  {result === 'win' && (
                                    <span className="text-xs text-emerald-500 font-bold" title="Win (+ points awarded)">✅</span>
                                  )}
                                  {result === 'draw' && (
                                    <span className="text-xs text-amber-500 font-bold" title="Draw (0 points - Streak reset)">🤝</span>
                                  )}
                                  {result === 'loss' && (
                                    <span className="text-xs text-rose-500 font-bold" title="Loss (0 points - Streak reset)">❌</span>
                                  )}
                                </div>
                              )
                            }
                            return <span className="text-slate-400">—</span>
                          }

                          return (
                            <span className="text-slate-400 text-sm font-semibold flex items-center justify-center gap-1">
                              <span>🔒</span> Hidden
                            </span>
                          )
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* FANTASTIC FOUR */}
        <div className="glass rounded-xl sm:rounded-[2rem] border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-xl flex flex-col h-full">
          <div className="p-4 sm:p-6 md:p-8 bg-black/5 border-b border-slate-200/50 dark:border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-rose-500 rounded-full"></div>
              <h2 className="text-xl sm:text-2xl font-heading uppercase tracking-widest text-slate-800 dark:text-white drop-shadow-md">
                Fantastic Four
              </h2>
            </div>
          </div>
          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-black/10 border-b border-slate-200/50 dark:border-white/5">
                <tr>
                  <th className="px-6 py-4 sticky left-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 w-48 border-r border-slate-200/50 dark:border-white/5 shadow-[4px_0_12px_rgba(0,0,0,0.05)]">Pundit</th>
                  <th className="px-6 py-4 text-center">GK</th>
                  <th className="px-6 py-4 text-center">DEF</th>
                  <th className="px-6 py-4 text-center">MID</th>
                  <th className="px-6 py-4 text-center">FWD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                {paginatedPundits.map(pundit => {
                  const userPicksData = picksData?.[pundit.id]
                  const isRevealed = userPicksData?.isRevealed
                  const isMe = userPicksData?.isCurrentUser
                  
                  const getPosDisplay = (posCode: string) => {
                    if (isRevealed && userPicksData?.f4Picks) {
                      const pick = userPicksData.f4Picks.find((p: any) => p.position === posCode)
                      if (pick) return pick.player_name || '—'
                    }
                    return '—'
                  }
                  
                  return (
                    <tr key={pundit.id} className="hover:bg-black/5 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300 sticky left-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 border-r border-slate-200/50 dark:border-white/5 shadow-[4px_0_12px_rgba(0,0,0,0.05)]">
                        {pundit.name} {isMe && <span className="text-[10px] text-emerald-500 ml-1">• you</span>}
                      </td>
                      <td className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400">{getPosDisplay('GK')}</td>
                      <td className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400">{getPosDisplay('DEF')}</td>
                      <td className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400">{getPosDisplay('MID')}</td>
                      <td className="px-6 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-400">{getPosDisplay('FWD')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pagination Controls */}
      {pundits.length > 0 && (
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
              {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, pundits.length)} of {pundits.length}
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
  )
})

export default AllPicksUI
