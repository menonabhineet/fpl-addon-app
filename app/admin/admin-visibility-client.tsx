'use client'

import { useState } from 'react'
import { toggleGameweekVisibility } from '@/lib/actions/admin-visibility'

export default function AdminVisibilityClient({ 
  gameweekId, 
  initialVisibility, 
  isCurrentOrHistoric 
}: { 
  gameweekId: number, 
  initialVisibility: boolean,
  isCurrentOrHistoric: boolean
}) {
  const [isVisible, setIsVisible] = useState(initialVisibility)
  const [isSaving, setIsSaving] = useState(false)
  
  if (isCurrentOrHistoric) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass bg-emerald-500/10 border border-emerald-500/30">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          Always Visible
        </span>
      </div>
    )
  }

  const handleToggle = async () => {
    setIsSaving(true)
    const newValue = !isVisible
    // Optimistic UI update
    setIsVisible(newValue)
    
    const result = await toggleGameweekVisibility(gameweekId, newValue)
    
    if (!result.success) {
      // Revert on failure
      setIsVisible(!newValue)
      alert('Failed to update visibility: ' + result.error)
    }
    
    setIsSaving(false)
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isSaving}
      className={`relative group flex items-center gap-3 px-4 py-2 rounded-xl border transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed
        ${isVisible 
          ? 'glass bg-indigo-500/10 dark:bg-indigo-500/20 border-indigo-500/50 hover:bg-indigo-500/20 dark:hover:bg-indigo-500/30' 
          : 'glass bg-white/40 dark:bg-black/20 border-slate-200/50 dark:border-white/5 hover:bg-white/60 dark:hover:bg-white/5'
        }`}
    >
      <div className={`relative flex items-center justify-center w-8 h-4 rounded-full transition-colors duration-300 ${isVisible ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
        <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-300 shadow-sm ${isVisible ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-colors ${isVisible ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
        {isVisible ? 'Visible to Players' : 'Hidden from Players'}
      </span>
    </button>
  )
}
