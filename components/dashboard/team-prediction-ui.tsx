'use client'

import { useState, useTransition, useEffect } from 'react'
import { submitTeamPrediction } from '@/lib/actions/team-prediction'

export default function TeamPredictionUI({ teams, currentGw, initialTeamPick, allUserTeamPicks = [], fixtures = [], survivorEntry, isNewRound, actualCurrentGwId }: any) {
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
    if (!survivorEntry?.round_id) return 0;
    return allUserTeamPicks.filter((p: any) => p.team_id === teamId && p.gameweek_id !== currentGw.id && p.survivor_round_id === survivorEntry.round_id).length;
  }

  const getFixtureTeamId = (teamProp: any): number | null => {
    if (!teamProp) return null
    return Array.isArray(teamProp) ? teamProp[0]?.id : teamProp?.id
  }

  const getFixtureTeamObj = (teamProp: any): any => {
    if (!teamProp) return null
    return Array.isArray(teamProp) ? teamProp[0] : teamProp
  }

  const tableRulesApply = currentGw.id > 1 && !currentGw.is_survivor_skipped

  const handleSelectTeam = (teamId: number) => {
    if (currentGw.is_finished || currentGw.is_survivor_skipped || survivorEntry?.status === 'eliminated') return;
    
    const teamFixtures = fixtures.filter((f: any) => {
      const hId = getFixtureTeamId(f.home_team)
      const aId = getFixtureTeamId(f.away_team)
      return hId === teamId || aId === teamId
    })
    
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
      <div className="glass rounded-xl p-4 text-sm text-slate-700 dark:text-slate-300 border-indigo-500/30 border-l-4">
        📌 <strong className="text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">Survivor Rules:</strong> Pick one team to win each gameweek. 
        If your team wins, you survive and earn <strong className="text-indigo-500 font-bold text-lg">1 pt</strong>. 
        If they draw, lose, or you miss the deadline, you are eliminated! You can only use each team <strong>ONCE</strong> per round.
        <div className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
          🚫 <strong>Banned Picks:</strong> Teams in 1st–3rd place, and non-bottom-3 clubs facing bottom-3 opponents (18th–20th) are off the board. (Gameweek 1 is exempt).
        </div>
      </div>
      
      {currentGw.is_survivor_skipped && (
        <div className="glass rounded-xl p-4 text-sm bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 border-l-4">
          ⏸️ <strong className="font-bold uppercase tracking-wider">Survivor Mode Skipped:</strong> The admin has skipped this gameweek. Nobody will be eliminated this week!
        </div>
      )}

      {survivorEntry && survivorEntry.status === 'eliminated' && (
        <div className="glass rounded-xl p-4 text-sm bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 border-l-4">
          💀 <strong className="font-bold uppercase tracking-wider">Eliminated:</strong> You have been eliminated from the current round. Better luck next round!
        </div>
      )}

      {currentGw.id > actualCurrentGwId && (
        <div className="glass rounded-xl p-4 text-sm bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 border-l-4">
          ⏳ <strong className="font-bold uppercase tracking-wider">Future Gameweek:</strong> You can only make a survivor pick for the current active gameweek. Survive the current week first!
        </div>
      )}

      <div className={`glass rounded-3xl p-6 sm:p-8 relative overflow-hidden group transition-colors duration-300 border border-slate-200/50 dark:border-white/5 ${(survivorEntry?.status === 'eliminated' || currentGw.id > actualCurrentGwId) ? 'opacity-60 pointer-events-none grayscale' : ''}`}>
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
            const isUsed = pickCount > 0;
            
            // Check Top 3 (strictly 1st, 2nd, or 3rd place)
            const isTop3 = tableRulesApply && team.position !== null && team.position !== undefined && team.position >= 1 && team.position <= 3;
            
            // Check Fixtures and Bottom 3 Opponent
            const teamFixtures = fixtures.filter((f: any) => {
              const hId = getFixtureTeamId(f.home_team)
              const aId = getFixtureTeamId(f.away_team)
              return hId === team.id || aId === team.id
            });

            const hasNoFixture = teamFixtures.length === 0;
            const isSelfBottom3 = team.position !== null && team.position !== undefined && team.position >= 18 && team.position <= 20;

            let isVsBottom3 = false;
            if (tableRulesApply && !isSelfBottom3 && teamFixtures.length > 0) {
              // If single fixture, check if opponent is bottom 3
              if (teamFixtures.length === 1) {
                const f = teamFixtures[0];
                const hId = getFixtureTeamId(f.home_team);
                const oppId = hId === team.id ? getFixtureTeamId(f.away_team) : hId;
                const oppTeam = teams.find((t: any) => t.id === oppId);
                if (oppTeam && oppTeam.position !== null && oppTeam.position >= 18 && oppTeam.position <= 20) {
                  isVsBottom3 = true;
                }
              } else {
                // If DGW, check if ALL fixtures are against bottom 3
                const allOpponentsBottom3 = teamFixtures.every((f: any) => {
                  const hId = getFixtureTeamId(f.home_team);
                  const oppId = hId === team.id ? getFixtureTeamId(f.away_team) : hId;
                  const oppTeam = teams.find((t: any) => t.id === oppId);
                  return oppTeam && oppTeam.position !== null && oppTeam.position >= 18 && oppTeam.position <= 20;
                });
                if (allOpponentsBottom3) {
                  isVsBottom3 = true;
                }
              }
            }

            // Determine badge label and color
            let badgeLabel: string | null = null;
            let badgeColor = 'text-rose-500';

            if (isUsed) {
              badgeLabel = 'Used';
              badgeColor = 'text-rose-500';
            } else if (isTop3) {
              badgeLabel = 'Top 3';
              badgeColor = 'text-amber-500';
            } else if (isVsBottom3) {
              badgeLabel = 'Vs Bottom 3';
              badgeColor = 'text-orange-500';
            } else if (hasNoFixture) {
              badgeLabel = 'Blank GW';
              badgeColor = 'text-slate-400';
            }

            const isDisabled = isUsed || isTop3 || isVsBottom3 || hasNoFixture || currentGw.is_finished || currentGw.is_survivor_skipped;

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
                  {isDisabled && badgeLabel && (
                    <span className={`text-[10px] ${badgeColor} font-bold uppercase tracking-widest mt-1`}>
                      {badgeLabel}
                    </span>
                  )}
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
                const hId = getFixtureTeamId(match.home_team)
                const isHome = hId === modalTeamId
                const opponentTeamObj = isHome ? getFixtureTeamObj(match.away_team) : getFixtureTeamObj(match.home_team)
                const opponentFull = teams.find((t: any) => t.id === opponentTeamObj?.id)
                const modalTeamFull = teams.find((t: any) => t.id === modalTeamId)
                
                const isOpponentBottom3 = tableRulesApply && opponentFull?.position && opponentFull.position >= 18 && opponentFull.position <= 20
                const isSelfBottom3 = modalTeamFull?.position && modalTeamFull.position >= 18 && modalTeamFull.position <= 20
                const isFixtureBanned = isOpponentBottom3 && !isSelfBottom3

                return (
                  <button 
                    key={match.id}
                    disabled={isFixtureBanned}
                    onClick={() => {
                      if (!isFixtureBanned) submitPick(modalTeamId, match.id)
                    }}
                    className={`w-full flex items-center justify-between p-4 glass rounded-2xl transition-all group border ${
                      isFixtureBanned
                        ? 'opacity-40 cursor-not-allowed bg-black/5 dark:bg-white/5 border-transparent'
                        : 'bg-white/50 dark:bg-black/20 hover:bg-indigo-500/10 dark:hover:bg-indigo-500/20 border-slate-200/50 dark:border-white/5 hover:border-indigo-500/50 cursor-pointer'
                    }`}
                  >
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{formattedTime}</span>
                      <span className="font-heading text-xl text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        vs {opponentTeamObj?.name || 'Unknown'} {isHome ? '(H)' : '(A)'}
                      </span>
                      {isFixtureBanned && (
                        <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mt-0.5">
                          ⚠ Banned: Opponent is in bottom 3
                        </span>
                      )}
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                      isFixtureBanned
                        ? 'bg-slate-300 dark:bg-slate-800 text-slate-500'
                        : 'bg-slate-200 dark:bg-slate-800 group-hover:bg-indigo-500 text-slate-400 group-hover:text-white'
                    }`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
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