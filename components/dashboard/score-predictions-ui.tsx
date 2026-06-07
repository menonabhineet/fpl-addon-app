// components/dashboard/score-predictions-ui.tsx
'use client'

import { useActionState } from 'react'
import { submitScorePrediction } from '@/lib/actions/score-predictions'

export default function ScorePredictionsUI({ fixtures, currentGw }: any) {
  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-900">
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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col justify-between">
      {/* Card Header: Match Info */}
      <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center text-xs text-slate-500 font-medium">
        <span>{formattedTime}</span>
        {match.is_finished && <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded uppercase font-bold">FT</span>}
      </div>

      {/* Card Body: Teams and Inputs */}
      <form action={formAction} className="p-4 space-y-4 flex-1 flex flex-col justify-between">
        <input type="hidden" name="fixtureId" value={match.id} />
        
        <div className="flex items-center justify-between gap-2">
          {/* Home Team */}
          <div className="flex items-center gap-3 w-5/12">
            <img 
              src={`https://resources.premierleague.com/premierleague/badges/t${match.home_team.id}.png`} 
              alt={match.home_team.name}
              className="w-8 h-8 object-contain flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
            />
            <span className="font-semibold text-slate-800 text-sm sm:text-base truncate">{match.home_team.name}</span>
          </div>

          {/* Goals Inputs */}
          <div className="flex items-center gap-1.5 w-2/12 justify-center">
            <input 
              type="number" 
              name="homeScore" 
              min="0"
              required
              disabled={match.is_finished}
              className="w-10 h-10 bg-slate-50 border border-slate-300 rounded-lg text-center font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-60"
            />
            <span className="text-slate-400 font-bold">-</span>
            <input 
              type="number" 
              name="awayScore" 
              min="0"
              required
              disabled={match.is_finished}
              className="w-10 h-10 bg-slate-50 border border-slate-300 rounded-lg text-center font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-60"
            />
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-end gap-3 w-5/12 text-right">
            <span className="font-semibold text-slate-800 text-sm sm:text-base truncate">{match.away_team.name}</span>
            <img 
              src={`https://resources.premierleague.com/premierleague/badges/t${match.away_team.id}.png`} 
              alt={match.away_team.name}
              className="w-8 h-8 object-contain flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
            />
          </div>
        </div>

        {/* Action Button and Status Feedback */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-4">
          <div className="text-xs min-h-[1.25rem]">
            {state.success && <span className="text-green-600 font-semibold">✓ {state.message}</span>}
            {state.error && <span className="text-red-600 font-semibold">⚠ {state.error}</span>}
          </div>
          
          {!match.is_finished && (
            <button
              type="submit"
              disabled={isPending}
              className="bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors disabled:bg-slate-400"
            >
              {isPending ? 'Saving...' : 'Save Pick'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}