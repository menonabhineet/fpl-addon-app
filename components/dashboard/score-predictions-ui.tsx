// components/dashboard/score-predictions-ui.tsx
'use client'

import { useActionState } from 'react'
import { submitScorePrediction } from '@/lib/actions/score-predictions'

export default function ScorePredictionsUI({ fixtures, currentGw }: any) {
  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl p-4 text-sm text-indigo-900 dark:text-indigo-300 transition-colors">
        📌 <strong>Gameweek {currentGw.id} Rules:</strong> Predict the exact scorelines for the selected matches below. Exact scoreline = <strong>3 pts</strong>. Correct outcome = <strong>1 pt</strong>. High scoring match bonus (cumulative goals ≥ 5) = <strong>+1 bonus pt</strong> if outcome is correct!
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {fixtures.map((match: any) => (
          <FixtureCard key={match.id} match={match} />
        ))}
      </div>
    </div>
  )
}

function FixtureCard({ match }: { match: any }) {
  const initialState = { success: false, message: '', error: '' }

  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => {
      const result = await submitScorePrediction(formData)
      if (result.success) return { success: true, message: 'Saved!', error: '' }
      return { success: false, message: '', error: result.error || 'Failed' }
    },
    initialState
  )

  const formattedTime = new Date(match.kickoff_time).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between transition-colors">
      {/* Card Header: Match Info */}
      <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 font-medium transition-colors">
        <span>{formattedTime}</span>
        {match.is_finished && <span className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded uppercase font-bold transition-colors">FT</span>}
      </div>

      {/* Card Body: Teams and Inputs */}
      <form action={formAction} className="p-4 space-y-4 flex-1 flex flex-col justify-between">
        <input type="hidden" name="fixtureId" value={match.id} />
        
        <div className="flex items-center justify-between gap-2">
          {/* Home Team */}
          <div className="flex items-center gap-3 w-5/12">
            <img 
              src={`https://resources.premierleague.com/premierleague/badges/t${match.home_team.code}.png`} 
              alt={match.home_team.name}
              className="w-8 h-8 object-contain flex-shrink-0 drop-shadow-sm"
              onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
            />
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm sm:text-base truncate transition-colors">{match.home_team.short_name}</span>
          </div>

          {/* Goals Inputs */}
          <div className="flex items-center gap-1.5 w-2/12 justify-center">
            <input 
              type="number" 
              name="homeScore" 
              min="0"
              required
              disabled={match.is_finished}
              className="w-10 h-10 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-center font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 disabled:opacity-60 transition-colors"
            />
            <span className="text-slate-400 dark:text-slate-500 font-bold transition-colors">-</span>
            <input 
              type="number" 
              name="awayScore" 
              min="0"
              required
              disabled={match.is_finished}
              className="w-10 h-10 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-center font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 disabled:opacity-60 transition-colors"
            />
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-end gap-3 w-5/12 text-right">
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm sm:text-base truncate transition-colors">{match.away_team.short_name}</span>
            <img 
              src={`https://resources.premierleague.com/premierleague/badges/t${match.away_team.code}.png`} 
              alt={match.away_team.name}
              className="w-8 h-8 object-contain flex-shrink-0 drop-shadow-sm"
              onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
            />
          </div>
        </div>

        {/* Action Button and Status Feedback */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 transition-colors">
          <div className="text-xs min-h-[1.25rem]">
            {state.success && <span className="text-green-600 dark:text-green-400 font-semibold">✓ {state.message}</span>}
            {state.error && <span className="text-red-600 dark:text-red-400 font-semibold">⚠ {state.error}</span>}
          </div>
          
          {!match.is_finished && (
            <button
              type="submit"
              disabled={isPending}
              className="bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-slate-800 dark:hover:bg-indigo-500 transition-colors disabled:bg-slate-400 dark:disabled:bg-slate-700"
            >
              {isPending ? 'Saving...' : 'Save Pick'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}