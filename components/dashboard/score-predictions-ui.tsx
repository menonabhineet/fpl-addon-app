// components/dashboard/score-predictions-ui.tsx
'use client'

import { useState, useTransition, useRef } from 'react'
import { submitScorePrediction } from '@/lib/actions/score-predictions'

export default function ScorePredictionsUI({ fixtures, currentGw, initialScorePicks }: any) {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="glass rounded-xl p-4 text-sm text-slate-700 dark:text-slate-300 border-emerald-500/30 border-l-4">
        📌 <strong className="text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Score Pick Rules:</strong> Predict the exact score for all matches. Exact score = <strong className="text-emerald-500 font-bold text-lg">3 pts</strong>. Correct outcome (win/draw/loss) = <strong className="text-emerald-500 font-bold text-lg">1 pt</strong>. High-scoring bonus (Correct outcome AND both actual & predicted total goals are 5+) = <strong className="text-emerald-500 font-bold text-lg">+1 pt</strong>. Failure to submit any predictions before the deadline = <strong className="text-rose-500 font-bold text-lg">-1 pt</strong> penalty.
      </div>

      {fixtures.filter((m: any) => m.is_selected).length === 0 ? (
        <div className="glass rounded-3xl p-12 text-center">
          <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">The admin has not selected the fixtures for this gameweek yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {fixtures.filter((m: any) => m.is_selected).map((match: any) => {
            // Find if the user has already predicted this specific fixture
            const pick = initialScorePicks?.find((p: any) => p.fixture_id === match.id)
            return <FixtureCard key={match.id} match={match} existingPick={pick} />
          })}
        </div>
      )}
    </div>
  )
}

function FixtureCard({ match, existingPick }: { match: any, existingPick?: any }) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState({ success: false, message: '', error: '' });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const [currentHomeScore, setCurrentHomeScore] = useState<string | number>(existingPick?.predicted_home_score ?? '');
  const [currentAwayScore, setCurrentAwayScore] = useState<string | number>(existingPick?.predicted_away_score ?? '');

  const totalGoals = (Number(currentHomeScore) || 0) + (Number(currentAwayScore) || 0);
  const isGoalFest = currentHomeScore !== '' && currentAwayScore !== '' && totalGoals >= 5;

  const handleScoreChange = (e: React.ChangeEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const formData = new FormData(form);
    const homeScore = formData.get('homeScore') as string;
    const awayScore = formData.get('awayScore') as string;

    setCurrentHomeScore(homeScore);
    setCurrentAwayScore(awayScore);

    if (homeScore !== '' && awayScore !== '') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      
      debounceRef.current = setTimeout(() => {
        startTransition(async () => {
          const result = await submitScorePrediction(formData);
          if (result.success) {
            setState({ success: true, message: `${homeScore}-${awayScore} saved!`, error: '' });
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
              setState(prev => ({ ...prev, success: false, message: '' }));
            }, 3000);
          } else {
            setState({ success: false, message: '', error: result.error || 'Failed' });
          }
        });
      }, 750); // 750ms debounce
    }
  };

  const formattedTime = new Date(match.kickoff_time).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })

  return (
    <div className={`relative glass rounded-3xl overflow-hidden flex flex-col justify-between transition-all duration-300 group hover:scale-[1.01] hover:border-white/20 hover:shadow-[0_0_25px_rgba(255,255,255,0.05)] ${existingPick ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : ''}`}>
      {existingPick && <div className="absolute inset-0 bg-emerald-500/5 blur-xl pointer-events-none" />}
      
      <div className="bg-black/5 dark:bg-black/20 px-6 py-3 border-b border-slate-200/50 dark:border-white/5 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 font-bold tracking-widest uppercase relative z-10">
        <span>{formattedTime}</span>
        <div className="flex gap-2 items-center">
          {isGoalFest && (
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-[9px] sm:text-[10px] text-amber-600 dark:text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)] animate-in zoom-in duration-300">
              <svg className="w-3 h-3 fill-amber-500 drop-shadow-sm" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" /></svg>
              THRILLER
            </span>
          )}
          {existingPick && <span className="text-emerald-600 dark:text-emerald-400 drop-shadow-sm">✓ Locked</span>}
          {match.is_finished && <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded text-[10px]">FT</span>}
        </div>
      </div>

      <form onChange={handleScoreChange} className="p-6 space-y-6 flex-1 flex flex-col justify-between relative z-10">
        <input type="hidden" name="fixtureId" value={match.id} />
        
        <div className="flex items-center justify-between gap-2">
          {/* Home Team */}
          <div className="flex items-center gap-3 w-5/12">
            <img src={`https://resources.premierleague.com/premierleague/badges/t${match.home_team.code}.png`} alt={match.home_team.name} className="w-10 h-10 object-contain flex-shrink-0 drop-shadow-md group-hover:scale-110 transition-transform duration-300" onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }} />
            <span className="font-heading text-xl sm:text-2xl text-slate-900 dark:text-white uppercase truncate">{match.home_team.short_name}</span>
          </div>

          <div className="flex items-center gap-2 w-2/12 justify-center relative">
            <input 
              type="number" name="homeScore" min="0" required disabled={match.is_finished}
              defaultValue={existingPick?.predicted_home_score ?? ''}
              className="w-12 h-12 bg-white/50 dark:bg-black/20 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-xl text-center font-heading text-2xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all disabled:opacity-60 shadow-inner"
            />
            <span className="text-slate-400 font-bold">-</span>
            <input 
              type="number" name="awayScore" min="0" required disabled={match.is_finished}
              defaultValue={existingPick?.predicted_away_score ?? ''}
              className="w-12 h-12 bg-white/50 dark:bg-black/20 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-xl text-center font-heading text-2xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all disabled:opacity-60 shadow-inner"
            />
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-end gap-3 w-5/12 text-right">
            <span className="font-heading text-xl sm:text-2xl text-slate-900 dark:text-white uppercase truncate">{match.away_team.short_name}</span>
            <img src={`https://resources.premierleague.com/premierleague/badges/t${match.away_team.code}.png`} alt={match.away_team.name} className="w-10 h-10 object-contain flex-shrink-0 drop-shadow-md group-hover:scale-110 transition-transform duration-300" onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }} />
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