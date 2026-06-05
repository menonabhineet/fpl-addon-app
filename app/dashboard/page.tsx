// app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PredictionForm from '@/components/forms/prediction-form'

export default async function DashboardPage() {
  const supabase = await createClient()

  // 1. Protect the route: Only logged-in users can view this page
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user.email}</span>
            <form action={async () => {
              'use server'
              const supabase = await createClient()
              await supabase.auth.signOut()
              redirect('/')
            }}>
              <button className="text-sm font-medium text-red-600 hover:text-red-500">Log out</button>
            </form>
          </div>
        </header>

        {/* Render the client component containing the stateful form */}
        <PredictionForm />
      </div>
    </div>
  )
}