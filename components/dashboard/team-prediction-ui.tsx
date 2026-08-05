'use client'

import { useState, useTransition, useEffect } from 'react'
import { submitTeamPrediction } from '@/lib/actions/team-prediction'

export default function TeamPredictionUI({ teams, currentGw, initialTeamPick, allUserTeamPicks = [], fixtures = [] }: any) {
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(initialTeamPick?.team_id || null)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(initialTeamPick ? { type: 'success', text: '✓ Your team is securely locked in' } : null)
  
  // Modal state for DGW
  const [showModal, setShowModal] = useState(false)
  const [modalTeamId, setModalTeamId] = useState<number | null>(null)
  const [modalFixtures, setModalFixtures] = useState<any[]>([])

  useEffect(() => {
    if (initialTeamPick?.team_id) {
      setSelectedTeamId(initialTeamPick.team_id)
      setMessage({ type: 'success', text: '✓ Your team is securely locked in' })
    }
  }, [initialTeamPick?.team_id])

  const getTeamPickCount = (teamId: number) => {
    return allUserTeamPicks.filter((p: any) => p.team_id === teamId && p.gameweek_id !== currentGw.id).length;
  }

  const handleSelectTeam = (teamId: number) => {
    if (currentGw.is_finished) return;
    
    const teamFixtures = fixtures.filter((f: any) => f.home_team?.id === teamId || f.away_team?.id === teamId)
    
    if (teamFixtures.length > 1) {
      setModalTeamId(teamId)
      setModalFixtures(teamFixtures)
      setShowModal(true)
    } else {
      const fixtureId = teamFixtures.length === 1 ? teamFixtures[0].id : null
      submitPick(teamId, fixtureId)
    }
  }

  const submitPick = (teamId: number, fixtureId: number | null) => {
    setShowModal(false)
    setSelectedTeamId(teamId)
    setMessage(null)

    startTransition(async () => {
      const formData = new FormData()
      formData.append('teamId', teamId.toString())
      formData.append('gameweekId', currentGw.id.toString())
      if (fixtureId) {
        formData.append('fixtureId', fixtureId.toString())
      }
      
      const result = await submitTeamPrediction(formData)
      if (result.success) {
        setMessage({ type: 'success', text: 'Team Locked In!' })
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save prediction.' })
        // Revert UI selection on failure
        setSelectedTeamId(initialTeamPick?.team_id || null)
      }
    })
  }

  const hasExistingPick = !!initialTeamPick;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
      <div className="glass rounded-xl p-4 text-sm text-slate-700 dark:text-slate-300 border-indigo-500/30 border-l-4">
        📌 <strong className="text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">Gameweek {currentGw.id} Rules:</strong> Pick one team to win. You CANNOT pick the same team twice in a season. 
        Correct pick = <strong className="text-indigo-500 font-bold text-lg">3 pts</strong>.
      </div>

      <div className="glass rounded-3xl p-6 sm:p-8 relative overflow-hidden group transition-colors duration-300 border border-slate-200/50 dark:border-white/5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        
        {message && message.type === 'success' && (
          <div className="mb-8 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center shadow-[0_0_15px_rgba(16,185,129,0.1)] relative z-10">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm tracking-widest uppercase">{message.text}</span>
          </div>
        )}
        
        {message && message.type === 'error' && (
          <div className="mb-8 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-center shadow-[0_0_15px_rgba(225,29,72,0.1)] relative z-10">
            <span className="text-rose-600 dark:text-rose-400 font-bold text-sm tracking-widest uppercase">⚠ {message.text}</span>
          </div>
        )}

        {isPending && (
          <div className="mb-8 flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-500">Saving Prediction...</span>
          </div>
        )}

        {/* 3D Grid of Teams */}
        <div className={`grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4 mb-8 relative z-10 transition-opacity ${isPending ? 'opacity-50 pointer-events-none' : ''}`}>
          {teams.map((team: any) => {
            const pickCount = getTeamPickCount(team.id);
            const isDisabled = (pickCount >= 2 && team.id !== selectedTeamId) || currentGw.is_finished; 

            return (
              <div 
                key={team.id}
                onClick={() => {
                  if (!isDisabled) handleSelectTeam(team.id)
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
                <div className="flex flex-col items-center relative z-10 text-center">
                  <span className="font-heading text-xl uppercase tracking-wide text-slate-900 dark:text-white">{team.short_name}</span>
                  {pickCount > 0 && !isDisabled && <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Picked {pickCount}x</span>}
                  {isDisabled && !currentGw.is_finished && <span className="text-[10px] text-rose-500 font-bold uppercase tracking-widest mt-1">Used</span>}
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
              <div className="p-6 glass bg-white/50 dark:bg-black/20 border border-slate-200/50 dark:border-white/5 rounded-2xl animate-in slide-in-from-bottom-4 flex flex-col md:flex-row gap-6 items-center justify-between relative z-10 shadow-[0_0_15px_rgba(0,0,0,0.05)]">
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
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Upcoming Fixtures</span>
                    <div className="flex items-center gap-3">
                      {selectedTeam.next_3_fixtures && selectedTeam.next_3_fixtures.length > 0 ? (
                        <>
                          <span className="font-heading text-xl text-slate-800 dark:text-slate-200">{selectedTeam.next_3_fixtures[0].opponentShortName} ({selectedTeam.next_3_fixtures[0].isHome ? 'H' : 'A'})</span>
                          {selectedTeam.next_3_fixtures.length > 1 && (
                             <div className="flex items-center gap-2 opacity-60">
                               {selectedTeam.next_3_fixtures.slice(1).map((f: any, i: number) => (
                                 <span key={i} className="font-heading text-sm text-slate-800 dark:text-slate-200">{f.opponentShortName} ({f.isHome ? 'H' : 'A'})</span>
                               ))}
                             </div>
                          )}
                        </>
                      ) : (
                        <span className="font-heading text-xl text-slate-800 dark:text-slate-200">{selectedTeam.next_fixture || 'N/A'}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()
        )}
      </div>

      {/* DGW Modal */}
      {showModal && modalTeamId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="glass bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-3xl relative z-10 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="font-heading text-2xl uppercase tracking-widest text-slate-900 dark:text-white mb-2 text-center">Double Gameweek</h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-8 text-center">Select which fixture you are backing them to win</p>
            
            <div className="space-y-4">
              {modalFixtures.map(match => {
                const formattedTime = new Date(match.kickoff_time).toLocaleDateString('en-GB', {
                  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })
                const isHome = match.home_team?.id === modalTeamId
                const opponentTeam = isHome ? match.away_team : match.home_team
                
                return (
                  <button 
                    key={match.id}
                    onClick={() => submitPick(modalTeamId, match.id)}
                    className="w-full flex items-center justify-between p-4 glass bg-white/50 dark:bg-black/20 hover:bg-indigo-500/10 dark:hover:bg-indigo-500/20 border border-slate-200/50 dark:border-white/5 hover:border-indigo-500/50 rounded-2xl transition-all group"
                  >
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{formattedTime}</span>
                      <span className="font-heading text-xl text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        vs {opponentTeam?.name || 'Unknown'} {isHome ? '(H)' : '(A)'}
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 group-hover:bg-indigo-500 flex items-center justify-center transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 group-hover:text-white transition-colors"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </div>
                  </button>
                )
              })}
            </div>
            
            <button onClick={() => setShowModal(false)} className="mt-8 w-full py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}