'use client'

import Image from 'next/image'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'

export default function LoginPage() {
  // Initialize the browser client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4 sm:p-6 selection:bg-emerald-500/30">
      {/* Background Ambient Glows */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none gpu-accelerated">
        <div 
          className="absolute -top-[10%] -left-[10%] h-[500px] w-[500px] rounded-full opacity-60 dark:opacity-30 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(225,29,72,0.18) 0%, rgba(225,29,72,0) 70%)' }}
        />
        <div 
          className="absolute -bottom-[10%] -right-[10%] h-[600px] w-[600px] rounded-full opacity-60 dark:opacity-30 pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0) 70%)' }}
        />
      </div>

      {/* Content Container */}
      <div className="relative z-10 w-full max-w-xl space-y-6 my-8">
        {/* Glassmorphic Hero & Login Card */}
        <div className="glass glass-hover rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden shadow-2xl border border-slate-200/50 dark:border-white/10">
          {/* Official Logo */}
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden shadow-xl shadow-emerald-500/20 hover:scale-105 transition-transform">
            <Image
              src="/icon.svg"
              alt="Pro Pundits League Logo"
              width={80}
              height={80}
              className="h-20 w-20 object-contain"
              priority
            />
          </div>

          <h1 className="mb-2 text-3xl sm:text-4xl font-heading uppercase tracking-wide text-slate-900 dark:text-white drop-shadow-sm">
            Pro Pundits League
          </h1>
          <p className="text-xs uppercase font-bold tracking-widest text-emerald-600 dark:text-emerald-400 mb-3">
            Fantasy Premier League Companion Platform
          </p>
          <p className="mb-6 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-md mx-auto">
            Welcome to <strong className="text-slate-900 dark:text-white">Pro Pundits League</strong>. Predict weekly Premier League match scores, build winning Survivor streaks, draft Fantastic Four players, and climb custom mini-league leaderboards with friends.
          </p>

          <button
            onClick={handleGoogleLogin}
            className="group relative flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-slate-900 shadow-md transition-all duration-200 hover:bg-slate-100 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 active:scale-[0.98] border border-slate-200 cursor-pointer"
          >
            <svg className="h-5 w-5" aria-hidden="true" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>
        </div>

        {/* Application Purpose & Features Section */}
        <section aria-labelledby="features-heading" className="space-y-3">
          <h2 id="features-heading" className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 text-center">
            How Pro Pundits League Works
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800 backdrop-blur-sm shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">⚽</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Match Score Predictions
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Submit exact score predictions for 5 curated matchday fixtures each gameweek to earn accuracy points.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800 backdrop-blur-sm shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">🔥</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  Survivor Streak Mode
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Select 1 team to win each gameweek without repeating clubs. Consecutive wins earn escalating streak bonuses.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800 backdrop-blur-sm shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">⭐</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Fantastic Four Drafting
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Pick 4 players (Goalkeeper, Defender, Midfielder, Forward) to score official FPL live points for your team.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800 backdrop-blur-sm shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">🏆</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Private Mini-Leagues
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Create and join private leagues using 6-character invite codes with dedicated gameweek leaderboards.
              </p>
            </div>
          </div>
        </section>

        {/* Footer with Clickable Legal Links */}
        <footer className="text-center space-y-2 pt-2">
          <div className="flex items-center justify-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Link href="/privacy" className="hover:text-emerald-500 underline transition-colors">
              Privacy Policy
            </Link>
            <span>•</span>
            <Link href="/terms" className="hover:text-emerald-500 underline transition-colors">
              Terms of Service
            </Link>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            © {new Date().getFullYear()} Pro Pundits League. All rights reserved.
          </p>
        </footer>
      </div>
    </main>
  )
}