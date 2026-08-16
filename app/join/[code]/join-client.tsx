'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { joinLeagueByCode } from '@/lib/actions/leagues'
import { toast } from 'sonner'
import Link from 'next/link'

interface JoinClientProps {
  code: string
  league: { id: string; name: string; member_count: number }
  isLoggedIn: boolean
  isAlreadyMember: boolean
}

export default function JoinClient({
  code,
  league,
  isLoggedIn,
  isAlreadyMember
}: JoinClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/join/${code}`,
      },
    })
  }

  const handleJoin = () => {
    startTransition(async () => {
      const res = await joinLeagueByCode(code)
      if (res.success && res.league) {
        toast.success(`Welcome to ${res.league.name}! 🎉`)
        router.push(`/dashboard?league=${res.league.id}`)
      } else {
        toast.error(res.error || 'Failed to join league.')
      }
    })
  }

  if (isAlreadyMember) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 text-3xl shadow-lg shadow-emerald-500/20">
          🏆
        </div>
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-500">Already a Member</span>
          <h1 className="text-2xl sm:text-3xl font-heading uppercase tracking-wide text-slate-900 dark:text-white mt-1">
            {league.name}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            You are already in this league with {league.member_count} {league.member_count === 1 ? 'player' : 'players'}.
          </p>
        </div>

        <Link
          href={`/dashboard?league=${league.id}`}
          className="inline-flex items-center justify-center w-full py-3.5 px-6 rounded-xl font-bold text-sm uppercase tracking-wider bg-emerald-500 hover:bg-emerald-600 text-slate-950 transition-all shadow-lg shadow-emerald-500/20"
        >
          Open League Dashboard →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 text-3xl shadow-lg shadow-emerald-500/20">
        🏆
      </div>

      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">You've been invited to join</span>
        <h1 className="text-2xl sm:text-3xl font-heading uppercase tracking-wide text-slate-900 dark:text-white mt-1">
          {league.name}
        </h1>
        <div className="inline-flex items-center gap-2 px-3 py-1 mt-3 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
          <span>👥 {league.member_count} {league.member_count === 1 ? 'member' : 'members'}</span>
          <span>•</span>
          <span className="font-mono text-emerald-500">Code: {code}</span>
        </div>
      </div>

      {isLoggedIn ? (
        <button
          onClick={handleJoin}
          disabled={isPending}
          className="w-full py-3.5 px-6 rounded-xl font-bold text-sm uppercase tracking-wider bg-emerald-500 hover:bg-emerald-600 text-slate-950 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
        >
          {isPending ? 'Joining League...' : `Join ${league.name} →`}
        </button>
      ) : (
        <div className="space-y-3 pt-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sign in with Google to accept the invitation and enter your predictions.
          </p>
          <button
            onClick={handleGoogleLogin}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-5 py-3.5 text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign in with Google to Join
          </button>
        </div>
      )}
    </div>
  )
}
