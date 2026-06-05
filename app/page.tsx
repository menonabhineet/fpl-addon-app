// app/page.tsx
'use client'

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-md text-center">
        <h1 className="mb-2 text-3xl font-bold text-slate-900">FPL Addon League</h1>
        <p className="mb-8 text-slate-500">Sign in to submit your predictions.</p>
        
        <button 
          onClick={handleGoogleLogin}
          className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    </main>
  )
}