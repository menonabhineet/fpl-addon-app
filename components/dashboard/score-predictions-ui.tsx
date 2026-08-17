// components/dashboard/score-predictions-ui.tsx
'use client'

import { useState, useTransition, useRef, useEffect, useMemo, memo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { submitScorePrediction, clearAllScorePredictions, removeIndividualScorePrediction } from '@/lib/actions/score-predictions'

// Famous derbies lookup helper for Premier League matches
export function getFamousDerby(homeTeam: any, awayTeam: any): string | null {
  const hRaw = (Array.isArray(homeTeam) ? homeTeam[0] : homeTeam) || {}
  const aRaw = (Array.isArray(awayTeam) ? awayTeam[0] : awayTeam) || {}

  const hShort = String(hRaw.short_name || '').toUpperCase().trim()
  const aShort = String(aRaw.short_name || '').toUpperCase().trim()
  const hName = String(hRaw.name || '').toUpperCase().trim()
  const aName = String(aRaw.name || '').toUpperCase().trim()

  const matchTeams = (t1: string, t2: string) => {
    return (hShort === t1 && aShort === t2) || (hShort === t2 && aShort === t1) ||
           (hName.includes(t1) && aName.includes(t2)) || (hName.includes(t2) && aName.includes(t1))
  }

  // 1. North London Derby: Arsenal vs Tottenham
  if (matchTeams('ARS', 'TOT') || matchTeams('ARSENAL', 'TOTTENHAM')) {
    return 'NORTH LONDON DERBY 🔴⚪'
  }

  // 2. Northwest Derby: Liverpool vs Manchester United
  if (matchTeams('LIV', 'MUN') || matchTeams('LIVERPOOL', 'MANCHESTER UNITED') || matchTeams('LIVERPOOL', 'MAN UTD')) {
    return 'NORTHWEST DERBY ⚔️'
  }

  // 3. Manchester Derby: Manchester City vs Manchester United
  if (matchTeams('MCI', 'MUN') || matchTeams('MANCHESTER CITY', 'MANCHESTER UNITED') || matchTeams('MAN CITY', 'MAN UTD')) {
    return 'MANCHESTER DERBY 🏙️'
  }

  // 4. Merseyside Derby: Liverpool vs Everton
  if (matchTeams('LIV', 'EVE') || matchTeams('LIVERPOOL', 'EVERTON')) {
    return 'MERSEYSIDE DERBY 🔵🔴'
  }

  // 5. West London Derby: Chelsea, Fulham, Brentford pairings
  if (
    matchTeams('CHE', 'FUL') || matchTeams('CHELSEA', 'FULHAM') ||
    matchTeams('CHE', 'BRE') || matchTeams('CHELSEA', 'BRENTFORD') ||
    matchTeams('FUL', 'BRE') || matchTeams('FULHAM', 'BRENTFORD')
  ) {
    return 'WEST LONDON DERBY 👑'
  }

  // 6. M23 Derby: Brighton vs Crystal Palace
  if (matchTeams('BHA', 'CRY') || matchTeams('BRIGHTON', 'CRYSTAL PALACE')) {
    return 'M23 DERBY 🦅🕊️'
  }

  // 7. Tyne-Wear Derby: Newcastle vs Sunderland
  if (matchTeams('NEW', 'SUN') || matchTeams('NEWCASTLE', 'SUNDERLAND')) {
    return 'TYNE-WEAR DERBY ⚡'
  }

  // 8. East Midlands Derby: Nottingham Forest vs Leicester City
  if (matchTeams('NFO', 'LEI') || matchTeams('NOTTINGHAM FOREST', 'LEICESTER') || matchTeams('NOTTINGHAM', 'LEICESTER')) {
    return 'EAST MIDLANDS DERBY 🌳'
  }

  // 9. Midlands Derby: Aston Villa vs Wolves
  if (matchTeams('AVL', 'WOL') || matchTeams('ASTON VILLA', 'WOLVES') || matchTeams('ASTON VILLA', 'WOLVERHAMPTON')) {
    return 'MIDLANDS DERBY 🦁'
  }

  // 10. South Coast Derby: Southampton vs Bournemouth / Brighton
  if (
    matchTeams('SOU', 'BOU') || matchTeams('SOUTHAMPTON', 'BOURNEMOUTH') ||
    matchTeams('SOU', 'BHA') || matchTeams('SOUTHAMPTON', 'BRIGHTON')
  ) {
    return 'SOUTH COAST DERBY 🌊'
  }

  // 11. Roses Rivalry: Leeds vs Manchester United
  if (matchTeams('LEE', 'MUN') || matchTeams('LEEDS', 'MANCHESTER UNITED') || matchTeams('LEEDS', 'MAN UTD')) {
    return 'ROSES RIVALRY 🌹'
  }

  return null
}

const ScorePredictionsUI = memo(function ScorePredictionsUI({ fixtures, currentGw, initialScorePicks }: any) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [currentScorePicks, setCurrentScorePicks] = useState<any[]>(initialScorePicks || [])
  const [showClearModal, setShowClearModal] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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
        toast.success(`All score predictions cleared for Gameweek ${currentGw.id}!`)
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

  const [showRules, setShowRules] = useState(false)

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      {/* Collapsible Rules Accordion */}
      <div className="glass rounded-2xl border border-emerald-500/20 overflow-hidden shadow-xs transition-all">
        <button
          type="button"
          onClick={() => setShowRules(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-emerald-500/5 transition-colors cursor-pointer"
          aria-expanded={showRules}
        >
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg">🎯</span>
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Score Pick Rules & Scoring
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{showRules ? 'Hide Rules' : 'View Rules'}</span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showRules ? 'rotate-180 text-emerald-500' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </button>

        {showRules && (
          <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-1 text-sm text-slate-700 dark:text-slate-300 space-y-2.5 border-t border-emerald-500/10 animate-in fade-in slide-in-from-top-2 duration-200">
            <p className="font-medium text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Predict the full-time scores for all selected fixtures this gameweek.
            </p>

            <div className="grid sm:grid-cols-3 gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 pt-0.5">
              <div className="flex items-center gap-2 bg-emerald-500/5 dark:bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                <span className="text-emerald-500 text-sm">🎯</span>
                <span><strong>Exact Score:</strong> <strong className="text-emerald-600 dark:text-emerald-400">3 pts</strong></span>
              </div>
              <div className="flex items-center gap-2 bg-sky-500/5 dark:bg-sky-500/10 p-2.5 rounded-xl border border-sky-500/20">
                <span className="text-sky-500 text-sm">✅</span>
                <span><strong>Correct Outcome:</strong> <strong className="text-sky-600 dark:text-sky-400">1 pt</strong> (Win/Draw)</span>
              </div>
              <div className="flex items-center gap-2 bg-amber-500/5 dark:bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                <span className="text-amber-500 text-sm">🔥</span>
                <span><strong>5+ Goal Bonus:</strong> <strong className="text-amber-600 dark:text-amber-400">+1 pt</strong> (Outcome + 5+ goals)</span>
              </div>
            </div>

            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 pt-0.5 leading-relaxed">
              💡 <strong>Tip:</strong> Predictions can be adjusted anytime before the gameweek deadline passes.
            </div>
          </div>
        )}
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
          {selectedFixtures.map((match: any, index: number) => {
            const pick = currentScorePicks.find((p: any) => p.fixture_id === match.id)
            return (
              <FixtureCard 
                key={match.id} 
                match={match} 
                existingPick={pick} 
                isLocked={isLocked}
                fixtureIndex={index}
                totalFixtures={selectedFixtures.length}
                onPickSaved={handlePickSaved}
                onPickRemoved={handlePickRemoved}
              />
            )
          })}
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {showClearModal && mounted && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowClearModal(false)}
        >
          <div 
            className="glass max-w-md w-full p-6 sm:p-8 rounded-3xl border border-white/10 bg-neutral-950/95 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
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
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={isClearing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-500 active:scale-95 shadow-lg shadow-rose-600/30 transition-all disabled:opacity-50 cursor-pointer"
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
        </div>,
        document.body
      )}
    </div>
  )
})

