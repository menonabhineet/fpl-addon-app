'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { LeagueSummary } from '@/lib/actions/leagues'
import LeagueModal from './league-modal'
import LeagueSettingsDialog from './league-settings-dialog'

interface LeagueSelectorProps {
  userLeagues: LeagueSummary[]
  activeLeague: LeagueSummary | null
  currentUserId?: string
}

export default function LeagueSelector({
  userLeagues,
  activeLeague,
  currentUserId
}: LeagueSelectorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const [isOpen, setIsOpen] = useState(false)
  const [showLeagueModal, setShowLeagueModal] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click only when open
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleSelectLeague = (leagueId: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (leagueId) {
      params.set('league', leagueId)
    } else {
      params.delete('league')
    }
    setIsOpen(false)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <>
      <div className="relative inline-flex items-center justify-center w-full" ref={dropdownRef}>
        <div className="flex items-center justify-center gap-1 w-full">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center justify-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white bg-transparent hover:bg-slate-100/50 dark:hover:bg-white/10 transition-all cursor-pointer shadow-xs max-w-full"
          >
            <span className="text-xs sm:text-sm shrink-0">
              {activeLeague ? '🏆' : '🌐'}
            </span>
            <span className="max-w-[105px] sm:max-w-[150px] truncate">
              {activeLeague ? activeLeague.name : 'Overall'}
            </span>
            <span className="text-[9px] text-slate-400 shrink-0">▾</span>
          </button>

          {/* Quick Settings Icon if viewing a private league */}
          {activeLeague && (
            <button
              type="button"
              onClick={() => setShowSettingsDialog(true)}
              className="p-1 sm:p-1.5 rounded-full text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer text-xs shrink-0"
              title="League Settings & Invite Code"
              aria-label="League Settings"
            >
              ⚙️
            </button>
          )}
        </div>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 mt-2 w-64 rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-[9999] p-2 text-slate-900 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
              Select League
            </div>

            <div className="py-1 space-y-0.5 max-h-56 overflow-y-auto custom-scrollbar">
              {/* Overall Option */}
              <button
                type="button"
                onClick={() => handleSelectLeague(null)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left cursor-pointer ${
                  !activeLeague
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-sm">🌐</span>
                  <span>Overall (Global)</span>
                </div>
                {!activeLeague && <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">✓</span>}
              </button>

              {/* User's Private Leagues */}
              {userLeagues.map((l) => {
                const isSelected = activeLeague?.id === l.id
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => handleSelectLeague(l.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <span className="text-sm">🏆</span>
                      <span className="truncate">{l.name}</span>
                      {l.role === 'admin' && (
                        <span className="text-[10px] text-amber-500 font-bold">👑</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {l.member_count}
                      </span>
                      {isSelected && <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">✓</span>}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Footer Action */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 mt-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  setShowLeagueModal(true)
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
              >
                <span>➕</span> Create / Join League
              </button>
            </div>
          </div>
        )}
      </div>

      {/* League Creation / Join Modal */}
      <LeagueModal
        isOpen={showLeagueModal}
        onClose={() => setShowLeagueModal(false)}
        onLeagueCreatedOrJoined={(newLeague) => {
          handleSelectLeague(newLeague.id)
        }}
      />

      {/* League Settings & Member Management Modal */}
      {activeLeague && (
        <LeagueSettingsDialog
          league={activeLeague}
          currentUserId={currentUserId}
          isOpen={showSettingsDialog}
          onClose={() => setShowSettingsDialog(false)}
          onLeagueUpdated={() => {
            router.refresh()
          }}
        />
      )}
    </>
  )
}
