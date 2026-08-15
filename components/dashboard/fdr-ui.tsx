'use client'

import { motion } from 'framer-motion'

export default function FdrUI({ teams, fplFixtures, fplEvents, currentGwId }: any) {
  if (!fplFixtures || !fplFixtures.length || !fplEvents || !fplEvents.length) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 p-8 text-center shadow-sm border border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">Loading FDR Data...</h2>
      </div>
    )
  }

  // Find the next gameweek
  const nextEvent = fplEvents.find((e: any) => e.is_next) || fplEvents.find((e: any) => e.is_current) || fplEvents[0];
  const nextGwId = nextEvent?.id || currentGwId || 1;

  // We want to show a span of gameweeks, say next 10 gameweeks
  const visibleGameweeks = fplEvents.filter((e: any) => e.id >= nextGwId && e.id < nextGwId + 10).slice(0, 10);
  const visibleGwIds = visibleGameweeks.map((e: any) => e.id);

  // Group fixtures by team
  const fdrData = teams.map((team: any) => {
    const teamFixtures = visibleGwIds.map((gwId: number) => {
      const fixturesForGw = fplFixtures.filter((f: any) => f.event === gwId && (f.team_h === team.id || f.team_a === team.id));
      return {
        gwId,
        fixtures: fixturesForGw.map((f: any) => {
          const isHome = f.team_h === team.id;
          const opponentId = isHome ? f.team_a : f.team_h;
          const opponent = teams.find((t: any) => t.id === opponentId);
          const difficulty = isHome ? f.team_h_difficulty : f.team_a_difficulty;
          return {
            opponentShortName: opponent ? opponent.short_name : 'N/A',
            isHome,
            difficulty
          }
        })
      }
    });

    return {
      ...team,
      fdr: teamFixtures
    };
  });

  const getDifficultyColor = (difficulty: number) => {
    switch (difficulty) {
      case 1: return 'bg-emerald-600 dark:bg-emerald-700 text-white';
      case 2: return 'bg-emerald-400 dark:bg-emerald-500 text-slate-900';
      case 3: return 'bg-slate-200 dark:bg-slate-300 text-slate-900';
      case 4: return 'bg-rose-400 dark:bg-rose-500 text-white';
      case 5: return 'bg-rose-600 dark:bg-rose-700 text-white';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-500';
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-3xl glass p-4 sm:p-6 md:p-8"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-heading uppercase tracking-widest text-slate-900 dark:text-white drop-shadow-sm mb-1">Fixture Difficulty Rating</h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Plan ahead by seeing upcoming opponent difficulties.</p>
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-1.5 text-xs font-bold bg-white/40 dark:bg-black/20 px-3 py-1.5 rounded-xl border border-slate-200/50 dark:border-white/5">
          <span className="mr-1 text-slate-500">Easy</span>
          <div className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-md bg-emerald-600 text-white text-[11px] shadow-sm">1</div>
          <div className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-md bg-emerald-400 text-slate-900 text-[11px] shadow-sm">2</div>
          <div className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-md bg-slate-200 text-slate-900 text-[11px] shadow-sm">3</div>
          <div className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-md bg-rose-400 text-white text-[11px] shadow-sm">4</div>
          <div className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-md bg-rose-600 text-white text-[11px] shadow-sm">5</div>
          <span className="ml-1 text-slate-500">Hard</span>
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-sm">
        <table className="w-full text-sm text-left border-separate border-spacing-0">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-neutral-900/80">
              <th className="px-4 py-3 sticky left-0 z-30 bg-white dark:bg-[#121316] font-bold text-slate-600 dark:text-slate-300 text-xs sm:text-sm uppercase tracking-wider w-36 sm:w-48 border-b border-r border-slate-200 dark:border-white/10 shadow-[4px_0_12px_rgba(0,0,0,0.08)] dark:shadow-[4px_0_16px_rgba(0,0,0,0.6)]">
                Team
              </th>
              {visibleGameweeks.map((gw: any) => (
                <th key={gw.id} className={`px-2 py-3 min-w-[76px] sm:min-w-[88px] text-center font-bold text-xs border-b border-slate-200 dark:border-white/10 ${gw.id === nextGwId ? 'text-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10' : 'text-slate-500'}`}>
                  <div>GW{gw.id}</div>
                  {gw.id === nextGwId && <div className="text-[9px] uppercase tracking-widest mt-0.5 font-black text-emerald-500">Next</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fdrData.map((team: any, rIdx: number) => {
              const isLastRow = rIdx === fdrData.length - 1;
              return (
                <tr key={team.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                  <td className={`px-4 py-2.5 sticky left-0 z-20 bg-white dark:bg-[#121316] border-r border-slate-200 dark:border-white/10 shadow-[4px_0_12px_rgba(0,0,0,0.08)] dark:shadow-[4px_0_16px_rgba(0,0,0,0.6)] ${!isLastRow ? 'border-b border-slate-200/80 dark:border-white/10' : ''}`}>
                    <div className="flex items-center gap-2.5 font-bold text-slate-800 dark:text-slate-200">
                      <div className="w-7 h-7 shrink-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full font-heading text-xs text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-white/10 shadow-inner">
                        {team.short_name}
                      </div>
                      <span className="truncate text-xs sm:text-sm font-semibold">{team.name}</span>
                    </div>
                  </td>
                  
                  {team.fdr.map((gwFdr: any, idx: number) => {
                    const isUpcoming = gwFdr.gwId === nextGwId;
                    return (
                      <td key={idx} className={`p-1.5 align-middle ${!isLastRow ? 'border-b border-slate-200/60 dark:border-white/5' : ''}`}>
                        <div className={`w-full flex flex-col gap-1 rounded-xl p-1 transition-all ${isUpcoming ? 'ring-2 ring-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/10' : ''}`}>
                          {gwFdr.fixtures.length === 0 ? (
                            <div className="w-full h-10 flex items-center justify-center rounded-lg bg-slate-100/70 dark:bg-slate-800/60 text-slate-400 text-[11px] font-bold border border-slate-200/50 dark:border-slate-700/50">
                              BLANK
                            </div>
                          ) : (
                            gwFdr.fixtures.map((fix: any, fIdx: number) => (
                              <div key={fIdx} className={`w-full h-10 flex items-center justify-center rounded-lg text-xs font-bold shadow-sm transition-transform hover:scale-[1.03] ${getDifficultyColor(fix.difficulty)}`}>
                                <span>{fix.opponentShortName}</span>
                                <span className="font-normal opacity-80 text-[10px] ml-1">({fix.isHome ? 'H' : 'A'})</span>
                              </div>
                            ))
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
