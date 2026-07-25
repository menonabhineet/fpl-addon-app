'use client'

import { useEffect, useState } from 'react'

interface DeadlineBannerProps {
  deadlineTime: string | null
}

export default function DeadlineBanner({ deadlineTime }: DeadlineBannerProps) {
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [isLocked, setIsLocked] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    if (!deadlineTime) return
    
    const updateCountdown = () => {
      const now = new Date().getTime()
      const deadline = new Date(deadlineTime).getTime()
      const diff = deadline - now

      if (diff <= 0) {
        setIsLocked(true)
        setTimeLeft('Gameweek Locked')
        return
      }

      setIsLocked(false)
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      
      if (days > 0) {
        setTimeLeft(`Locks in: ${days}d ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setTimeLeft(`Locks in: ${hours}h ${minutes}m`)
      } else {
        setTimeLeft(`Locks in: ${minutes}m ${seconds}s`)
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000) // Update every second
    return () => clearInterval(interval)
  }, [deadlineTime])

  if (!mounted || !deadlineTime) return null

  return (
    <div className={`relative inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full text-sm font-bold tracking-wide shadow-sm transition-all duration-300 ${
      isLocked 
        ? 'bg-slate-100 text-slate-600 dark:bg-slate-900/50 dark:text-slate-400 border border-slate-200 dark:border-slate-800' 
        : 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-indigo-600/30 border border-indigo-700 dark:border-indigo-400'
    }`}>
      {isLocked ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      ) : (
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/60 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
        </span>
      )}
      <span className={isLocked ? '' : 'drop-shadow-sm'}>{timeLeft}</span>
    </div>
  )
}
