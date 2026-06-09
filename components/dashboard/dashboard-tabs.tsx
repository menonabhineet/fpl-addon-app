// components/dashboard/dashboard-tabs.tsx
'use client'

import { useState } from 'react'
import ScorePredictionsUI from './score-predictions-ui'
import TeamPredictionUI from './team-prediction-ui'
import FantasticFourUI from './fantastic-four-ui'


type TabState = 'score' | 'team' | 'fantastic'

export default function DashboardTabs({ currentGw, fixtures, teams, players, initialPicks }: any) {
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
      {/* Tab Navigation */}
      <div className="flex w-full overflow-hidden rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors duration-300">
        <button 
          onClick={() => setActiveTab('score')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'score' 
              ? 'bg-indigo-600 text-white' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          Score Predictions
        </button>
        <button 
          onClick={() => setActiveTab('team')}
          className={`flex-1 py-3 text-sm font-semibold border-l border-r border-slate-200 dark:border-slate-800 transition-colors ${
            activeTab === 'team' 
              ? 'bg-indigo-600 text-white border-transparent' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          Team Pick
        </button>
        <button 
          onClick={() => setActiveTab('fantastic')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'fantastic' 
              ? 'bg-indigo-600 text-white' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          Fantastic Four
        </button>
      </div>

      {/* Render the Active Game UI */}
      <div className="min-h-[400px]">
        {activeTab === 'score' && (
          <ScorePredictionsUI fixtures={fixtures} currentGw={currentGw} />
        )}
        
        {activeTab === 'team' && (
          <TeamPredictionUI teams={teams} currentGw={currentGw} />
        )}
        
        {activeTab === 'fantastic' && (
          <FantasticFourUI players={players} currentGw={currentGw} initialPicks={initialPicks}/>
        )}
      </div>
    </div>
  )
}