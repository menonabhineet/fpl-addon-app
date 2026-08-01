import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminFixturesClient from './admin-fixtures-client'
import AdminVisibilityClient from './admin-visibility-client'
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
  
  // Verify admin access
  const adminEmails = process.env.ADMIN_EMAIL?.split(',').map(e => e.trim()) || []
  if (!user.email || !adminEmails.includes(user.email)) {
    redirect('/dashboard') // Redirect non-admins to their dashboard
  }

  // Determine which Gameweek to view
  const { data: allGameweeks } = await supabase.from('gameweeks').select('*').order('id', { ascending: true })
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

  return (
    <div className="min-h-screen bg-background text-slate-900 dark:text-slate-100 pb-20 transition-colors duration-300 relative overflow-hidden">
      {/* Immersive Background Glows */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 h-[800px] w-[800px] rounded-full bg-indigo-600/10 blur-[200px] mix-blend-multiply dark:mix-blend-screen opacity-70" />
        <div className="absolute bottom-0 left-0 h-[800px] w-[800px] rounded-full bg-rose-600/10 blur-[200px] mix-blend-multiply dark:mix-blend-screen opacity-70" />
      </div>

      <header className="relative z-50 flex flex-col sm:flex-row items-center justify-between px-6 sm:px-12 py-6 w-full max-w-7xl mx-auto gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-heading uppercase tracking-widest text-slate-900 dark:text-white drop-shadow-md">
            PPL Admin
          </h1>
        </div>
        
        <div className="flex items-center gap-4 glass px-4 py-2 rounded-full">
          {allGameweeks && <GameweekSelector allGameweeks={allGameweeks} selectedGwId={selectedGwId} />}
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
              </div>
            </div>
            
            <div className="flex items-center gap-3">
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
            <AdminFixturesClient fixtures={fixtures || []} gameweekId={selectedGwId} />
          </div>
        </div>
      </main>
    </div>
  )
}
