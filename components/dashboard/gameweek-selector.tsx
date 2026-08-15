// components/dashboard/gameweek-selector.tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'

export default function GameweekSelector({ allGameweeks, selectedGwId }: { allGameweeks: any[], selectedGwId: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (gwId: number) => {
    setIsOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    params.set('gw', gwId.toString())
    router.push(`${pathname}?${params.toString()}`)
  }

  const selectedGw = allGameweeks.find(gw => gw.id === selectedGwId)

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-transparent text-slate-900 dark:text-white font-bold uppercase tracking-widest text-[10px] sm:text-xs outline-none cursor-pointer"
      >
        <span>{selectedGw ? `Gameweek ${selectedGw.id}` : 'Select GW'}</span>
        <span className="text-slate-500 text-[10px]">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-4 -left-4 w-40 bg-white dark:bg-[#0f0f0f] border border-slate-200 dark:border-white/10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.5)] overflow-hidden z-[100]">
          <div className="max-h-64 overflow-y-auto custom-scrollbar py-2">
            {allGameweeks.map((gw) => (
              <button
                key={gw.id}
                onClick={() => handleSelect(gw.id)}
                className={`w-full text-left px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-slate-100 dark:hover:bg-white/5 ${
                  gw.id === selectedGwId 
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' 
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                Gameweek {gw.id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}