export default ScorePredictionsUI

function FixtureCard({ 
  match, 
  existingPick, 
  isLocked,
  fixtureIndex = 0,
  totalFixtures = 0,
  onPickSaved,
  onPickRemoved 
}: { 
  match: any, 
  existingPick?: any, 
  isLocked?: boolean,
  fixtureIndex?: number,
  totalFixtures?: number,
  onPickSaved?: (fixtureId: number, home: number, away: number) => void,
  onPickRemoved?: (fixtureId: number) => void 
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isRemoving, setIsRemoving] = useState(false)
  const [state, setState] = useState({ success: false, message: '', error: '' })
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const homeInputRef = useRef<HTMLInputElement>(null)
  const awayInputRef = useRef<HTMLInputElement>(null)

  const [currentHomeScore, setCurrentHomeScore] = useState<string | number>(existingPick?.predicted_home_score ?? '')
  const [currentAwayScore, setCurrentAwayScore] = useState<string | number>(existingPick?.predicted_away_score ?? '')

  // Keep input values in sync with existingPick prop (e.g. on clear all)
  useEffect(() => {
    setCurrentHomeScore(existingPick?.predicted_home_score ?? '')
    setCurrentAwayScore(existingPick?.predicted_away_score ?? '')
  }, [existingPick?.predicted_home_score, existingPick?.predicted_away_score])

  const homeNum = Number(currentHomeScore)
  const awayNum = Number(currentAwayScore)
  const hasBothScores = currentHomeScore !== '' && currentAwayScore !== '' && !isNaN(homeNum) && !isNaN(awayNum)

  const totalGoals = (Number(currentHomeScore) || 0) + (Number(currentAwayScore) || 0)
  const goalDiff = Math.abs(homeNum - awayNum)

  const is00 = hasBothScores && homeNum === 0 && awayNum === 0
  const isMassacre = hasBothScores && goalDiff >= 4
  const isGoalFest = hasBothScores && totalGoals >= 5 && !isMassacre

  // Zero-zero randomized tag: randomly select between "PARK THE BUS" and "BORE DRAW"
  const [zeroZeroTag, setZeroZeroTag] = useState(() => Math.random() < 0.5 ? 'PARK THE BUS' : 'BORE DRAW')

  useEffect(() => {
    if (is00) {
      setZeroZeroTag(Math.random() < 0.5 ? 'PARK THE BUS' : 'BORE DRAW')
    }
  }, [is00, currentHomeScore, currentAwayScore])

  const famousDerby = useMemo(() => getFamousDerby(match.home_team, match.away_team), [match.home_team, match.away_team])

  const triggerAutoSave = (homeScore: string | number, awayScore: string | number) => {
    const homeStr = String(homeScore).trim()
    const awayStr = String(awayScore).trim()

    if (homeStr !== '' && awayStr !== '') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      
      debounceRef.current = setTimeout(() => {
        startTransition(async () => {
          const formData = new FormData()
          formData.append('fixtureId', String(match.id))
          formData.append('homeScore', homeStr)
          formData.append('awayScore', awayStr)

          const result = await submitScorePrediction(formData)
          const homeName = match.home_team?.short_name || match.home_team?.name || 'Home'
          const awayName = match.away_team?.short_name || match.away_team?.name || 'Away'

          if (result.success) {
            setState({ success: true, message: `${homeStr}-${awayStr} saved!`, error: '' })
            if (onPickSaved) {
              onPickSaved(match.id, Number(homeStr), Number(awayStr))
            }
            toast.success(`Score prediction saved: ${homeName} ${homeStr} - ${awayStr} ${awayName}`)
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            timeoutRef.current = setTimeout(() => {
              setState(prev => ({ ...prev, success: false, message: '' }))
            }, 3000)
          } else {
            setState({ success: false, message: '', error: result.error || 'Failed' })
            toast.error(result.error || `Failed to save prediction for ${homeName} vs ${awayName}`)
          }
        })
      }, 600)
    }
  }

  const handleHomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setCurrentHomeScore(val)
    triggerAutoSave(val, currentAwayScore)

    // Auto-advance cursor to away input when home score is typed
    if (val !== '') {
      awayInputRef.current?.focus()
      awayInputRef.current?.select()
    }
  }

  const handleAwayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setCurrentAwayScore(val)
    triggerAutoSave(currentHomeScore, val)

    // Auto-advance cursor to the next fixture card's home input when away score is typed
    if (val !== '' && fixtureIndex + 1 < totalFixtures) {
      const nextHomeInput = document.querySelector(`[data-fixture-input="home-${fixtureIndex + 1}"]`) as HTMLInputElement
      if (nextHomeInput) {
        nextHomeInput.focus()
        nextHomeInput.select()
      }
    }
  }

  const handleHomeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && currentHomeScore === '' && fixtureIndex > 0) {
      const prevAwayInput = document.querySelector(`[data-fixture-input="away-${fixtureIndex - 1}"]`) as HTMLInputElement
      if (prevAwayInput) {
        prevAwayInput.focus()
        prevAwayInput.select()
      }
    }
  }

  const handleAwayKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && currentAwayScore === '') {
      homeInputRef.current?.focus()
      homeInputRef.current?.select()
    }
  }

  const handleHomeStep = (delta: number) => {
    if (isLocked || match.is_finished) return
    const current = currentHomeScore === '' ? 0 : Number(currentHomeScore)
    const next = Math.max(0, Math.min(20, current + delta))
    setCurrentHomeScore(String(next))
    triggerAutoSave(next, currentAwayScore)
  }

  const handleAwayStep = (delta: number) => {
    if (isLocked || match.is_finished) return
    const current = currentAwayScore === '' ? 0 : Number(currentAwayScore)
    const next = Math.max(0, Math.min(20, current + delta))
    setCurrentAwayScore(String(next))
    triggerAutoSave(currentHomeScore, next)
  }

  const handleRemoveIndividual = async () => {
    if (isLocked || match.is_finished) return
    const homeName = match.home_team?.short_name || match.home_team?.name || 'Home'
    const awayName = match.away_team?.short_name || match.away_team?.name || 'Away'
    const matchName = `${homeName} vs ${awayName}`

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
        toast.success(`Removed prediction for ${matchName}`)
      } else {
        toast.error(res.error || `Failed to remove prediction for ${matchName}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to remove prediction for ${matchName}`
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
      
      <div className="bg-black/5 dark:bg-black/20 px-4 sm:px-6 py-3 border-b border-slate-200/50 dark:border-white/5 flex flex-wrap justify-between items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-bold tracking-widest uppercase relative z-10">
        <div className="flex items-center gap-2 flex-wrap">
          <span>{formattedTime}</span>
          {famousDerby && (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-purple-500/40 bg-purple-500/10 text-[9px] sm:text-[10px] text-purple-600 dark:text-purple-400 font-black shadow-[0_0_10px_rgba(168,85,247,0.2)] animate-in zoom-in duration-300">
              {famousDerby}
            </span>
          )}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {is00 && (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-indigo-500/40 bg-indigo-500/10 text-[9px] sm:text-[10px] text-indigo-600 dark:text-indigo-400 font-black shadow-[0_0_10px_rgba(99,102,241,0.2)] animate-in zoom-in duration-300">
              {zeroZeroTag === 'PARK THE BUS' ? '🚌 PARK THE BUS' : '🥱 BORE DRAW'}
            </span>
          )}
          {isMassacre && (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-rose-500/40 bg-rose-500/10 text-[9px] sm:text-[10px] text-rose-600 dark:text-rose-400 font-black shadow-[0_0_10px_rgba(244,63,94,0.2)] animate-in zoom-in duration-300">
              <svg className="w-3 h-3 fill-rose-500 drop-shadow-sm" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.527.82-1.17 2.05-1.923 3.49C7.26 8.35 6 10.97 6 13a6 6 0 1012 0c0-1.74-.83-3.69-1.99-5.59-.75-1.23-1.63-2.35-2.45-3.32-.42-.5-.83-.98-1.165-1.537z" clipRule="evenodd" /></svg>
              MASSACRE
            </span>
          )}
          {isGoalFest && (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-[9px] sm:text-[10px] text-amber-600 dark:text-amber-400 font-black shadow-[0_0_10px_rgba(245,158,11,0.2)] animate-in zoom-in duration-300">
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

      <div className="p-6 space-y-6 flex-1 flex flex-col justify-between relative z-10">
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

          {/* Stepper Scores Area */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 justify-center relative shrink-0">
            {/* Home Stepper */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                disabled={match.is_finished || isLocked || Number(currentHomeScore) >= 20}
                onClick={() => handleHomeStep(1)}
                className="w-10 sm:w-12 h-5 rounded-t-lg bg-white/60 dark:bg-white/5 hover:bg-emerald-500/20 active:bg-emerald-500/30 flex items-center justify-center text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border-t border-x border-slate-200/80 dark:border-white/10 transition-colors disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                title="Increase home score"
              >
                ▲
              </button>
              <input 
                ref={homeInputRef}
                data-fixture-input={`home-${fixtureIndex}`}
                type="text" 
                inputMode="numeric"
                pattern="[0-9]*"
                name="homeScore" 
                disabled={match.is_finished || isLocked}
                value={currentHomeScore}
                onChange={handleHomeChange}
                onKeyDown={handleHomeKeyDown}
                onFocus={(e) => e.target.select()}
                className="w-10 sm:w-12 h-10 sm:h-11 bg-white/70 dark:bg-black/30 backdrop-blur-md border-x border-slate-200/80 dark:border-white/10 text-center font-heading text-xl sm:text-2xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all disabled:opacity-60 shadow-inner"
              />
              <button
                type="button"
                disabled={match.is_finished || isLocked || Number(currentHomeScore) <= 0 || currentHomeScore === ''}
                onClick={() => handleHomeStep(-1)}
                className="w-10 sm:w-12 h-5 rounded-b-lg bg-white/60 dark:bg-white/5 hover:bg-emerald-500/20 active:bg-emerald-500/30 flex items-center justify-center text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border-b border-x border-slate-200/80 dark:border-white/10 transition-colors disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                title="Decrease home score"
              >
                ▼
              </button>
            </div>

            <span className="text-slate-400 font-bold text-lg">-</span>

            {/* Away Stepper */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                disabled={match.is_finished || isLocked || Number(currentAwayScore) >= 20}
                onClick={() => handleAwayStep(1)}
                className="w-10 sm:w-12 h-5 rounded-t-lg bg-white/60 dark:bg-white/5 hover:bg-emerald-500/20 active:bg-emerald-500/30 flex items-center justify-center text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border-t border-x border-slate-200/80 dark:border-white/10 transition-colors disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                title="Increase away score"
              >
                ▲
              </button>
              <input 
                ref={awayInputRef}
                data-fixture-input={`away-${fixtureIndex}`}
                type="text" 
                inputMode="numeric"
                pattern="[0-9]*"
                name="awayScore" 
                disabled={match.is_finished || isLocked}
                value={currentAwayScore}
                onChange={handleAwayChange}
                onKeyDown={handleAwayKeyDown}
                onFocus={(e) => e.target.select()}
                className="w-10 sm:w-12 h-10 sm:h-11 bg-white/70 dark:bg-black/30 backdrop-blur-md border-x border-slate-200/80 dark:border-white/10 text-center font-heading text-xl sm:text-2xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all disabled:opacity-60 shadow-inner"
              />
              <button
                type="button"
                disabled={match.is_finished || isLocked || Number(currentAwayScore) <= 0 || currentAwayScore === ''}
                onClick={() => handleAwayStep(-1)}
                className="w-10 sm:w-12 h-5 rounded-b-lg bg-white/60 dark:bg-white/5 hover:bg-emerald-500/20 active:bg-emerald-500/30 flex items-center justify-center text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border-b border-x border-slate-200/80 dark:border-white/10 transition-colors disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                title="Decrease away score"
              >
                ▼
              </button>
            </div>
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
      </div>
    </div>
  )
}