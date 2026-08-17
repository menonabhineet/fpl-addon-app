import { Suspense } from 'react'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminFixturesClient from './admin-fixtures-client'
import AdminVisibilityClient from './admin-visibility-client'
import AdminSurvivorClient from './admin-survivor-client'
import AdminBonusClient from './admin-bonus-client'
import GameweekSelector from '@/components/dashboard/gameweek-selector'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ gw?: string }> 
}) {
  const resolvedParams = await searchParams
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) redirect('/')
  
  // Verify admin access (case-insensitive)
  const adminEmails = process.env.ADMIN_EMAIL?.split(',').map(e => e.trim().toLowerCase()) || []
  if (!user.email || !adminEmails.includes(user.email.toLowerCase())) {
    redirect('/dashboard') // Redirect non-admins to their dashboard
  }

  // Determine which Gameweek to view
  const { data: allGameweeks } = await supabase.from('gameweeks').select('*').order('id', { ascending: true }).range(0, 9999)
  const currentGwObj = allGameweeks?.find(gw => gw.is_current) || allGameweeks?.[0]
  
  const currentGwId = currentGwObj?.id || 1
  const maxAllowedGwId = allGameweeks && allGameweeks.length > 0 
    ? allGameweeks[allGameweeks.length - 1].id 
    : currentGwId + 3
  
  const requestedGwId = resolvedParams.gw ? parseInt(resolvedParams.gw) : currentGwId
  const selectedGwId = Math.min(Math.max(1, requestedGwId), maxAllowedGwId)
  const selectedGw = allGameweeks?.find(gw => gw.id === selectedGwId)

  // Fetch fixtures for this gameweek
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, kickoff_time, is_selected, home_team:home_team_id (id, name, short_name, code), away_team:away_team_id (id, name, short_name, code)')
    .eq('gameweek_id', selectedGwId)
    .order('kickoff_time', { ascending: true })

  // Check if deadline passed
  const now = new Date().toISOString()
  const deadlinePassed = !!selectedGw && selectedGw.deadline_time <= now

  // Find fixtures that already have predictions (cannot be unselected/changed)
  const { data: predictions } = await supabase
    .from('score_predictions')
    .select('fixture_id')
    .in('fixture_id', fixtures?.map(f => f.id) || [])

  // Fetch bonus question for this gameweek
  const { data: bonusQuestion } = await supabase
    .from('bonus_questions')
    .select('*')
    .eq('gameweek', selectedGwId)
    .maybeSingle()

  const lockedFixtureIds = Array.from(new Set(predictions?.map(p => p.fixture_id) || []))
  const isLocked = deadlinePassed

  return (
    <div className="min-h-screen bg-background text-slate-900 dark:text-slate-100 pb-20 transition-colors duration-300 relative overflow-hidden">
      {/* Immersive Background Glows */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-indigo-600/10 blur-[200px] mix-blend-multiply dark:mix-blend-screen opacity-70" />
        <div className="absolute bottom-0 left-0 h-[800px] w-[800px] rounded-full bg-rose-600/10 blur-[200px] mix-blend-multiply dark:mix-blend-screen opacity-70" />
      </div>

      <header className="relative z-50 flex flex-col sm:flex-row items-center justify-between px-6 sm:px-12 py-6 w-full max-w-7xl mx-auto gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden shadow-lg shadow-indigo-500/30 group hover:scale-105 transition-transform">
            <Image
              src="/icon.svg"
              alt="PPL Logo"
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
              priority
            />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-heading uppercase tracking-widest text-slate-900 dark:text-white drop-shadow-md">
              PPL
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 rounded-md">
              Admin
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4 glass px-4 py-2 rounded-full">
          {allGameweeks && (
            <Suspense fallback={<span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Gameweek {selectedGwId}</span>}>
              <GameweekSelector allGameweeks={allGameweeks} selectedGwId={selectedGwId} />
            </Suspense>
          )}
          <div className="w-px h-6 bg-slate-300 dark:bg-slate-700"></div>
          <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-widest text-slate-500">{user.email}</span>
          <div className="hidden sm:block w-px h-6 bg-slate-300 dark:bg-slate-700"></div>
          <Link href="/dashboard" className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-indigo-500 transition-colors">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl p-4 sm:p-6 mt-4">
        <div className="glass rounded-[2rem] shadow-2xl border border-white/10 overflow-hidden transition-all duration-300 relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-white/10 dark:from-black/40 dark:to-black/10 pointer-events-none" />
          
          <div className="relative p-6 sm:p-8 border-b border-slate-200/50 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-heading uppercase tracking-widest text-slate-900 dark:text-white drop-shadow-sm">Select Fixtures</h2>
              <div className="mt-2 flex items-center gap-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass border-indigo-500/30 text-indigo-600 dark:text-indigo-400 text-[10px] sm:text-xs font-bold tracking-widest uppercase">
                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span></span>
                  Gameweek {selectedGwId}
                </div>
                {selectedGw && (
                  <AdminVisibilityClient 
                    key={selectedGwId}
                    gameweekId={selectedGwId} 
                    initialVisibility={selectedGw.is_available_to_players || false} 
                    isCurrentOrHistoric={selectedGwId <= currentGwId} 
                  />
                )}
                {selectedGw && (
                  <AdminSurvivorClient
                    key={`survivor-${selectedGwId}`}
                    gameweekId={selectedGwId}
                    initialSkipped={selectedGw.is_survivor_skipped || false}
                  />
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <a 
                href="/api/admin/export-selections"
                className="px-4 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest glass bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl transition-all border border-emerald-500/30 shadow-sm flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Backup
              </a>
              {selectedGwId > 1 && (
                <Link 
                  href={`/admin?gw=${selectedGwId - 1}`} 
                  className="px-4 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest glass bg-white/50 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/40 text-slate-700 dark:text-slate-300 rounded-xl transition-all border border-slate-200/50 dark:border-white/5 shadow-sm"
                >
                  &larr; Prev GW
                </Link>
              )}
              {selectedGwId < maxAllowedGwId && (
                <Link 
                  href={`/admin?gw=${selectedGwId + 1}`} 
                  className="px-4 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest glass bg-white/50 dark:bg-black/20 hover:bg-white/80 dark:hover:bg-black/40 text-slate-700 dark:text-slate-300 rounded-xl transition-all border border-slate-200/50 dark:border-white/5 shadow-sm"
                >
                  Next GW &rarr;
                </Link>
              )}
            </div>
          </div>
          
          <div className="relative p-6 sm:p-8">
            <AdminFixturesClient fixtures={fixtures || []} gameweekId={selectedGwId} isLocked={isLocked} lockedFixtureIds={lockedFixtureIds} />
          </div>
        </div>

        <AdminBonusClient key={`bonus-${selectedGwId}`} gameweekId={selectedGwId} existingQuestion={bonusQuestion} isFinished={selectedGw?.is_finished || false} />
      </main>
    </div>
  )
}
