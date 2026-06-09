// app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardTabs from '@/components/dashboard/dashboard-tabs'
import ThemeToggle from '@/components/theme-toggle'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/')

  const { data: currentGw } = await supabase.from('gameweeks').select('*').eq('id', 1).single()// Update the select statement to include 'code' for both teams
  const { data: fixtures } = await supabase.from('fixtures').select('id, home_score, away_score, kickoff_time, home_team:home_team_id (id, name, short_name, code), away_team:away_team_id (id, name, short_name, code)').eq('gameweek_id', currentGw?.id || 1).order('kickoff_time', { ascending: true })
  const { data: teams } = await supabase.from('teams').select('*').order('name', { ascending: true })

  return (
    // Notice the added dark:bg-slate-950 and dark:text-slate-100 classes
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 transition-colors duration-300">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 shadow-sm transition-colors duration-300">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-indigo-950 dark:text-indigo-400">FPL Addon</h1>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {currentGw ? `Gameweek ${currentGw.id} active` : 'Season inactive'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle /> {/* Our new toggle component! */}
            <span className="hidden sm:inline-block text-sm font-medium text-slate-600 dark:text-slate-300">{user.email}</span>
            <form action={async () => {
              'use server'
              const supabase = await createClient()
              await supabase.auth.signOut()
              redirect('/')
            }}>
              <button className="rounded-full bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 sm:p-6 mt-4">
        <DashboardTabs currentGw={currentGw} fixtures={fixtures || []} teams={teams || []} />
      </main>
    </div>
  )
}