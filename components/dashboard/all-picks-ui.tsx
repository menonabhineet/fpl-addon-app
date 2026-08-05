'use client'

import { useState, useEffect, useMemo } from 'react'
import { getAllPicksForGameweek } from '@/lib/actions/manager-picks'

interface AllPicksUIProps {
  currentGw: any
  fixtures: any[]
  leaderboard: any[]
}

export default function AllPicksUI({ currentGw, fixtures, leaderboard }: AllPicksUIProps) {
  const [picksData, setPicksData] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(true)
  const [deadlinePassed, setDeadlinePassed] = useState(false)

  useEffect(() => {
    if (currentGw?.id) {
      setLoading(true)
      getAllPicksForGameweek(currentGw.id).then(res => {
        if (res.success && res.data) {
          setPicksData(res.data)
          setDeadlinePassed(!!res.deadlinePassed)
        }
        setLoading(false)
      })
    }
  }, [currentGw?.id])

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
                {fixtures.filter(f => f.is_selected).map(f => {
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
              {pundits.map(pundit => {
                const userPicksData = picksData?.[pundit.id]
                const isRevealed = userPicksData?.isRevealed
                const isMe = userPicksData?.isCurrentUser

                return (
                  <tr key={pundit.id} className="hover:bg-black/5 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300 sticky left-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 border-r border-slate-200/50 dark:border-white/5 shadow-[4px_0_12px_rgba(0,0,0,0.05)]">
                      {pundit.name} {isMe && <span className="text-[10px] text-emerald-500 ml-1">• you</span>}
                    </td>
                    {fixtures.filter(f => f.is_selected).map(f => {
                      let display = '—'
                      if (isRevealed && userPicksData?.scorePicks) {
                        const pick = userPicksData.scorePicks.find((sp: any) => sp.fixture_id === f.id)
                        if (pick) {
                          display = `${pick.predicted_home_score}-${pick.predicted_away_score}`
                        }
                      }
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
        {/* TEAM OF THE WEEK */}
        <div className="glass rounded-xl sm:rounded-[2rem] border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-xl flex flex-col h-full">
          <div className="p-4 sm:p-6 md:p-8 bg-black/5 border-b border-slate-200/50 dark:border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-rose-500 rounded-full"></div>
              <h2 className="text-xl sm:text-2xl font-heading uppercase tracking-widest text-slate-800 dark:text-white drop-shadow-md">
                Team of the Week
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
                {pundits.map(pundit => {
                  const userPicksData = picksData?.[pundit.id]
                  const isRevealed = userPicksData?.isRevealed
                  const isMe = userPicksData?.isCurrentUser
                  let display = '—'
                  if (isRevealed && userPicksData?.teamPick) {
                    display = userPicksData.teamPick.team?.short_name || '—'
                  }
                  
                  return (
                    <tr key={pundit.id} className="hover:bg-black/5 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300">
                        {pundit.name} {isMe && <span className="text-[10px] text-emerald-500 ml-1">• you</span>}
                      </td>
                      <td className="px-6 py-4 text-center font-heading text-lg text-slate-600 dark:text-slate-400">
                        {display}
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
                {pundits.map(pundit => {
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
    </div>
  )
}
