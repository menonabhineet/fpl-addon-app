// components/dashboard/dashboard-tabs.tsx
'use client'

import { useState } from 'react'
import ScorePredictionsUI from './score-predictions-ui' // 1. Import it

type TabState = 'score' | 'team' | 'fantastic'

export default function DashboardTabs({ currentGw, fixtures, teams }: any) {
  const [activeTab, setActiveTab] = useState<TabState>('score')

  if (!currentGw) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-bold text-slate-800">No Active Gameweek</h2>
        <p className="text-slate-500 mt-2">The season is currently inactive. Check back later!</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex w-full overflow-hidden rounded-xl bg-white shadow-sm border border-slate-200">
        <button 
          onClick={() => setActiveTab('score')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'score' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          Score Predictions
        </button>
        <button 
          onClick={() => setActiveTab('team')}
          className={`flex-1 py-3 text-sm font-semibold border-l border-r border-slate-200 transition-colors ${activeTab === 'team' ? 'bg-indigo-600 text-white border-transparent' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          Team Pick
        </button>
        <button 
          onClick={() => setActiveTab('fantastic')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'fantastic' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          Fantastic Four
        </button>
      </div>

      {/* Render the Active Game UI */}
      <div className="min-h-[400px]">
        {activeTab === 'score' && (
          // 2. Render it here
          <ScorePredictionsUI fixtures={fixtures} currentGw={currentGw} />
        )}
        
        {activeTab === 'team' && (
          <div className="rounded-xl bg-white p-12 text-center text-slate-500 border border-slate-200 shadow-sm">
            [Team Prediction UI grid will go here next.]
          </div>
        )}
        
        {activeTab === 'fantastic' && (
          <div className="rounded-xl bg-white p-12 text-center text-slate-500 border border-slate-200 shadow-sm">
            [Fantastic Four Football Pitch UI will go here.]
          </div>
        )}
      </div>
    </div>
  )
}