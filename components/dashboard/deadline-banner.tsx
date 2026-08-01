'use client'

import { useEffect, useState } from 'react'

interface DeadlineBannerProps {
  deadlineTime: string | null
}

export default function DeadlineBanner({ deadlineTime }: DeadlineBannerProps) {
  const [time, setTime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
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
        setTime({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        return
      }

      setIsLocked(false)
      setTime({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000)
      })
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [deadlineTime])

  if (!mounted || !deadlineTime) return null

  if (isLocked) {
    return (
      <div className="inline-flex flex-col items-center justify-center p-6 glass rounded-2xl border-rose-500/30">
        <span className="font-heading text-4xl text-rose-500 drop-shadow-md">GAMEWEEK LOCKED</span>
        <span className="text-slate-400 text-sm font-bold tracking-widest mt-2 uppercase">Predictions are closed</span>
      </div>
    )
  }

  const TimeBlock = ({ value, label }: { value: number, label: string }) => (
    <div className="flex flex-col items-center justify-center">
      <span className="font-heading text-5xl md:text-7xl text-white drop-shadow-2xl">{value.toString().padStart(2, '0')}</span>
      <span className="text-[10px] md:text-xs font-bold text-slate-400 tracking-widest uppercase mt-1 md:mt-2">{label}</span>
    </div>
  )

  const Separator = () => (
    <div className="flex flex-col items-center justify-start pt-2 md:pt-4">
      <span className="font-heading text-4xl md:text-6xl text-rose-500 animate-pulse">:</span>
    </div>
  )

  return (
    <div className="flex flex-col items-center">
      <div className="text-emerald-500 font-bold text-xs tracking-widest uppercase mb-4 drop-shadow-sm">Get your picks in before this</div>
      <div className="flex items-start gap-3 md:gap-6 glass px-8 py-6 rounded-3xl border-white/10 shadow-[0_0_40px_rgba(244,63,94,0.15)] dark:shadow-[0_0_50px_rgba(244,63,94,0.1)]">
        <TimeBlock value={time.days} label="Days" />
        <Separator />
        <TimeBlock value={time.hours} label="Hrs" />
        <Separator />
        <TimeBlock value={time.minutes} label="Min" />
        <Separator />
        <TimeBlock value={time.seconds} label="Sec" />
      </div>
    </div>
  )
}
