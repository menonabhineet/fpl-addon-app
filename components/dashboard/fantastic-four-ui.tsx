// components/dashboard/fantastic-four-ui.tsx
'use client'

import { useState, useActionState } from 'react'
import { submitFantasticFourPrediction } from '@/lib/actions/fantastic-four'

export default function FantasticFourUI({ players, currentGw, initialPicks, allUserFantasticPicks = [] }: any) {
  const [activeSlot, setActiveSlot] = useState<string | null>(null)
  const [infoSlot, setInfoSlot] = useState<string | null>(null)
  const [comparePlayerId, setComparePlayerId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClub, setSelectedClub] = useState('All')
  const [sortBy, setSortBy] = useState('name')

  const initialState = { success: false, message: '', error: '' }
  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => {
      formData.append('gameweekId', currentGw.id.toString())
      const result = await submitFantasticFourPrediction(formData)
      if (result.success) {
        setActiveSlot(null)
        return { success: true, message: result.message, error: '' }
      }
      return { success: false, message: '', error: result.error || 'Failed' }
    },
    initialState
  )

  // Transform array of picks into an easy lookup map by position
  const picksByPosition = initialPicks.reduce((acc: any, pick: any) => {
    const playerDetails = players.find((p: any) => p.id === pick.player_id)
    
    // Safely extract the team code (Supabase sometimes returns related data as an array or an object)
    let tCode = 0; // '0' maps to the generic FPL default grey shirt
    if (playerDetails?.teams) {
      if (Array.isArray(playerDetails.teams)) {
        tCode = playerDetails.teams[0]?.code || 0;
      } else {
        tCode = playerDetails.teams.code || 0;
      }
    }

    acc[pick.position] = {
      id: pick.player_id,
      name: pick.player_name,
      teamCode: tCode,
      points: pick.points_earned
    }
    return acc;
  }, {})

  const isPlayerDisabled = (p: any) => {
    // If the player is the current pick for this gameweek, they are not disabled from this check 
    if (picksByPosition[p.position]?.id === p.id) return false;

    const previousPicksForPlayer = allUserFantasticPicks.filter(
      (pick: any) => pick.player_id === p.id && pick.gameweek_id !== currentGw.id
    );

    if (p.position === 'DEF' || p.position === 'MID') {
      return previousPicksForPlayer.length > 0;
    }

    if (p.position === 'GK' || p.position === 'FWD') {
      const isFirstHalf = currentGw.id <= 19;
      const pickedInCurrentHalf = previousPicksForPlayer.some((pick: any) => {
        if (isFirstHalf) return pick.gameweek_id <= 19;
        return pick.gameweek_id > 19;
      });
      return pickedInCurrentHalf;
    }

    return false;
  };

  // Extract unique clubs for the filter
  const uniqueClubs = Array.from(new Set(players.map((p: any) => {
    if (p.teams) {
      return Array.isArray(p.teams) ? p.teams[0]?.name : p.teams.name
    }
    return null;
  }).filter(Boolean))).sort();

  let filteredPlayers = players.filter((p: any) => {
    if (p.position !== activeSlot) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    
    if (selectedClub !== 'All') {
      const clubName = p.teams ? (Array.isArray(p.teams) ? p.teams[0]?.name : p.teams.name) : null;
      if (clubName !== selectedClub) return false;
    }
    
    return true;
  });

  filteredPlayers = filteredPlayers.sort((a: any, b: any) => {
    if (sortBy === 'form') return (b.form || 0) - (a.form || 0);
    if (sortBy === 'points_per_game') return (b.points_per_game || 0) - (a.points_per_game || 0);
    if (sortBy === 'total_points') return (b.total_points || 0) - (a.total_points || 0);
    if (sortBy === 'selected_by_percent') return (b.selected_by_percent || 0) - (a.selected_by_percent || 0);
    return a.name.localeCompare(b.name);
  });

  const positions = ['FWD', 'MID', 'DEF', 'GK']

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl p-4 text-sm text-indigo-900 dark:text-indigo-300 transition-colors">
        📌 <strong>Gameweek {currentGw.id} Rules:</strong> Select your Fantastic Four. <strong>DEF/MID</strong> can be picked ONCE per season. <strong>GK/FWD</strong> can be picked ONCE per half-season. Click a player to swap them.
      </div>

      <div className="relative bg-green-600 dark:bg-green-800 rounded-2xl overflow-hidden shadow-inner border-4 border-green-700 dark:border-green-900 aspect-[3/4] sm:aspect-square md:aspect-video flex flex-col justify-evenly p-4 transition-colors">
        {/* Pitch Lines */}
        <div className="absolute inset-x-0 top-0 h-[10%] border-b-2 border-white/30" />
        <div className="absolute inset-x-[20%] top-0 h-[20%] border-x-2 border-b-2 border-white/30" />
        <div className="absolute inset-x-0 bottom-0 h-[10%] border-t-2 border-white/30" />
        <div className="absolute inset-x-[20%] bottom-0 h-[20%] border-x-2 border-t-2 border-white/30" />
        <div className="absolute inset-0 m-auto w-32 h-32 border-2 border-white/30 rounded-full" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/30" />

        {/* Player Slots */}
        <div className="relative z-10 h-full flex flex-col justify-around">
          {positions.map((pos) => {
            const selectedPlayer = picksByPosition[pos]

            return (
              <div key={pos} className="flex justify-center">
                <button 
                  onClick={() => { 
                    if (selectedPlayer) {
                      setInfoSlot(pos);
                    } else {
                      setActiveSlot(pos); 
                      setSearchQuery(''); 
                    }
                  }}
                  className="flex flex-col items-center group transition-all duration-200 hover:scale-105 outline-none"
                >
                  {selectedPlayer ? (
                    // Render Player Jersey and Details if Picked
                    <div className="flex flex-col items-center animate-fadeIn relative">
                      {/* Fixed height container ensures layout never collapses */}
                      <div className="w-14 h-16 flex items-end justify-center mb-1">
                        <img 
                          // Using the highly stable FPL specific CDN for shirts
                          src={`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${selectedPlayer.teamCode}-66.webp`} 
                          alt="Jersey"
                          className="w-12 h-auto object-contain drop-shadow-md group-hover:drop-shadow-xl transition-all"
                          onError={(e) => { 
                            // Fallback to the generic FPL grey shirt if code is missing
                            (e.target as HTMLImageElement).src = 'https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_0-66.webp' 
                          }}
                        />
                      </div>
                      <span className="px-2 py-0.5 bg-indigo-950 text-white dark:bg-slate-900 text-xs font-bold rounded shadow-md border border-indigo-800 dark:border-slate-700 max-w-[120px] truncate">
                        {selectedPlayer.name}
                      </span>
                      {selectedPlayer.points !== null && selectedPlayer.points !== undefined && (
                        <span className="mt-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-400 text-[11px] font-extrabold rounded shadow-sm border border-green-300 dark:border-green-800">
                          {selectedPlayer.points} Pts
                        </span>
                      )}
                    </div>
                  ) : (
                    // Render Add Button if Empty
                    <div className="w-12 h-12 rounded-full bg-slate-900/40 text-white font-bold text-xl flex items-center justify-center border-2 border-dashed border-white/50 group-hover:bg-slate-900/60 group-hover:border-white transition-all shadow-lg backdrop-blur-sm">
                      +
                    </div>
                  )}
                  
                  {!selectedPlayer && (
                     <span className="mt-2 px-2 py-0.5 bg-slate-900/80 text-white text-[10px] font-bold rounded uppercase tracking-wider">
                     {pos}
                   </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Player Info Overlay */}
        {infoSlot && (() => {
          const infoPlayerDetails = players.find((p: any) => p.id === picksByPosition[infoSlot]?.id);
          if (!infoPlayerDetails) return null;
          return (
            <div className="absolute inset-0 z-30 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200">
                <button onClick={() => setInfoSlot(null)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 z-10">
                  ✕
                </button>
                <div className="p-5 flex items-center gap-4 border-b border-slate-100 dark:border-slate-700 bg-indigo-50/50 dark:bg-slate-900/50">
                  <img 
                    src={`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${picksByPosition[infoSlot].teamCode}-66.webp`} 
                    alt="Jersey"
                    className="w-16 h-auto object-contain drop-shadow-md"
                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_0-66.webp' }}
                  />
                  <div>
                    <h3 className="font-bold text-xl text-slate-900 dark:text-white">{infoPlayerDetails.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                      {infoPlayerDetails.teams ? (Array.isArray(infoPlayerDetails.teams) ? infoPlayerDetails.teams[0]?.name : infoPlayerDetails.teams.name) : 'Unknown Club'} • {infoSlot}
                    </p>
                  </div>
                </div>
                
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                      <p className="text-[10px] uppercase font-bold text-slate-500">Upcoming Fixture</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{infoPlayerDetails.next_fixture || 'No fixture'}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                      <p className="text-[10px] uppercase font-bold text-slate-500">Status</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {infoPlayerDetails.status === 'a' ? (
                          <><span className="w-2 h-2 rounded-full bg-green-500"></span><span className="font-semibold text-green-700 dark:text-green-400">Available</span></>
                        ) : infoPlayerDetails.status === 'i' ? (
                          <><span className="w-2 h-2 rounded-full bg-red-500"></span><span className="font-semibold text-red-700 dark:text-red-400">Injured</span></>
                        ) : infoPlayerDetails.status === 'd' ? (
                          <><span className="w-2 h-2 rounded-full bg-yellow-500"></span><span className="font-semibold text-yellow-700 dark:text-yellow-400">Doubtful</span></>
                        ) : infoPlayerDetails.status === 's' ? (
                          <><span className="w-2 h-2 rounded-full bg-red-500"></span><span className="font-semibold text-red-700 dark:text-red-400">Suspended</span></>
                        ) : (
                          <><span className="w-2 h-2 rounded-full bg-orange-500"></span><span className="font-semibold text-orange-700 dark:text-orange-400">Unknown</span></>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700">
                      <p className="text-xs text-slate-500">Pts</p>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{infoPlayerDetails.total_points}</p>
                    </div>
                    <div className="text-center p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700">
                      <p className="text-xs text-slate-500">Form</p>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{infoPlayerDetails.form}</p>
                    </div>
                    <div className="text-center p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700">
                      <p className="text-xs text-slate-500">PPG</p>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{infoPlayerDetails.points_per_game}</p>
                    </div>
                    <div className="text-center p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700">
                      <p className="text-xs text-slate-500">TSB</p>
                      <p className="font-bold text-slate-800 dark:text-slate-200">{infoPlayerDetails.selected_by_percent}%</p>
                    </div>
                  </div>
                  
                  {infoPlayerDetails.news && (
                    <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-900/50">
                      {infoPlayerDetails.news}
                    </p>
                  )}

                  <button 
                    onClick={() => {
                      setInfoSlot(null);
                      setActiveSlot(infoSlot);
                      setSearchQuery('');
                    }}
                    className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md"
                  >
                    Swap Player
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Player Selection Overlay Drawer */}
        {activeSlot && (
          <div className="absolute inset-0 z-20 bg-white dark:bg-slate-900 flex flex-col transition-colors shadow-2xl">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 transition-colors">
              <h3 className="font-bold text-lg dark:text-white">Select {activeSlot}</h3>
              <button onClick={() => setActiveSlot(null)} className="text-slate-500 hover:text-slate-800 dark:hover:text-white font-bold px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded-full transition-colors">✕</button>
            </div>
            
            <div className="p-4 bg-white dark:bg-slate-900 space-y-3">
              <input 
                type="text" 
                placeholder="Search player name..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-colors outline-none"
              />
              
              <div className="flex gap-2">
                <select 
                  value={selectedClub}
                  onChange={(e) => setSelectedClub(e.target.value)}
                  className="flex-1 p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="All">All Clubs</option>
                  {(uniqueClubs as string[]).map((club) => (
                    <option key={club} value={club}>{club}</option>
                  ))}
                </select>

                <select 
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="flex-1 p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="name">Sort by Name</option>
                  <option value="form">Sort by Form</option>
                  <option value="points_per_game">Sort by PPG</option>
                  <option value="total_points">Sort by Total Points</option>
                  <option value="selected_by_percent">Sort by Ownership</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 bg-white dark:bg-slate-900">
              {filteredPlayers.length === 0 ? (
                <p className="text-center text-slate-500 mt-4">No players found.</p>
              ) : (
                filteredPlayers.map((p: any) => {
                  const disabled = isPlayerDisabled(p);

                  return (
                    <form action={formAction} key={p.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors">
                      <input type="hidden" name="playerId" value={p.id} />
                      <input type="hidden" name="playerName" value={p.name} />
                      <input type="hidden" name="position" value={p.position} />
                      
                      <div className="flex flex-col w-full sm:w-auto">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{p.name} <span className="text-xs font-normal text-slate-500">({p.teams ? (Array.isArray(p.teams) ? p.teams[0]?.short_name : p.teams.short_name) : ''})</span></span>
                        <div className="flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          <span>Fix: <strong>{p.next_fixture || 'None'}</strong></span>
                          <span>Form: <strong>{p.form}</strong></span>
                          <span>PPG: <strong>{p.points_per_game}</strong></span>
                          <span>Pts: <strong>{p.total_points}</strong></span>
                          <span>TSB: <strong>{p.selected_by_percent}%</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end w-full sm:w-auto mt-1 sm:mt-0">
                        <button 
                          type="button"
                          onClick={(e) => { e.preventDefault(); setComparePlayerId(p.id); }}
                          className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-1.5 rounded-md text-sm font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors shadow-sm"
                        >
                          Compare
                        </button>
                        <button 
                          type="submit" 
                          disabled={isPending || disabled}
                          className={`px-4 py-1.5 rounded-md text-sm font-bold shadow-sm ml-2 transition-colors ${
                            disabled 
                              ? 'bg-slate-400 text-slate-200 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400' 
                              : 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-slate-400'
                          }`}
                        >
                          {isPending ? '...' : disabled ? 'Max Reached' : 'Pick'}
                        </button>
                      </div>
                    </form>
                  )
                })
              )}
              {/* Comparison Overlay */}
              {comparePlayerId && (() => {
                const currentPickId = picksByPosition[activeSlot]?.id;
                const currentPlayer = currentPickId ? players.find((p: any) => p.id === currentPickId) : null;
                const candidatePlayer = players.find((p: any) => p.id === comparePlayerId);
                
                if (!candidatePlayer) return null;

                const renderCard = (player: any, title: string) => {
                  if (!player) {
                    return (
                      <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center p-4 min-h-[300px]">
                        <span className="text-slate-500 font-medium">Empty Slot</span>
                      </div>
                    );
                  }
                  
                  const teamCode = Array.isArray(player.teams) ? player.teams[0]?.code : player.teams?.code || 0;
                  return (
                    <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl shadow border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
                      <div className="bg-slate-100 dark:bg-slate-900 py-1.5 px-3 text-xs font-bold text-center text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                        {title}
                      </div>
                      <div className="p-3 flex flex-col items-center gap-2 border-b border-slate-100 dark:border-slate-700 bg-indigo-50/30 dark:bg-slate-900/30">
                        <img 
                          src={`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-66.webp`} 
                          alt="Jersey"
                          className="w-12 h-auto object-contain drop-shadow-sm"
                          onError={(e) => { (e.target as HTMLImageElement).src = 'https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_0-66.webp' }}
                        />
                        <div className="text-center">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">{player.name}</h3>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
                            {player.teams ? (Array.isArray(player.teams) ? player.teams[0]?.name : player.teams.name) : 'Unknown'}
                          </p>
                        </div>
                      </div>
                      <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                        <div className="flex justify-between items-center text-[11px] pb-1 border-b border-slate-100 dark:border-slate-700">
                          <span className="text-slate-500">Status</span>
                          <strong className="flex items-center gap-1 text-slate-800 dark:text-slate-200">
                            {player.status === 'a' && <><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>Available</>}
                            {player.status === 'i' && <><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>Injured</>}
                            {player.status === 'd' && <><span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>Doubtful</>}
                            {player.status === 's' && <><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>Suspended</>}
                            {!['a','i','d','s'].includes(player.status) && <><span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>Unknown</>}
                          </strong>
                        </div>
                        <div className="flex justify-between items-center text-[11px] pb-1 border-b border-slate-100 dark:border-slate-700">
                          <span className="text-slate-500">Fix</span>
                          <strong className="text-slate-800 dark:text-slate-200">{player.next_fixture || 'None'}</strong>
                        </div>
                        <div className="flex justify-between items-center text-[11px] pb-1 border-b border-slate-100 dark:border-slate-700">
                          <span className="text-slate-500">Pts</span>
                          <strong className="text-slate-800 dark:text-slate-200">{player.total_points}</strong>
                        </div>
                        <div className="flex justify-between items-center text-[11px] pb-1 border-b border-slate-100 dark:border-slate-700">
                          <span className="text-slate-500">Form</span>
                          <strong className="text-slate-800 dark:text-slate-200">{player.form}</strong>
                        </div>
                        <div className="flex justify-between items-center text-[11px] pb-1 border-b border-slate-100 dark:border-slate-700">
                          <span className="text-slate-500">PPG</span>
                          <strong className="text-slate-800 dark:text-slate-200">{player.points_per_game}</strong>
                        </div>
                        <div className="flex justify-between items-center text-[11px] pb-1 border-b border-slate-100 dark:border-slate-700">
                          <span className="text-slate-500">TSB</span>
                          <strong className="text-slate-800 dark:text-slate-200">{player.selected_by_percent}%</strong>
                        </div>
                      </div>
                    </div>
                  );
                };

                return (
                  <div className="absolute inset-0 z-30 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200 max-h-full">
                      <div className="flex justify-between items-center p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0">
                        <h3 className="font-bold text-lg dark:text-white">Compare Players</h3>
                        <button onClick={() => setComparePlayerId(null)} className="text-slate-500 hover:text-slate-800 dark:hover:text-white font-bold px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded-full transition-colors">✕</button>
                      </div>
                      <div className="p-2 sm:p-4 flex flex-row gap-2 sm:gap-4 flex-1 overflow-y-auto">
                        {renderCard(currentPlayer, "Current Pick")}
                        <div className="flex flex-col justify-center items-center font-bold text-slate-300 dark:text-slate-600 text-xl">VS</div>
                        {renderCard(candidatePlayer, "Candidate")}
                      </div>
                      <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 sm:gap-3 shrink-0">
                        <button onClick={() => setComparePlayerId(null)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-sm font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                          Cancel
                        </button>
                        <form action={formAction}>
                          <input type="hidden" name="playerId" value={candidatePlayer.id} />
                          <input type="hidden" name="playerName" value={candidatePlayer.name} />
                          <input type="hidden" name="position" value={candidatePlayer.position} />
                          <button 
                            type="submit"
                            disabled={isPending || isPlayerDisabled(candidatePlayer)}
                            className={`px-6 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors ${
                              isPlayerDisabled(candidatePlayer)
                                ? 'bg-slate-400 text-slate-200 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400'
                                : 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-slate-400'
                            }`}
                          >
                            {isPending ? 'Swapping...' : isPlayerDisabled(candidatePlayer) ? 'Max Reached' : 'Swap to Candidate'}
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Status Feedback */}
      <div className="text-center min-h-[1.5rem]">
        {state.success && <span className="text-green-600 dark:text-green-400 font-bold">✓ {state.message}</span>}
        {state.error && <span className="text-red-600 dark:text-red-400 font-bold">⚠ {state.error}</span>}
      </div>
    </div>
  )
}