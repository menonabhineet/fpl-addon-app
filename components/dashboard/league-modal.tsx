'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createLeague, joinLeagueByCode, LeagueSummary } from '@/lib/actions/leagues'

interface LeagueModalProps {
  isOpen: boolean
  onClose: () => void
  onLeagueCreatedOrJoined?: (league: LeagueSummary) => void
}

export default function LeagueModal({ isOpen, onClose, onLeagueCreatedOrJoined }: LeagueModalProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'join' | 'create'>('join')
  const [joinCode, setJoinCode] = useState('')
  const [leagueName, setLeagueName] = useState('')
  const [isPending, startTransition] = useTransition()
  const [createdLeague, setCreatedLeague] = useState<LeagueSummary | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset modal state whenever it is opened
  useEffect(() => {
    if (isOpen) {
      setCreatedLeague(null)
      setJoinCode('')
      setLeagueName('')
    }
  }, [isOpen])

  const handleClose = () => {
    if (createdLeague) {
      router.push(`/dashboard?league=${createdLeague.id}`)
    }
    setCreatedLeague(null)
    setJoinCode('')
    setLeagueName('')
    onClose()
  }

  if (!isOpen || !mounted) return null

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!joinCode.trim()) {
      toast.error('Please enter an invite code.')
      return
    }

    startTransition(async () => {
      const res = await joinLeagueByCode(joinCode)
      if (res.success && res.league) {
        if (res.alreadyMember) {
          toast.info(`You are already a member of "${res.league.name}"!`)
        } else {
          toast.success(`Successfully joined "${res.league.name}"! 🎉`)
        }
        onLeagueCreatedOrJoined?.(res.league)
        router.push(`/dashboard?league=${res.league.id}`)
        handleClose()
      } else {
        toast.error(res.error || 'Failed to join league. Please check your code.')
      }
    })
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!leagueName.trim()) {
      toast.error('Please enter a league name.')
      return
    }

    startTransition(async () => {
      const res = await createLeague(leagueName)
      if (res.success && res.league) {
        toast.success(`League "${res.league.name}" created! 🏆`)
        setCreatedLeague(res.league)
        onLeagueCreatedOrJoined?.(res.league)
      } else {
        toast.error(res.error || 'Failed to create league.')
      }
    })
  }

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast.success(`Invite code "${code}" copied to clipboard!`)
  }

  const copyInviteLink = (code: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const link = `${origin}/join/${code}`
    navigator.clipboard.writeText(link)
    toast.success('Invite link copied to clipboard!')
  }

  const shareToWhatsApp = (league: LeagueSummary) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const link = `${origin}/join/${league.code}`
    const text = `Join my private Premier League mini-league "${league.name}" on Pro Pundits League!\n\n👉 Join link: ${link}\n🔑 Or enter code: ${league.code}`
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank')
  }

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div 
        className="relative w-full max-w-md bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-100 backdrop-blur-xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
          aria-label="Close dialog"
        >
          ✕
        </button>

        {createdLeague ? (
          /* Post-Creation Success View */
          <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-2">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 text-3xl shadow-lg shadow-emerald-500/20">
              🏆
            </div>
            <div>
              <h2 className="text-2xl font-heading uppercase tracking-wide text-white">League Created!</h2>
              <p className="text-sm text-slate-400 mt-1">
                Share this invite code with your friends to let them join <span className="text-emerald-400 font-semibold">{createdLeague.name}</span>.
              </p>
            </div>

            {/* Invite Code Box */}
            <div className="p-4 bg-slate-800/80 border border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Invite Code</span>
              <span className="text-3xl font-mono font-black tracking-widest text-emerald-400 select-all">
                {createdLeague.code}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => copyInviteCode(createdLeague.code)}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white transition-colors flex items-center justify-center gap-2"
              >
                📋 Copy Code
              </button>
              <button
                type="button"
                onClick={() => copyInviteLink(createdLeague.code)}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white transition-colors flex items-center justify-center gap-2"
              >
                🔗 Copy Link
              </button>
            </div>

            <button
              type="button"
              onClick={() => shareToWhatsApp(createdLeague)}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm uppercase tracking-wider bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/20 cursor-pointer"
            >
              💬 Share on WhatsApp
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm uppercase tracking-wider bg-emerald-500 hover:bg-emerald-600 text-slate-950 transition-colors cursor-pointer"
            >
              Go to League Dashboard →
            </button>
          </div>
        ) : (
          /* Tabs: Join vs Create */
          <div>
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 text-2xl">
                🛡️
              </div>
              <h2 className="text-2xl font-heading uppercase tracking-wide text-white">Private Leagues</h2>
              <p className="text-xs text-slate-400 mt-1">Compete head-to-head with your friend groups</p>
            </div>

            {/* Tab Buttons */}
            <div className="flex bg-slate-800/80 p-1 rounded-xl mb-6 border border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab('join')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === 'join'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Join League
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === 'create'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create League
              </button>
            </div>

            {activeTab === 'join' ? (
              <form onSubmit={handleJoin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    Enter 6-Character Invite Code
                  </label>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. 7X9K2M"
                    maxLength={10}
                    disabled={isPending}
                    className="w-full px-4 py-3 bg-slate-800/90 border border-slate-700 rounded-xl text-white font-mono text-center text-lg uppercase tracking-widest placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Ask your league creator for their 6-character code or invite link.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isPending || !joinCode.trim()}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm uppercase tracking-wider bg-emerald-500 hover:bg-emerald-600 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20 cursor-pointer mt-2"
                >
                  {isPending ? 'Joining League...' : 'Join League'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    League Name
                  </label>
                  <input
                    type="text"
                    value={leagueName}
                    onChange={(e) => setLeagueName(e.target.value)}
                    placeholder="e.g. Office Banter FC, Sunday Squad"
                    maxLength={50}
                    disabled={isPending}
                    className="w-full px-4 py-3 bg-slate-800/90 border border-slate-700 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    You will be the league admin and receive an invite code to share.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isPending || !leagueName.trim()}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm uppercase tracking-wider bg-emerald-500 hover:bg-emerald-600 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20 cursor-pointer mt-2"
                >
                  {isPending ? 'Creating League...' : 'Create League'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
