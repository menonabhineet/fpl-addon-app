// components/dashboard/score-predictions-ui.tsx
'use client'

import { useActionState } from 'react'
import { submitScorePrediction } from '@/lib/actions/score-predictions'

export default function ScorePredictionsUI({ fixtures, currentGw, initialScorePicks }: any) {
  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl p-4 text-sm text-indigo-900 dark:text-indigo-300 transition-colors">
        📌 <strong>Gameweek {currentGw.id} Rules:</strong> Predict the exact scorelines. Exact scoreline = <strong>3 pts</strong>. Correct outcome = <strong>1 pt</strong>.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {fixtures.map((match: any) => {
          // Find if the user has already predicted this specific fixture
          const pick = initialScorePicks?.find((p: any) => p.fixture_id === match.id)
          return <FixtureCard key={match.id} match={match} existingPick={pick} />
        })}
      </div>
    </div>
  )
}

function FixtureCard({ match, existingPick }: { match: any, existingPick?: any }) {
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
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between transition-colors">
      <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 font-medium transition-colors">
        <span>{formattedTime}</span>
        <div className="flex gap-2 items-center">
          {existingPick && <span className="text-green-600 dark:text-green-400 font-bold">✓ Locked</span>}
          {match.is_finished && <span className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded uppercase font-bold">FT</span>}
        </div>
      </div>

      <form action={formAction} className="p-4 space-y-4 flex-1 flex flex-col justify-between">
        <input type="hidden" name="fixtureId" value={match.id} />
        
        <div className="flex items-center justify-between gap-2">
          {/* Home Team */}
          <div className="flex items-center gap-3 w-5/12">
            <img src={`https://resources.premierleague.com/premierleague/badges/t${match.home_team.code}.png`} alt={match.home_team.name} className="w-8 h-8 object-contain flex-shrink-0 drop-shadow-sm" onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }} />
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm sm:text-base truncate transition-colors">{match.home_team.short_name}</span>
          </div>

          <div className="flex items-center gap-1.5 w-2/12 justify-center">
            <input 
              type="number" name="homeScore" min="0" required disabled={match.is_finished}
              defaultValue={existingPick?.predicted_home_score ?? ''}
              className="w-10 h-10 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-center font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-60"
            />
            <span className="text-slate-400 font-bold">-</span>
            <input 
              type="number" name="awayScore" min="0" required disabled={match.is_finished}
              defaultValue={existingPick?.predicted_away_score ?? ''}
              className="w-10 h-10 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-center font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-60"
            />
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-end gap-3 w-5/12 text-right">
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm sm:text-base truncate transition-colors">{match.away_team.short_name}</span>
            <img src={`https://resources.premierleague.com/premierleague/badges/t${match.away_team.code}.png`} alt={match.away_team.name} className="w-8 h-8 object-contain flex-shrink-0 drop-shadow-sm" onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }} />
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 transition-colors">
          <div className="text-xs min-h-[1.25rem] flex items-center gap-2">
            {state.success && <span className="text-green-600 dark:text-green-400 font-semibold">✓ {state.message}</span>}
            {state.error && <span className="text-red-600 dark:text-red-400 font-semibold">⚠ {state.error}</span>}
            {match.is_finished && match.home_score !== null && match.away_score !== null && (
              <span className="text-slate-600 dark:text-slate-400 font-bold">
                Actual Score: {match.home_score} - {match.away_score}
              </span>
            )}
          </div>
          
          {!match.is_finished && (
            <button
              type="submit" disabled={isPending}
              className="bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-slate-800 dark:hover:bg-indigo-500 transition-colors disabled:bg-slate-400"
            >
              {isPending ? 'Saving...' : existingPick ? 'Update Pick' : 'Save Pick'}
            </button>
          )}
          {match.is_finished && existingPick && existingPick.points_earned !== null && (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-400 text-xs font-bold border border-green-200 dark:border-green-800">
              +{existingPick.points_earned} Points
            </span>
          )}
        </div>
      </form>
    </div>
  )
}