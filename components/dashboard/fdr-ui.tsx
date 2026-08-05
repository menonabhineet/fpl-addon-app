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

  // We want to show a span of gameweeks, say next 8 gameweeks
  const visibleGameweeks = fplEvents.filter((e: any) => e.id >= nextGwId && e.id < nextGwId + 10).slice(0, 10);
  const visibleGwIds = visibleGameweeks.map((e: any) => e.id);

  // Group fixtures by team
  // For each team, we need an array of gameweeks. Some gameweeks might have blanks (0 fixtures), some double (2+ fixtures)
  const fdrData = teams.map((team: any) => {
    const fplTeamId = team.id; // FPL API uses 1-20 for team ids, assuming our local db matches or we use code?
    // In our test, FPL id is 1-20. The FPL fixtures have team_h and team_a referencing 1-20 ids.
    // Wait, let's verify if our 'teams' prop has id matching FPL.
    // In page.tsx: enhancedTeams has `id` from local db. Our test showed fplData.teams has id: 1 for Arsenal, etc.
    // FPL API fixtures use `team_h` and `team_a` which are FPL team IDs.
    
    // So we match by FPL team ID. Our teams table in supabase should ideally match FPL IDs. 
    // Let's assume `team.id` matches FPL id.
    
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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-3xl glass p-6 md:p-8"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div>
          <h2 className="text-2xl font-heading uppercase tracking-widest text-slate-900 dark:text-white drop-shadow-sm mb-2">Fixture Difficulty Rating</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Plan ahead by seeing upcoming opponent difficulties.</p>
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-1 mt-4 sm:mt-0 text-xs font-bold">
          <span className="mr-2 text-slate-500">Easy</span>
          <div className="w-6 h-6 flex items-center justify-center rounded-md bg-emerald-600 text-white">1</div>
          <div className="w-6 h-6 flex items-center justify-center rounded-md bg-emerald-400 text-slate-900">2</div>
          <div className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-200 text-slate-900">3</div>
          <div className="w-6 h-6 flex items-center justify-center rounded-md bg-rose-400 text-white">4</div>
          <div className="w-6 h-6 flex items-center justify-center rounded-md bg-rose-600 text-white">5</div>
          <span className="ml-2 text-slate-500">Hard</span>
        </div>
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="min-w-[800px]">
          {/* Header Row */}
          <div className="flex mb-4">
            <div className="w-40 flex-shrink-0 font-bold text-slate-500 text-sm">Team</div>
            <div className="flex flex-1">
              {visibleGameweeks.map((gw: any) => (
                <div key={gw.id} className={`flex-1 text-center font-bold text-xs ${gw.id === nextGwId ? 'text-emerald-500' : 'text-slate-500'}`}>
                  GW{gw.id}
                  {gw.id === nextGwId && <div className="text-[10px] uppercase tracking-widest mt-0.5">Next</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Teams Rows */}
          <div className="space-y-2">
            {fdrData.map((team: any) => (
              <div key={team.id} className="flex items-center">
                <div className="w-40 flex-shrink-0 flex items-center gap-3 font-bold text-slate-700 dark:text-slate-200">
                  <div className="w-6 h-6 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full font-heading text-xs">
                     {team.short_name}
                  </div>
                  <span className="truncate pr-2">{team.name}</span>
                </div>
                
                <div className="flex flex-1 gap-1">
                  {team.fdr.map((gwFdr: any, idx: number) => {
                    const isUpcoming = gwFdr.gwId === nextGwId;
                    return (
                      <div key={idx} className={`flex-1 flex flex-col gap-1 rounded-lg p-1 transition-all ${isUpcoming ? 'ring-2 ring-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-500/10' : ''}`}>
                        {gwFdr.fixtures.length === 0 ? (
                          <div className="w-full h-10 flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-bold border border-slate-200 dark:border-slate-700">
                            BLANK
                          </div>
                        ) : (
                          gwFdr.fixtures.map((fix: any, fIdx: number) => (
                            <div key={fIdx} className={`w-full h-10 flex items-center justify-center rounded-md text-xs font-bold shadow-sm ${getDifficultyColor(fix.difficulty)}`}>
                              {fix.opponentShortName} <span className="font-normal opacity-75 ml-1">({fix.isHome ? 'H' : 'A'})</span>
                            </div>
                          ))
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
