'use client'

import { useState, useActionState, useEffect } from 'react'
import { submitTeamPrediction } from '@/lib/actions/team-prediction'

export default function TeamPredictionUI({ teams, currentGw, initialTeamPick, allUserTeamPicks = [] }: any) {
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(initialTeamPick?.team_id || null)
  
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

  const getTeamPickCount = (teamId: number) => {
    return allUserTeamPicks.filter((p: any) => p.team_id === teamId && p.gameweek_id !== currentGw.id).length;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="glass rounded-xl p-4 text-sm text-slate-700 dark:text-slate-300 border-indigo-500/30 border-l-4">
        📌 <strong className="text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">Gameweek {currentGw.id} Rules:</strong> Pick one team to win. You CANNOT pick the same team twice in a season. 
        Correct pick = <strong className="text-indigo-500 font-bold text-lg">3 pts</strong>.
      </div>

      <form action={formAction} className="glass rounded-3xl p-6 sm:p-8 relative overflow-hidden group hover:border-white/20 transition-colors duration-300">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        
        {hasExistingPick && !isSelectionChanged && (
          <div className="mb-8 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center shadow-[0_0_15px_rgba(16,185,129,0.1)] relative z-10">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm tracking-widest uppercase">✓ Your team is securely locked in</span>
          </div>
        )}

        {/* 3D Grid of Teams */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4 mb-8 relative z-10">
          {teams.map((team: any) => {
            const pickCount = getTeamPickCount(team.id);
            const isDisabled = pickCount >= 2 && team.id !== initialTeamPick?.team_id; 

            return (
              <div 
                key={team.id}
                onClick={() => {
                  if (!isDisabled) setSelectedTeamId(team.id)
                }}
                className={`relative rounded-2xl border-2 p-4 flex flex-col items-center justify-center gap-3 transition-all duration-300 overflow-hidden ${
                  isDisabled ? 'opacity-40 cursor-not-allowed bg-black/5 dark:bg-white/5 grayscale border-transparent' : 'cursor-pointer'
                } ${
                  selectedTeamId === team.id && !isDisabled
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 shadow-[0_0_20px_rgba(99,102,241,0.2)] scale-[1.05] z-10' 
                    : !isDisabled ? 'border-white/10 hover:border-indigo-500/30 bg-white/40 dark:bg-black/20 backdrop-blur-sm hover:bg-white/60 dark:hover:bg-white/10 hover:scale-[1.02]' : ''
                }`}
              >
                {selectedTeamId === team.id && !isDisabled && <div className="absolute inset-0 bg-indigo-500/10 blur-xl pointer-events-none" />}
                
                <img 
                  src={`https://resources.premierleague.com/premierleague/badges/t${team.code}.png`} 
                  alt={team.name}
                  className="w-14 h-14 object-contain drop-shadow-md relative z-10"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
                />
                <div className="flex flex-col items-center relative z-10">
                  <span className="font-heading text-xl uppercase tracking-wide text-slate-900 dark:text-white">{team.short_name}</span>
                  {isDisabled && <span className="text-[10px] text-rose-500 font-bold uppercase tracking-widest mt-1">Used</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected Team Stats Panel */}
        {selectedTeamId && (
          (() => {
            const selectedTeam = teams.find((t: any) => t.id === selectedTeamId);
            if (!selectedTeam) return null;
            return (
              <div className="mb-8 p-6 glass bg-white/50 dark:bg-black/20 border border-slate-200/50 dark:border-white/5 rounded-2xl animate-in slide-in-from-bottom-4 flex flex-col md:flex-row gap-6 items-center justify-between relative z-10 shadow-[0_0_15px_rgba(0,0,0,0.05)]">
                <div className="flex items-center gap-4">
                  <img 
                    src={`https://resources.premierleague.com/premierleague/badges/t${selectedTeam.code}.png`} 
                    alt={selectedTeam.name}
                    className="w-16 h-16 object-contain drop-shadow-md"
                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
                  />
                  <div>
                    <h3 className="font-heading text-2xl uppercase tracking-widest text-slate-900 dark:text-white drop-shadow-sm">{selectedTeam.name}</h3>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Form: <span className="text-indigo-600 dark:text-indigo-400">{selectedTeam.form || 'N/A'}</span></p>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8">
                  <div className="flex flex-col items-center bg-white/40 dark:bg-white/5 px-4 py-2 rounded-xl border border-slate-200/50 dark:border-white/5">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Position</span>
                    <span className="font-heading text-2xl text-slate-800 dark:text-slate-200">{selectedTeam.position || '-'}</span>
                  </div>
                  <div className="flex flex-col items-center bg-white/40 dark:bg-white/5 px-4 py-2 rounded-xl border border-slate-200/50 dark:border-white/5">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Strength</span>
                    <span className="font-heading text-2xl text-slate-800 dark:text-slate-200">{selectedTeam.strength || '-'}</span>
                  </div>
                  <div className="flex flex-col items-center bg-white/40 dark:bg-white/5 px-4 py-2 rounded-xl border border-slate-200/50 dark:border-white/5">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Next Fixture</span>
                    <span className="font-heading text-xl text-slate-800 dark:text-slate-200">{selectedTeam.next_fixture || 'N/A'}</span>
                  </div>
                </div>
              </div>
            )
          })()
        )}

        <div className="pt-6 border-t border-slate-200/50 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
          <div className="text-xs font-bold uppercase tracking-widest min-h-[1.5rem] flex items-center gap-2">
            {state.success && <span className="text-indigo-600 dark:text-indigo-400 drop-shadow-sm">✓ {state.message}</span>}
            {state.error && <span className="text-rose-600 dark:text-rose-400 drop-shadow-sm">⚠ {state.error}</span>}
          </div>
          
          <div className="flex items-center gap-4">
            {hasExistingPick && initialTeamPick.points_earned !== null && (
              <span className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold tracking-widest uppercase border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.1)]">
                +{initialTeamPick.points_earned} Pts
              </span>
            )}

            {!currentGw.is_finished && (
              <button
                type="submit"
                disabled={isPending || !selectedTeamId || (!isSelectionChanged && hasExistingPick)}
                className="bg-indigo-600 text-white text-xs font-bold uppercase tracking-widest px-8 py-3 rounded-xl hover:bg-indigo-500 transition-all disabled:bg-slate-400 disabled:shadow-none hover:shadow-[0_0_20px_rgba(99,102,241,0.4)]"
              >
                {isPending ? 'Validating...' : (hasExistingPick && isSelectionChanged) ? 'Update Pick' : hasExistingPick ? 'Team Locked' : 'Lock In Team'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}