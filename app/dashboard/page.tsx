// app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardTabs from '@/components/dashboard/dashboard-tabs'

export default async function DashboardPage() {
  const supabase = await createClient()

  // 1. Authenticate User
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/')

  // 2. Fetch the Current Gameweek
  // (Note: For testing, we are looking for GW 1 since we altered the deadline earlier)
  const { data: currentGw } = await supabase
    .from('gameweeks')
    .select('*')
    .eq('id', 1) // Change this to .eq('is_current', true) in production
    .single()

  // 3. Fetch the Fixtures for this Gameweek
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select(`
      id,
      home_score,
      away_score,
      kickoff_time,
      home_team:home_team_id (id, name, short_name),
      away_team:away_team_id (id, name, short_name)
    `)
    .eq('gameweek_id', currentGw?.id || 1)
    .order('kickoff_time', { ascending: true })

  // 4. Fetch all 20 Teams (Needed for the Team Prediction dropdown/grid)
  const { data: teams } = await supabase
    .from('teams')
    .select('*')
    .order('name', { ascending: true })

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-20">
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-indigo-950">FPL Addon</h1>
            <p className="text-sm font-medium text-slate-500">
              {currentGw ? `Gameweek ${currentGw.id} active` : 'Season inactive'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline-block text-sm font-medium text-slate-600">{user.email}</span>
            <form action={async () => {
              'use server'
              const supabase = await createClient()
              await supabase.auth.signOut()
              redirect('/')
            }}>
              <button className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors">
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 sm:p-6 mt-4">
        {/* We pass all the fetched data down to our interactive client component */}
        <DashboardTabs 
          currentGw={currentGw} 
          fixtures={fixtures || []} 
          teams={teams || []} 
        />
      </main>
    </div>
  )
}