// components/dashboard/team-prediction-ui.tsx
'use client'

import { useState, useActionState } from 'react'
import { submitTeamPrediction } from '@/lib/actions/team-prediction'

export default function TeamPredictionUI({ teams, currentGw }: any) {
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  
  const initialState = { success: false, message: '', error: '' }
  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => {
      if (!selectedTeamId) return { success: false, message: '', error: 'Please select a team first.' }
      
      // Inject the React state into the FormData before sending to server
      formData.append('teamId', selectedTeamId.toString())
      formData.append('gameweekId', currentGw.id.toString())
      
      const result = await submitTeamPrediction(formData)
      if (result.success) return { success: true, message: 'Team Locked In!', error: '' }
      return { success: false, message: '', error: result.error || 'Failed' }
    },
    initialState
  )

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl p-4 text-sm text-indigo-900 dark:text-indigo-300">
        📌 <strong>Gameweek {currentGw.id} Rules:</strong> Select ONE team to win this gameweek. You can only pick a specific team <strong>twice per season</strong>. Make it count!
      </div>

      <form action={formAction} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4 mb-8">
          {teams.map((team: any) => (
            <div 
              key={team.id}
              onClick={() => setSelectedTeamId(team.id)}
              className={`cursor-pointer rounded-xl border-2 p-4 flex flex-col items-center justify-center gap-2 transition-all duration-200 ${
                selectedTeamId === team.id 
                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 shadow-md transform scale-105' 
                  : 'border-slate-100 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-slate-50 dark:bg-slate-800/50'
              }`}
            >
              <img 
                src={`https://resources.premierleague.com/premierleague/badges/t${team.code}.png`} 
                alt={team.name}
                className="w-12 h-12 object-contain drop-shadow-sm"
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
              />
              <span className="text-xs font-bold text-center text-slate-800 dark:text-slate-200">{team.short_name}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center border-t border-slate-100 dark:border-slate-800 pt-6">
          <button
            type="submit"
            disabled={isPending || !selectedTeamId}
            className="w-full sm:w-1/2 bg-indigo-600 text-white font-bold text-lg px-6 py-3 rounded-xl hover:bg-indigo-500 transition-colors disabled:bg-slate-400 dark:disabled:bg-slate-700"
          >
            {isPending ? 'Validating...' : 'Lock In Team'}
          </button>

          <div className="mt-4 min-h-[1.5rem]">
            {state.success && <span className="text-green-600 dark:text-green-400 font-bold text-sm">✓ {state.message}</span>}
            {state.error && <span className="text-red-600 dark:text-red-400 font-bold text-sm">⚠ {state.error}</span>}
          </div>
        </div>
      </form>
    </div>
  )
}