'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  LeagueSummary,
  LeagueMemberInfo,
  getLeagueMembers,
  leaveLeague,
  removeLeagueMember,
  deleteLeague
} from '@/lib/actions/leagues'

interface LeagueSettingsDialogProps {
  league: LeagueSummary
  currentUserId?: string
  isOpen: boolean
  onClose: () => void
  onLeagueUpdated?: () => void
}

export default function LeagueSettingsDialog({
  league,
  currentUserId,
  isOpen,
  onClose,
  onLeagueUpdated
}: LeagueSettingsDialogProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [members, setMembers] = useState<LeagueMemberInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<'members' | 'invite'>('members')

  const isAdmin = league.role === 'admin'

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      getLeagueMembers(league.id).then(res => {
        if (res.success && res.members) {
          setMembers(res.members)
        }
        setLoading(false)
      }).catch(() => {
        setLoading(false)
      })
    }
  }, [isOpen, league.id])

  if (!isOpen) return null

  const copyInviteCode = () => {
    navigator.clipboard.writeText(league.code)
    toast.success(`Invite code "${league.code}" copied!`)
  }

  const copyInviteLink = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const link = `${origin}/join/${league.code}`
    navigator.clipboard.writeText(link)
    toast.success('Invite link copied to clipboard!')
  }

  const shareToWhatsApp = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const link = `${origin}/join/${league.code}`
    const text = `Join my private Premier League mini-league "${league.name}" on Pro Pundits League!\n\n👉 Join link: ${link}\n🔑 Or enter code: ${league.code}`
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank')
  }

  const handleLeave = () => {
    if (!confirm(`Are you sure you want to leave "${league.name}"?`)) return

    startTransition(async () => {
      const res = await leaveLeague(league.id)
      if (res.success) {
        toast.success(`Left "${league.name}".`)
        onLeagueUpdated?.()
        router.push('/dashboard')
        onClose()
      } else {
        toast.error(res.error || 'Failed to leave league.')
      }
    })
  }

  const handleRemoveMember = (member: LeagueMemberInfo) => {
    if (!confirm(`Remove ${member.manager_name} from "${league.name}"?`)) return

    startTransition(async () => {
      const res = await removeLeagueMember(league.id, member.user_id)
      if (res.success) {
        toast.success(`Removed ${member.manager_name}.`)
        setMembers(prev => prev.filter(m => m.user_id !== member.user_id))
        onLeagueUpdated?.()
      } else {
        toast.error(res.error || 'Failed to remove member.')
      }
    })
  }

  const handleDeleteLeague = () => {
    if (!confirm(`Are you sure you want to permanently delete "${league.name}"? This cannot be undone.`)) return

    startTransition(async () => {
      const res = await deleteLeague(league.id)
      if (res.success) {
        toast.success(`League "${league.name}" deleted.`)
        onLeagueUpdated?.()
        router.push('/dashboard')
        onClose()
      } else {
        toast.error(res.error || 'Failed to delete league.')
      }
    })
  }

  if (!isOpen || !mounted) return null

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-lg bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-100 backdrop-blur-xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 text-2xl shadow-md">
              🏆
            </div>
            <div>
              <h2 className="text-xl font-heading uppercase tracking-wide text-white">{league.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                  {isAdmin ? '👑 League Admin' : '👤 Member'}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-[11px] text-slate-400">
                  {members.length || league.member_count} {members.length === 1 ? 'member' : 'members'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-slate-800/80 p-1 rounded-xl mb-4 border border-slate-700 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'members'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Members ({members.length || league.member_count})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('invite')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'invite'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Invite Friends
          </button>
        </div>

        {/* Body Content */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4">
          {activeTab === 'members' ? (
            <div>
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                  Loading league members...
                </div>
              ) : members.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No members found.
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => {
                    const isMe = m.user_id === currentUserId
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-200">
                            {m.manager_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white">
                                {m.manager_name}
                              </span>
                              {isMe && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                                  YOU
                                </span>
                              )}
                              {m.role === 'admin' && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                  ADMIN
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500">
                              Joined {new Date(m.joined_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        {/* Admin Action: Kick Member */}
                        {isAdmin && !isMe && (
                          <button
                            onClick={() => handleRemoveMember(m)}
                            disabled={isPending}
                            className="text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Invite Tab */
            <div className="space-y-5">
              <div className="p-4 bg-slate-800/80 border border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">League Invite Code</span>
                <span className="text-3xl font-mono font-black tracking-widest text-emerald-400 select-all">
                  {league.code}
                </span>
                <span className="text-[11px] text-slate-400">Friends can join with this code or the link below</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={copyInviteCode}
                  className="py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  📋 Copy Code
                </button>
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="py-2.5 px-3 rounded-xl font-bold text-xs uppercase tracking-wider bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  🔗 Copy Link
                </button>
              </div>

              <button
                type="button"
                onClick={shareToWhatsApp}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm uppercase tracking-wider bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/20 cursor-pointer"
              >
                💬 Share on WhatsApp
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-800 pt-4 mt-4 flex items-center justify-between shrink-0">
          {isAdmin ? (
            <button
              type="button"
              onClick={handleDeleteLeague}
              disabled={isPending}
              className="text-xs font-bold uppercase tracking-wider text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 px-3 py-2 rounded-xl transition-colors cursor-pointer"
            >
              Delete League
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLeave}
              disabled={isPending}
              className="text-xs font-bold uppercase tracking-wider text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 px-3 py-2 rounded-xl transition-colors cursor-pointer"
            >
              Leave League
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
