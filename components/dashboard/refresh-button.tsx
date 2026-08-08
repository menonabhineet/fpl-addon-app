'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RefreshButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const router = useRouter()

  const handleRefresh = async () => {
    if (isLoading) return

    setIsLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/refresh', {
        method: 'POST',
      })
      
      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: 'Live data synced!' })
        // Tell Next.js to re-fetch the server-side data on the page
        router.refresh()
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to refresh.' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' })
    } finally {
      setIsLoading(false)
      
      // Clear success/error message after 3 seconds
      setTimeout(() => {
        setMessage(null)
      }, 3000)
    }
  }

  return (
    <div className="relative group">
      <button
        onClick={handleRefresh}
        disabled={isLoading}
        className={`flex items-center justify-center h-10 w-10 sm:w-auto sm:px-4 rounded-full transition-all duration-300 shadow-sm
          ${isLoading 
            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 cursor-wait' 
            : 'bg-white/40 dark:bg-black/20 backdrop-blur-md border border-slate-200/50 dark:border-white/5 hover:bg-emerald-50 hover:border-emerald-200 dark:hover:bg-emerald-900/20 dark:hover:border-emerald-500/30 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400'
          }`}
        title="Refresh Live Data"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="18" 
          height="18" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className={`transition-transform duration-500 ${isLoading ? 'animate-spin' : 'group-hover:rotate-180'}`}
        >
          <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 1 0 2.81-6.57L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 1 0-2.81 6.57L3 16"/>
        </svg>
        <span className="hidden sm:block ml-2 text-xs font-bold uppercase tracking-wider">
          {isLoading ? 'Syncing...' : 'Refresh'}
        </span>
      </button>

      {/* Tooltip / Status Message */}
      {message && (
        <div className={`absolute top-full mt-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider whitespace-nowrap shadow-lg animate-in fade-in slide-in-from-top-2 z-50 ${
          message.type === 'success' 
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/80 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800' 
            : 'bg-rose-100 text-rose-700 dark:bg-rose-900/80 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  )
}
