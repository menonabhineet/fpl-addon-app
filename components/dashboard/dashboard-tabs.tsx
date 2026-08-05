// components/dashboard/dashboard-tabs.tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ScorePredictionsUI from './score-predictions-ui'
import TeamPredictionUI from './team-prediction-ui'
import FantasticFourUI from './fantastic-four-ui'
import LeaderboardUI from './leaderboard-ui'
import FdrUI from './fdr-ui'

type TabState = 'score' | 'team' | 'fantastic' | 'leaderboard' | 'fdr'

export default function DashboardTabs({ currentGw, fixtures, teams, players, initialPicks, initialTeamPick, initialScorePicks, leaderboard, allUserTeamPicks, allUserFantasticPicks, fplFixtures, fplEvents }: any) {
  const [activeTab, setActiveTab] = useState<TabState>('score')

  if (!currentGw) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 p-8 text-center shadow-sm border border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">No Active Gameweek</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">The season is currently inactive. Check back later!</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 3D Card Navigation */}
      <div className="flex overflow-x-auto lg:grid lg:grid-cols-5 gap-3 sm:gap-4 md:gap-6 mb-4 md:mb-12 pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 lg:pb-0 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {(['score', 'team', 'fantastic', 'leaderboard', 'fdr'] as TabState[]).map((tab) => (
          <button
            key={tab}
            onClick={(e) => {
              setActiveTab(tab);
              // Auto-scroll the clicked tab into the center of the view on mobile
              e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
            className={`group relative flex-none w-[120px] sm:w-[140px] lg:w-auto flex flex-col items-center justify-center py-4 px-2 sm:p-6 md:p-8 rounded-2xl md:rounded-3xl transition-all duration-500 overflow-hidden text-center snap-center ${
              activeTab === tab
                ? 'glass scale-[1.02] border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.2)] dark:shadow-[0_0_40px_rgba(16,185,129,0.15)] z-10'
                : 'bg-white/40 dark:bg-black/20 backdrop-blur-md border border-slate-200/50 dark:border-white/5 hover:scale-[1.02] hover:bg-white/60 dark:hover:bg-white/5 hover:border-slate-300 dark:hover:border-white/20 transition-all duration-300 opacity-80 hover:opacity-100 cursor-pointer shadow-sm'
            }`}
          >
            {activeTab === tab && (
              <div className="absolute inset-0 bg-emerald-500/5 blur-2xl pointer-events-none" />
            )}
            
            <div className={`text-2xl sm:text-3xl md:text-4xl mb-1.5 sm:mb-3 md:mb-4 transition-transform duration-500 ${activeTab === tab ? 'scale-110' : 'group-hover:scale-110 group-hover:-translate-y-1'}`}>
              {tab === 'score' && '🎯'}
              {tab === 'team' && '🛡️'}
              {tab === 'fantastic' && '⚡'}
              {tab === 'leaderboard' && '🏆'}
              {tab === 'fdr' && '📅'}
            </div>
            
            <span className={`font-heading uppercase tracking-widest text-[10px] sm:text-sm md:text-xl transition-colors duration-300 relative z-10 ${
              activeTab === tab 
                ? 'text-emerald-600 dark:text-emerald-400 drop-shadow-sm' 
                : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200'
            }`}>
              {tab === 'score' && 'Score Picks'}
              {tab === 'team' && 'Team Pick'}
              {tab === 'fantastic' && 'Fantastic Four'}
              {tab === 'leaderboard' && 'Leaderboard'}
              {tab === 'fdr' && 'FDR'}
            </span>
          </button>
        ))}
      </div>

      {/* Render the Active Game UI */}
      <div className="min-h-[400px] relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {activeTab === 'score' && (
              <ScorePredictionsUI fixtures={fixtures} currentGw={currentGw} initialScorePicks={initialScorePicks} />
            )}
            
            {activeTab === 'team' && (
              <TeamPredictionUI teams={teams} currentGw={currentGw} initialTeamPick={initialTeamPick} allUserTeamPicks={allUserTeamPicks} fixtures={fixtures} />
            )}
            
            {activeTab === 'fantastic' && (
              <FantasticFourUI players={players} currentGw={currentGw} initialPicks={initialPicks} allUserFantasticPicks={allUserFantasticPicks} />
            )}

            {activeTab === 'leaderboard' && (
              <LeaderboardUI allScores={leaderboard} currentGwId={currentGw.id} />
            )}

            {activeTab === 'fdr' && (
              <FdrUI teams={teams} fplFixtures={fplFixtures} fplEvents={fplEvents} currentGwId={currentGw.id} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}