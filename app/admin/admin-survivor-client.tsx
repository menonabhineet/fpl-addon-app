'use client'

import { useState } from 'react'
import { toggleSurvivorSkipped } from '@/lib/actions/admin-survivor'
import { toast } from 'sonner'

export default function AdminSurvivorClient({ 
  gameweekId, 
  initialSkipped 
}: { 
  gameweekId: number, 
  initialSkipped: boolean 
}) {
  const [isSkipped, setIsSkipped] = useState(initialSkipped)
  const [isLoading, setIsLoading] = useState(false)

  const handleToggle = async () => {
    setIsLoading(true)
    const newValue = !isSkipped
    const res = await toggleSurvivorSkipped(gameweekId, newValue)
    
    if (res.success) {
      setIsSkipped(newValue)
      toast.success(newValue ? 'Survivor Mode Skipped for this Gameweek' : 'Survivor Mode Enabled for this Gameweek')
    } else {
      toast.error('Failed to update Survivor status: ' + res.error)
    }
    
    setIsLoading(false)
  }

  return (
    <button 
      onClick={handleToggle}
      disabled={isLoading}
      className={`px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold tracking-widest uppercase transition-all flex items-center gap-2 border ${
        isSkipped 
          ? 'glass bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30' 
          : 'glass bg-slate-500/10 hover:bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30'
      }`}
    >
      <span className={`relative flex h-2 w-2`}>
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isSkipped ? 'bg-amber-400' : 'bg-slate-400'}`}></span>
        <span className={`relative inline-flex rounded-full h-2 w-2 ${isSkipped ? 'bg-amber-500' : 'bg-slate-500'}`}></span>
      </span>
      {isSkipped ? 'Survivor: Skipped' : 'Survivor: Active'}
    </button>
  )
}
