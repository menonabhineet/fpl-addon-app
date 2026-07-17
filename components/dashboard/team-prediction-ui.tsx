// components/dashboard/team-prediction-ui.tsx
'use client'

import { useState, useActionState, useEffect } from 'react'
import { submitTeamPrediction } from '@/lib/actions/team-prediction'

export default function TeamPredictionUI({ teams, currentGw, initialTeamPick, allUserTeamPicks = [] }: any) {
  // Initialize state with the existing pick if it exists
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(initialTeamPick?.team_id || null)
  
  // Keep local state in sync if the server data updates after a refresh/submission
  useEffect(() => {
    if (initialTeamPick?.team_id) {
      setSelectedTeamId(initialTeamPick.team_id)
    }
  }, [initialTeamPick?.team_id])

  const initialState = { success: false, message: '', error: '' }
  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => {
      if (!selectedTeamId) return { success: false, message: '', error: 'Please select a team first.' }
      
      formData.append('teamId', selectedTeamId.toString())
      formData.append('gameweekId', currentGw.id.toString())
      
      const result = await submitTeamPrediction(formData)
      if (result.success) return { success: true, message: 'Team Locked In!', error: '' }
      return { success: false, message: '', error: result.error || 'Failed' }
    },
    initialState
  )

  const hasExistingPick = !!initialTeamPick;
  const isSelectionChanged = initialTeamPick?.team_id !== selectedTeamId;

  // Helper to calculate previous picks for a team (excluding current gameweek)
  const getTeamPickCount = (teamId: number) => {
    return allUserTeamPicks.filter((p: any) => p.team_id === teamId && p.gameweek_id !== currentGw.id).length;
  }

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl p-4 text-sm text-indigo-900 dark:text-indigo-300">
        📌 <strong>Gameweek {currentGw.id} Rules:</strong> Select ONE team to win this gameweek. Max 2 picks per team per season.
      </div>

      <form action={formAction} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
        
        {/* If they already have a pick, show a nice status banner */}
        {hasExistingPick && !isSelectionChanged && (
          <div className="mb-6 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-center">
            <span className="text-green-700 dark:text-green-400 font-bold text-sm">✓ Your team is securely locked in for Gameweek {currentGw.id}.</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4 mb-8">
          {teams.map((team: any) => {
            const pickCount = getTeamPickCount(team.id);
            const isDisabled = pickCount >= 2 && team.id !== initialTeamPick?.team_id; // Allow picking if it's the current pick (even if it somehow got to 2)

            return (
              <div 
                key={team.id}
                onClick={() => {
                  if (!isDisabled) setSelectedTeamId(team.id)
                }}
                className={`rounded-xl border-2 p-4 flex flex-col items-center justify-center gap-2 transition-all duration-200 ${
                  isDisabled ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800/80 grayscale' : 'cursor-pointer'
                } ${
                  selectedTeamId === team.id && !isDisabled
                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 shadow-md transform scale-105' 
                    : !isDisabled ? 'border-slate-100 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-slate-50 dark:bg-slate-800/50' : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <img 
                  src={`https://resources.premierleague.com/premierleague/badges/t${team.code}.png`} 
                  alt={team.name}
                  className="w-12 h-12 object-contain drop-shadow-sm"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
                />
                <div className="flex flex-col items-center">
                  <span className="text-xs font-bold text-center text-slate-800 dark:text-slate-200">{team.short_name}</span>
                  {isDisabled && <span className="text-[10px] text-red-500 font-semibold mt-1">Max Reached</span>}
                </div>
              </div>
            )
          })}
        </div>

        {selectedTeamId && (
          <div className="mb-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            {(() => {
              const selectedTeam = teams.find((t: any) => t.id === selectedTeamId);
              if (!selectedTeam) return null;
              return (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <img 
                      src={`https://resources.premierleague.com/premierleague/badges/t${selectedTeam.code}.png`} 
                      alt={selectedTeam.name}
                      className="w-16 h-16 object-contain drop-shadow-md"
                      onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
                    />
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{selectedTeam.name}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Current Position: {selectedTeam.position ? `#${selectedTeam.position}` : 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex gap-6 text-center">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Next Fixture</p>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{selectedTeam.next_fixture || 'No fixture'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Recent Form</p>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {selectedTeam.form ? (
                           <span className="font-bold text-slate-800 dark:text-slate-200">{selectedTeam.form}</span>
                        ) : (
                          <span className="font-bold text-slate-800 dark:text-slate-200">N/A</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div className="flex flex-col items-center border-t border-slate-100 dark:border-slate-800 pt-6">
          <button
            type="submit"
            disabled={isPending || !selectedTeamId || (!isSelectionChanged && hasExistingPick)}
            className="w-full sm:w-1/2 bg-indigo-600 text-white font-bold text-lg px-6 py-3 rounded-xl hover:bg-indigo-500 transition-colors disabled:bg-slate-400 dark:disabled:bg-slate-700"
          >
            {isPending ? 'Validating...' : (hasExistingPick && isSelectionChanged) ? 'Update Team Pick' : hasExistingPick ? 'Team Locked' : 'Lock In Team'}
          </button>

          {hasExistingPick && initialTeamPick.points_earned !== null && (
              <div className="flex items-center justify-center px-4 bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-800 rounded-xl">
                <span className="text-green-800 dark:text-green-400 font-extrabold whitespace-nowrap">
                  +{initialTeamPick.points_earned} Pts
                </span>
              </div>
            )}

          <div className="mt-4 min-h-[1.5rem]">
            {state.success && <span className="text-green-600 dark:text-green-400 font-bold text-sm">✓ {state.message}</span>}
            {state.error && <span className="text-red-600 dark:text-red-400 font-bold text-sm">⚠ {state.error}</span>}
          </div>
        </div>
      </form>
    </div>
  )
}