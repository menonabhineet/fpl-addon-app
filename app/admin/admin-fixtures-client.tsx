'use client'

import { useState, useEffect } from 'react'
import { saveSelectedFixtures } from '@/lib/actions/admin'
import { getAutoRecommendedFixtureIds } from '@/lib/actions/auto-admin'

export default function AdminFixturesClient({ fixtures, gameweekId, isLocked = false, lockedFixtureIds = [] }: { fixtures: any[], gameweekId: number, isLocked?: boolean, lockedFixtureIds?: number[] }) {
  // Initialize with the fixtures that are already selected
  const [selectedIds, setSelectedIds] = useState<number[]>(
    fixtures.filter(f => f.is_selected).map(f => f.id)
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isAutoSelecting, setIsAutoSelecting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    setSelectedIds(fixtures.filter(f => f.is_selected).map(f => f.id))
    setMessage(null)
  }, [gameweekId, fixtures])

  const maxSelections = Math.min(5, fixtures.length)

  const toggleSelection = (id: number) => {
    if (isLocked || lockedFixtureIds.includes(id)) return
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(pId => pId !== id)
      } else {
        if (prev.length >= maxSelections) {
          return prev
        }
        return [...prev, id]
      }
    })
    setMessage(null) // clear previous messages
  }

  const handleAutoSelect = async () => {
    if (isLocked || isAutoSelecting) return
    setIsAutoSelecting(true)
    setMessage(null)

    try {
      const res = await getAutoRecommendedFixtureIds(gameweekId)
      if (res.success && res.fixtureIds && res.fixtureIds.length > 0) {
        // Merge with any locked fixture IDs that already have user predictions
        const mergedIds = Array.from(new Set([...lockedFixtureIds, ...res.fixtureIds])).slice(0, maxSelections)
        setSelectedIds(mergedIds)
        setMessage({
          type: 'success',
          text: `🪄 Auto-selected ${mergedIds.length} balanced fixtures (3-GW consecutive limit applied). Click 'Save Selection' to confirm.`
        })
      } else {
        setMessage({ type: 'error', text: res.error || 'Failed to auto-select fixtures.' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Auto-selection failed.' })
    } finally {
      setIsAutoSelecting(false)
    }
  }

  const handleSave = async () => {
    if (selectedIds.length !== maxSelections) {
      setMessage({ type: 'error', text: `You must select exactly ${maxSelections} fixture${maxSelections !== 1 ? 's' : ''}.` })
      return
    }

    setIsSaving(true)
    setMessage(null)

    const result = await saveSelectedFixtures(gameweekId, selectedIds)
    
    if (result.success) {
      setMessage({ type: 'success', text: result.message || 'Saved successfully!' })
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to save.' })
    }
    
    setIsSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Selected Fixtures: 
          </span>
          <div className={`px-3 py-1 rounded-lg text-xs font-bold ${selectedIds.length === maxSelections && maxSelections > 0 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
            {selectedIds.length} / {maxSelections}
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {!isLocked && (
            <button
              type="button"
              onClick={handleAutoSelect}
              disabled={isAutoSelecting || isSaving}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold tracking-widest uppercase transition-all glass bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
              title="Automatically pick top 5 balanced marquee matches (max 3 consecutive GW limit per club)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
              <span>{isAutoSelecting ? 'Selecting...' : 'Auto-Select 5'}</span>
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={isLocked || isSaving || selectedIds.length !== maxSelections || maxSelections === 0}
            className="flex-1 sm:flex-none relative group overflow-hidden bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold tracking-widest uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(79,70,229,0.4)]"
          >
            <span className="relative z-10">{isSaving ? 'Saving...' : 'Save Selection'}</span>
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
      </div>

      {isLocked && (
        <div className="p-4 rounded-xl text-xs font-bold uppercase tracking-widest mb-6 border glass bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          Selections are locked because the gameweek deadline has passed.
        </div>
      )}
      {!isLocked && lockedFixtureIds.length > 0 && (
        <div className="p-4 rounded-xl text-xs font-bold uppercase tracking-widest mb-6 border glass bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          Some selected fixtures cannot be changed because players have already started making predictions for them.
        </div>
      )}

      {message && (
        <div className={`p-4 rounded-xl text-xs font-bold uppercase tracking-widest mb-6 border ${message.type === 'success' ? 'glass bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'glass bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        {fixtures.map(match => {
          const isSelected = selectedIds.includes(match.id)
          const formattedTime = new Date(match.kickoff_time).toLocaleDateString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
          })
          
          const isFixtureLocked = isLocked || lockedFixtureIds.includes(match.id)
          
          return (
            <div 
              key={match.id}
              onClick={() => toggleSelection(match.id)}
              className={`group flex items-center justify-between p-4 sm:p-5 rounded-2xl transition-all duration-300 ${isFixtureLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} ${
                isSelected 
                  ? 'glass bg-indigo-500/10 dark:bg-indigo-500/20 border-indigo-500/50 shadow-[0_0_15px_rgba(79,70,229,0.15)] scale-[1.01] z-10' 
                  : `glass bg-white/40 dark:bg-black/20 border-slate-200/50 dark:border-white/5 ${!isFixtureLocked ? 'hover:bg-white/60 dark:hover:bg-white/5 hover:border-slate-300 dark:hover:border-white/20' : ''}`
              }`}
            >
              <div className="flex items-center gap-4 sm:gap-6 w-full">
                {/* Checkbox (visual) */}
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all duration-300 ${
                  isSelected 
                    ? 'bg-indigo-500 border-indigo-400 shadow-[0_0_10px_rgba(79,70,229,0.5)]' 
                    : 'bg-white/50 dark:bg-black/50 border-slate-300 dark:border-slate-600 group-hover:border-indigo-400/50'
                }`}>
                  {isSelected && (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-6 flex-1">
                    <span className={`font-heading text-lg sm:text-xl w-1/2 text-right truncate transition-colors ${isSelected ? 'text-indigo-900 dark:text-indigo-100 drop-shadow-sm' : 'text-slate-700 dark:text-slate-300'}`}>{match.home_team.name}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">VS</span>
                    <span className={`font-heading text-lg sm:text-xl w-1/2 truncate transition-colors ${isSelected ? 'text-indigo-900 dark:text-indigo-100 drop-shadow-sm' : 'text-slate-700 dark:text-slate-300'}`}>{match.away_team.name}</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 text-center sm:text-right w-full sm:w-auto glass px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-white/5">
                    {formattedTime}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
