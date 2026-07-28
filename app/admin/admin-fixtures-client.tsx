'use client'

import { useState, useEffect } from 'react'
import { saveSelectedFixtures } from '@/lib/actions/admin'

export default function AdminFixturesClient({ fixtures, gameweekId }: { fixtures: any[], gameweekId: number }) {
  // Initialize with the fixtures that are already selected
  const [selectedIds, setSelectedIds] = useState<number[]>(
    fixtures.filter(f => f.is_selected).map(f => f.id)
  )
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    setSelectedIds(fixtures.filter(f => f.is_selected).map(f => f.id))
    setMessage(null)
  }, [gameweekId, fixtures])

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(pId => pId !== id)
      } else {
        if (prev.length >= 5) {
          // Optionally, don't allow selecting more than 5
          return prev
        }
        return [...prev, id]
      }
    })
    setMessage(null) // clear previous messages
  }

  const handleSave = async () => {
    if (selectedIds.length !== 5) {
      setMessage({ type: 'error', text: 'You must select exactly 5 fixtures.' })
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
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Selected: <strong className={selectedIds.length === 5 ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-slate-100'}>{selectedIds.length} / 5</strong>
        </span>
        
        <button
          onClick={handleSave}
          disabled={isSaving || selectedIds.length !== 5}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save Selection'}
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        {fixtures.map(match => {
          const isSelected = selectedIds.includes(match.id)
          const formattedTime = new Date(match.kickoff_time).toLocaleDateString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
          })
          
          return (
            <div 
              key={match.id}
              onClick={() => toggleSelection(match.id)}
              className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                isSelected 
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 dark:border-indigo-500/50' 
                  : 'border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500/30'
              }`}
            >
              <div className="flex items-center gap-4 w-full">
                {/* Checkbox (visual) */}
                <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                  isSelected 
                    ? 'bg-indigo-600 border-indigo-600' 
                    : 'border-slate-300 dark:border-slate-600'
                }`}>
                  {isSelected && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-4 flex-1">
                    <span className="font-semibold w-1/2 text-right truncate">{match.home_team.name}</span>
                    <span className="text-slate-400 font-bold text-xs">VS</span>
                    <span className="font-semibold w-1/2 truncate">{match.away_team.name}</span>
                  </div>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 text-center sm:text-right w-full sm:w-auto">
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
