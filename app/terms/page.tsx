import Link from 'next/link'

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 font-semibold mb-4 transition-colors"
        >
          ← Back to Pro Pundits League
        </Link>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
          Terms of Service
        </h1>
        <p className="text-sm text-slate-400">Last updated: August 2026</p>

        <section className="space-y-4 text-slate-300 text-sm sm:text-base leading-relaxed">
          <h2 className="text-xl font-bold text-white">1. Agreement to Terms</h2>
          <p>
            By accessing or using Pro Pundits League, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service.
          </p>

          <h2 className="text-xl font-bold text-white">2. Description of Service</h2>
          <p>
            Pro Pundits League is a companion fantasy prediction platform for Premier League football fans to compete in mini-leagues, score predictions, Survivor streaks, and Fantastic Four selections.
          </p>

          <h2 className="text-xl font-bold text-white">3. User Conduct</h2>
          <p>
            Users agree to use the service in compliance with all applicable laws and respect community guidelines within private and public leagues.
          </p>

          <h2 className="text-xl font-bold text-white">4. Disclaimer</h2>
          <p>
            Pro Pundits League is an independent platform and is not officially affiliated with, endorsed by, or sponsored by the Premier League or FPL.
          </p>
        </section>
      </div>
    </div>
  )
}
