// components/dashboard/score-predictions-ui.tsx
'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { submitScorePrediction, clearAllScorePredictions, removeIndividualScorePrediction } from '@/lib/actions/score-predictions'

export default function ScorePredictionsUI({ fixtures, currentGw, initialScorePicks }: any) {
  const router = useRouter()
  const [currentScorePicks, setCurrentScorePicks] = useState<any[]>(initialScorePicks || [])
  const [showClearModal, setShowClearModal] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  // Sync state when props change
  useEffect(() => {
    setCurrentScorePicks(initialScorePicks || [])
  }, [initialScorePicks])

  const selectedFixtures = fixtures.filter((m: any) => m.is_selected)
  const isLocked = currentGw?.deadline_time ? new Date(currentGw.deadline_time) <= new Date() : false
  const predictedCount = currentScorePicks.length

  const handlePickSaved = (fixtureId: number, homeScore: number, awayScore: number) => {
    setCurrentScorePicks(prev => {
      const filtered = prev.filter(p => p.fixture_id !== fixtureId)
      return [...filtered, { fixture_id: fixtureId, predicted_home_score: homeScore, predicted_away_score: awayScore }]
    })
  }

  const handlePickRemoved = (fixtureId: number) => {
    setCurrentScorePicks(prev => prev.filter(p => p.fixture_id !== fixtureId))
  }

  const handleClearAll = async () => {
    if (isLocked) {
      toast.error('Gameweek deadline has passed. Predictions are locked.')
      return
    }
    setIsClearing(true)
    try {
      const res = await clearAllScorePredictions({ gameweekId: currentGw.id })
      if (res.success) {
        setCurrentScorePicks([])
        setShowClearModal(false)
        toast.success(res.message)
        router.refresh()
      } else {
        toast.error(res.error || 'Failed to clear score predictions')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to clear score predictions'
      toast.error(msg)
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      <div className="glass rounded-xl p-4 text-sm text-slate-700 dark:text-slate-300 border-emerald-500/30 border-l-4">
        📌 <strong className="text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Score Pick Rules:</strong> Predict the exact score for all matches. Exact score = <strong className="text-emerald-500 font-bold text-lg">3 pts</strong>. Correct outcome (win/draw/loss) = <strong className="text-emerald-500 font-bold text-lg">1 pt</strong>. High-scoring bonus (Correct outcome AND both actual & predicted total goals are 5+) = <strong className="text-emerald-500 font-bold text-lg">+1 pt</strong>. Failure to submit any predictions before the deadline = <strong className="text-rose-500 font-bold text-lg">-1 pt</strong> penalty.
      </div>

      {/* Action Header: Status & Clear All */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 glass rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
            Predictions: <span className="text-emerald-600 dark:text-emerald-400">{predictedCount}/{selectedFixtures.length}</span>
          </span>
          <div className="hidden sm:flex items-center gap-1">
            {selectedFixtures.map((fix: any) => {
              const isPredicted = currentScorePicks.some(p => p.fixture_id === fix.id)
              return (
                <span
                  key={fix.id}
                  title={`${fix.home_team?.short_name || 'H'} vs ${fix.away_team?.short_name || 'A'}`}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    isPredicted ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-slate-300 dark:bg-white/10'
                  }`}
                />
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {predictedCount > 0 && !isLocked && (
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              disabled={isClearing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 border border-rose-500/30 transition-all hover:scale-105 disabled:opacity-50 cursor-pointer shadow-sm"
              title="Clear all score predictions"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              <span>Clear All</span>
            </button>
          )}
          {isLocked && (
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              🔒 Picks Locked
            </span>
          )}
        </div>
      </div>

      {selectedFixtures.length === 0 ? (
        <div className="glass rounded-3xl p-12 text-center">
          <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">The admin has not selected the fixtures for this gameweek yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {selectedFixtures.map((match: any) => {
            const pick = currentScorePicks.find((p: any) => p.fixture_id === match.id)
            return (
              <FixtureCard 
                key={match.id} 
                match={match} 
                existingPick={pick} 
                isLocked={isLocked}
                onPickSaved={handlePickSaved}
                onPickRemoved={handlePickRemoved}
              />
            )
          })}
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="glass max-w-md w-full p-6 rounded-3xl border border-white/10 bg-neutral-950/90 shadow-2xl space-y-6">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </div>
              <h3 className="text-xl font-heading uppercase tracking-wider text-slate-900 dark:text-white">Clear All Predictions?</h3>
            </div>
            
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to remove all your score predictions for <strong>Gameweek {currentGw.id}</strong>? This action will clear your predictions for all {selectedFixtures.length} matches.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={isClearing}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-500 active:scale-95 shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isClearing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Clearing...</span>
                  </>
                ) : (
                  <span>Yes, Clear All</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FixtureCard({ 
  match, 
  existingPick, 
  isLocked,
  onPickSaved,
  onPickRemoved 
}: { 
  match: any, 
  existingPick?: any, 
  isLocked?: boolean,
  onPickSaved?: (fixtureId: number, home: number, away: number) => void,
  onPickRemoved?: (fixtureId: number) => void 
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isRemoving, setIsRemoving] = useState(false)
  const [state, setState] = useState({ success: false, message: '', error: '' })
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const [currentHomeScore, setCurrentHomeScore] = useState<string | number>(existingPick?.predicted_home_score ?? '')
  const [currentAwayScore, setCurrentAwayScore] = useState<string | number>(existingPick?.predicted_away_score ?? '')

  // Keep input values in sync with existingPick prop (e.g. on clear all)
  useEffect(() => {
    setCurrentHomeScore(existingPick?.predicted_home_score ?? '')
    setCurrentAwayScore(existingPick?.predicted_away_score ?? '')
  }, [existingPick?.predicted_home_score, existingPick?.predicted_away_score])

  const totalGoals = (Number(currentHomeScore) || 0) + (Number(currentAwayScore) || 0)
  const isGoalFest = currentHomeScore !== '' && currentAwayScore !== '' && totalGoals >= 5

  const handleScoreChange = (e: React.ChangeEvent<HTMLFormElement>) => {
    const form = e.currentTarget
    const formData = new FormData(form)
    const homeScore = formData.get('homeScore') as string
    const awayScore = formData.get('awayScore') as string

    setCurrentHomeScore(homeScore)
    setCurrentAwayScore(awayScore)

    if (homeScore !== '' && awayScore !== '') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      
      debounceRef.current = setTimeout(() => {
        startTransition(async () => {
          const result = await submitScorePrediction(formData)
          if (result.success) {
            setState({ success: true, message: `${homeScore}-${awayScore} saved!`, error: '' })
            if (onPickSaved) {
              onPickSaved(match.id, Number(homeScore), Number(awayScore))
            }
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            timeoutRef.current = setTimeout(() => {
              setState(prev => ({ ...prev, success: false, message: '' }))
            }, 3000)
          } else {
            setState({ success: false, message: '', error: result.error || 'Failed' })
          }
        })
      }, 750)
    }
  }

  const handleRemoveIndividual = async () => {
    if (isLocked || match.is_finished) return
    setIsRemoving(true)
    try {
      const res = await removeIndividualScorePrediction({ fixtureId: match.id })
      if (res.success) {
        setCurrentHomeScore('')
        setCurrentAwayScore('')
        setState({ success: false, message: '', error: '' })
        if (onPickRemoved) {
          onPickRemoved(match.id)
        }
        toast.success(res.message)
        router.refresh()
      } else {
        toast.error(res.error || 'Failed to remove prediction')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove prediction'
      toast.error(msg)
    } finally {
      setIsRemoving(false)
    }
  }

  const formattedTime = new Date(match.kickoff_time).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })

  const hasPick = (currentHomeScore !== '' && currentAwayScore !== '') || (existingPick && existingPick.predicted_home_score !== null && existingPick.predicted_home_score !== undefined)

  return (
    <div className={`relative glass rounded-3xl overflow-hidden flex flex-col justify-between transition-all duration-300 group hover:scale-[1.01] hover:border-white/20 hover:shadow-[0_0_25px_rgba(255,255,255,0.05)] ${hasPick ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : ''}`}>
      {hasPick && <div className="absolute inset-0 bg-emerald-500/5 blur-xl pointer-events-none" />}
      
      <div className="bg-black/5 dark:bg-black/20 px-6 py-3 border-b border-slate-200/50 dark:border-white/5 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 font-bold tracking-widest uppercase relative z-10">
        <span>{formattedTime}</span>
        <div className="flex gap-2 items-center">
          {isGoalFest && (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-[9px] sm:text-[10px] text-amber-600 dark:text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)] animate-in zoom-in duration-300">
              <svg className="w-3 h-3 fill-amber-500 drop-shadow-sm" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" /></svg>
              THRILLER
            </span>
          )}
          {hasPick && <span className="text-emerald-600 dark:text-emerald-400 drop-shadow-sm">✓ Locked</span>}
          {match.is_finished && <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[10px]">FT</span>}
          {hasPick && !match.is_finished && !isLocked && (
            <button
              type="button"
              onClick={handleRemoveIndividual}
              disabled={isRemoving || isPending}
              className="w-5 h-5 rounded-full flex items-center justify-center bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 border border-rose-500/20 active:scale-90 transition-all text-[10px] font-bold shadow-sm cursor-pointer ml-1"
              title="Clear this prediction"
            >
              {isRemoving ? (
                <div className="w-2.5 h-2.5 border border-rose-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                '✕'
              )}
            </button>
          )}
        </div>
      </div>

      <form onChange={handleScoreChange} className="p-6 space-y-6 flex-1 flex flex-col justify-between relative z-10">
        <input type="hidden" name="fixtureId" value={match.id} />
        
        <div className="flex items-center justify-between gap-2">
          {/* Home Team */}
          <div className="flex items-center gap-3 w-5/12">
            <img 
              src={`https://resources.premierleague.com/premierleague/badges/t${match.home_team.code}.png`} 
              alt={match.home_team.name} 
              className="w-10 h-10 object-contain flex-shrink-0 drop-shadow-md group-hover:scale-110 transition-transform duration-300" 
              onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }} 
            />
            <span className="font-heading text-xl sm:text-2xl text-slate-900 dark:text-white uppercase truncate">{match.home_team.short_name}</span>
          </div>

          <div className="flex items-center gap-2 w-2/12 justify-center relative">
            <input 
              type="number" 
              name="homeScore" 
              min="0" 
              required 
              disabled={match.is_finished || isLocked}
              value={currentHomeScore}
              onChange={(e) => setCurrentHomeScore(e.target.value)}
              className="w-12 h-12 bg-white/50 dark:bg-black/20 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-xl text-center font-heading text-2xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all disabled:opacity-60 shadow-inner"
            />
            <span className="text-slate-400 font-bold">-</span>
            <input 
              type="number" 
              name="awayScore" 
              min="0" 
              required 
              disabled={match.is_finished || isLocked}
              value={currentAwayScore}
              onChange={(e) => setCurrentAwayScore(e.target.value)}
              className="w-12 h-12 bg-white/50 dark:bg-black/20 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-xl text-center font-heading text-2xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all disabled:opacity-60 shadow-inner"
            />
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-end gap-3 w-5/12 text-right">
            <span className="font-heading text-xl sm:text-2xl text-slate-900 dark:text-white uppercase truncate">{match.away_team.short_name}</span>
            <img 
              src={`https://resources.premierleague.com/premierleague/badges/t${match.away_team.code}.png`} 
              alt={match.away_team.name} 
              className="w-10 h-10 object-contain flex-shrink-0 drop-shadow-md group-hover:scale-110 transition-transform duration-300" 
              onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }} 
            />
          </div>
        </div>

        {/* Action Button Area */}
        <div className="pt-4 border-t border-slate-200/50 dark:border-white/5 flex items-center justify-between gap-4">
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest min-h-[1.25rem] flex items-center gap-2">
            {state.success && <span className="text-emerald-600 dark:text-emerald-400 drop-shadow-sm">✓ {state.message}</span>}
            {state.error && <span className="text-rose-600 dark:text-rose-400 drop-shadow-sm">⚠ {state.error}</span>}
            {match.is_finished && match.home_score !== null && match.away_score !== null && (
              <span className="text-slate-500 dark:text-slate-400">
                Actual: <span className="font-heading text-lg text-slate-700 dark:text-slate-200">{match.home_score} - {match.away_score}</span>
              </span>
            )}
            {isPending && <span className="text-emerald-500 flex items-center gap-2"><div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div> Saving...</span>}
          </div>
          
          {match.is_finished && existingPick && existingPick.points_earned !== null && (
            <span className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold tracking-widest uppercase border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
              +{existingPick.points_earned} Pts
            </span>
          )}
        </div>
      </form>
    </div>
  )
}