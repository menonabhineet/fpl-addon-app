import { createClient } from '@/lib/supabase/server'
import { getLeaguePreviewByCode, getUserLeagues } from '@/lib/actions/leagues'
import JoinClient from './join-client'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function JoinLeaguePage({
  params
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const cleanCode = (code || '').toUpperCase().trim()

  const [supabase, previewRes] = await Promise.all([
    createClient(),
    getLeaguePreviewByCode(cleanCode)
  ])

  const { data: { user } } = await supabase.auth.getUser()

  let isAlreadyMember = false
  let userLeaguesList = []

  if (user && previewRes.success && previewRes.league) {
    const userLeaguesRes = await getUserLeagues()
    if (userLeaguesRes.success && userLeaguesRes.leagues) {
      userLeaguesList = userLeaguesRes.leagues
      isAlreadyMember = userLeaguesList.some(l => l.id === previewRes.league?.id)
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-6 selection:bg-emerald-500/30">
      {/* Background Ambient Glows */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none gpu-accelerated">
        <div 
          className="absolute -top-[10%] -left-[10%] h-[500px] w-[500px] rounded-full opacity-60 dark:opacity-30 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0) 70%)' }}
        />
        <div 
          className="absolute -bottom-[10%] -right-[10%] h-[600px] w-[600px] rounded-full opacity-60 dark:opacity-30 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0) 70%)' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="glass rounded-3xl p-8 sm:p-10 text-center relative overflow-hidden shadow-2xl border border-slate-200/50 dark:border-white/10">
          {!previewRes.success || !previewRes.league ? (
            <div className="space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 text-3xl">
                ⚠️
              </div>
              <h1 className="text-2xl font-heading uppercase tracking-wide text-slate-900 dark:text-white">
                Invalid League Code
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                The invite code <span className="font-mono font-bold text-rose-400">{cleanCode}</span> was not found or is no longer valid.
              </p>
              <div className="pt-4">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center w-full py-3 px-4 rounded-xl font-bold text-sm uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                >
                  Go to Dashboard
                </Link>
              </div>
            </div>
          ) : (
            <JoinClient
              code={cleanCode}
              league={previewRes.league}
              isLoggedIn={!!user}
              isAlreadyMember={isAlreadyMember}
            />
          )}
        </div>
      </div>
    </main>
  )
}
