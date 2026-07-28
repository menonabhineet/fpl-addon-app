import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminFixturesClient from './admin-fixtures-client'
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
  
  const requestedGwId = resolvedParams.gw ? parseInt(resolvedParams.gw) : currentGwObj?.id || 1
  const selectedGwId = Math.min(requestedGwId, currentGwObj?.id || 1)
  const selectedGw = allGameweeks?.find(gw => gw.id === selectedGwId)

  // Fetch fixtures for this gameweek
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, kickoff_time, is_selected, home_team:home_team_id (id, name, short_name, code), away_team:away_team_id (id, name, short_name, code)')
    .eq('gameweek_id', selectedGwId)
    .order('kickoff_time', { ascending: true })

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 transition-colors duration-300">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 shadow-sm transition-colors duration-300">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-indigo-950 dark:text-indigo-400">Admin Panel</h1>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
              {selectedGw ? (selectedGw.name || `Gameweek ${selectedGw.id}`) : 'Season inactive'}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline-block text-sm font-medium text-slate-600 dark:text-slate-300">{user.email} (Admin)</span>
            <Link href="/dashboard" className="rounded-full bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 sm:p-6 mt-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-lg font-bold">Select 5 Fixtures for Gameweek {selectedGwId}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Choose exactly 5 fixtures that players will predict scores for.
            </p>
          </div>
          
          <div className="p-6">
            <AdminFixturesClient fixtures={fixtures || []} gameweekId={selectedGwId} />
          </div>
        </div>
      </main>
    </div>
  )
}
