import Link from 'next/link'

export default function PrivacyPolicyPage() {
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
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-400">Last updated: August 2026</p>

        <section className="space-y-4 text-slate-300 text-sm sm:text-base leading-relaxed">
          <h2 className="text-xl font-bold text-white">1. Information We Collect</h2>
          <p>
            When you sign in using Google Authentication, we collect basic profile information provided by Google OAuth, including your name, email address, and profile picture URL.
          </p>

          <h2 className="text-xl font-bold text-white">2. How We Use Your Information</h2>
          <p>
            Your information is used solely to authenticate your identity, manage your mini-league participation, record your predictions, and display your manager profile on leaderboards within Pro Pundits League.
          </p>

          <h2 className="text-xl font-bold text-white">3. Data Sharing and Protection</h2>
          <p>
            We do not sell, rent, or share your personal information with third parties. Your account data is stored securely using Supabase with row-level security enabled.
          </p>

          <h2 className="text-xl font-bold text-white">4. Push Notifications</h2>
          <p>
            If you opt in to deadline reminders, your browser push subscription is stored securely and used exclusively to send gameweek deadline alerts.
          </p>

          <h2 className="text-xl font-bold text-white">5. Contact Us</h2>
          <p>
            If you have any questions regarding this Privacy Policy or wish to delete your account data, please contact the league administrator.
          </p>
        </section>
      </div>
    </div>
  )
}
