// components/dashboard/fantastic-four-ui.tsx
'use client'

import { useState, useActionState, useEffect, useMemo, useDeferredValue, memo } from 'react'
import { useRouter } from 'next/navigation'
import { submitFantasticFourPrediction, removeFantasticFourPick, clearAllFantasticFourPicks } from '@/lib/actions/fantastic-four'
import { toast } from 'sonner'

const FantasticFourUI = memo(function FantasticFourUI({ players = [], currentGw, initialPicks = [], allUserFantasticPicks = [] }: any) {
  const router = useRouter()
  const [currentPicks, setCurrentPicks] = useState<any[]>(initialPicks || [])
  const [activeSlot, setActiveSlot] = useState<string | null>(null)
  const [infoSlot, setInfoSlot] = useState<string | null>(null)
  const [comparePlayerId, setComparePlayerId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [selectedClub, setSelectedClub] = useState('All')
  const [sortBy, setSortBy] = useState('name')
  const [displayLimit, setDisplayLimit] = useState(35)

  const [removingPos, setRemovingPos] = useState<string | null>(null)
  const [isClearing, setIsClearing] = useState(false)
  const [showClearModal, setShowClearModal] = useState(false)

  const isLocked = currentGw?.deadline_time ? new Date(currentGw.deadline_time) <= new Date() : false

  // Fast pre-indexing by ID and by Position
  const playersById = useMemo(() => {
    const map = new Map<number, any>()
    for (const p of players) {
      map.set(p.id, p)
    }
    return map
  }, [players])

  const playersByPosition = useMemo(() => {
    const map: Record<string, any[]> = { FWD: [], MID: [], DEF: [], GK: [] }
    for (const p of players) {
      if (map[p.position]) {
        map[p.position].push(p)
      }
    }
    return map
  }, [players])

  // Reset display limit when filter or search changes
  useEffect(() => {
    setDisplayLimit(35)
  }, [activeSlot, deferredSearchQuery, selectedClub, sortBy])

  // Keep local picks in sync if server props change
  useEffect(() => {
    setCurrentPicks(initialPicks || [])
  }, [initialPicks])

  const initialState = { success: false, message: '', error: '' }
  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => {
      const playerId = parseInt(formData.get('playerId') as string)
      const playerName = formData.get('playerName') as string
      const position = formData.get('position') as string

      formData.append('gameweekId', currentGw.id.toString())
      const result = await submitFantasticFourPrediction(formData)
      if (result.success) {
        setCurrentPicks(prev => [
          ...prev.filter((p: any) => p.position !== position),
          { player_id: playerId, player_name: playerName, position: position, points_earned: null }
        ])
        setActiveSlot(null)
        setComparePlayerId(null)
        setInfoSlot(null)
        toast.success(result.message || `${playerName} selected as your ${position} pick!`)
        return { success: true, message: result.message, error: '' }
      }
      toast.error(result.error || `Failed to select ${playerName}`)
      return { success: false, message: '', error: result.error || 'Failed' }
    },
    initialState
  )

  // Transform array of current picks into an easy lookup map by position
  const picksByPosition = useMemo(() => {
    return currentPicks.reduce((acc: any, pick: any) => {
      const playerDetails = playersById.get(pick.player_id)

      let tCode = 0
      if (playerDetails?.teams) {
        if (Array.isArray(playerDetails.teams)) {
          tCode = playerDetails.teams[0]?.code || 0
        } else {
          tCode = playerDetails.teams.code || 0
        }
      }

      acc[pick.position] = {
        id: pick.player_id,
        name: pick.player_name || playerDetails?.name || '',
        teamCode: tCode,
        points: pick.points_earned,
        teamShortName: playerDetails?.teams ? (Array.isArray(playerDetails.teams) ? playerDetails.teams[0]?.short_name : playerDetails.teams.short_name) : '',
        nextFixture: playerDetails?.next_fixture || 'None'
      }
      return acc
    }, {})
  }, [currentPicks, playersById])

  const handleRemovePlayer = async (position: string) => {
    if (isLocked) {
      toast.error('Gameweek deadline has passed. Picks are locked.')
      return
    }
    const playerToRemove = picksByPosition[position]
    const playerName = playerToRemove?.name || `${position} pick`

    setRemovingPos(position)
    try {
      const res = await removeFantasticFourPick({ gameweekId: currentGw.id, position })
      if (res.success) {
        setCurrentPicks(prev => prev.filter((p: any) => p.position !== position))
        if (infoSlot === position) setInfoSlot(null)
        toast.success(`Removed ${playerName} (${position}) from Fantastic Four`)
      } else {
        toast.error(res.error || `Failed to remove ${playerName}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to remove ${playerName}`
      toast.error(msg)
    } finally {
      setRemovingPos(null)
    }
  }

  const handleClearAll = async () => {
    if (isLocked) {
      toast.error('Gameweek deadline has passed. Picks are locked.')
      return
    }
    setIsClearing(true)
    try {
      const res = await clearAllFantasticFourPicks({ gameweekId: currentGw.id })
      if (res.success) {
        setCurrentPicks([])
        setShowClearModal(false)
        setInfoSlot(null)
        toast.success(`All Fantastic Four picks cleared for Gameweek ${currentGw.id}!`)
      } else {
        toast.error(res.error || 'Failed to clear picks')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to clear picks'
      toast.error(msg)
    } finally {
      setIsClearing(false)
    }
  }

  // Pre-calculate disabled players in O(N) once, giving O(1) checks during rendering
  const disabledPlayerIds = useMemo(() => {
    const set = new Set<number>()
    if (!allUserFantasticPicks || allUserFantasticPicks.length === 0) return set

    const isFirstHalf = (currentGw?.id || 1) <= 19
    const playerPicksMap = new Map<number, any[]>()

    for (const pick of allUserFantasticPicks) {
      if (pick.gameweek_id === currentGw?.id) continue
      const list = playerPicksMap.get(pick.player_id) || []
      list.push(pick)
      playerPicksMap.set(pick.player_id, list)
    }

    for (const player of players) {
      const history = playerPicksMap.get(player.id)
      if (!history || history.length === 0) continue

      if (player.position === 'DEF' || player.position === 'MID') {
        set.add(player.id)
      } else if (player.position === 'GK' || player.position === 'FWD') {
        const pickedInFirstHalf = history.some(p => p.gameweek_id <= 19)
        const pickedInSecondHalf = history.some(p => p.gameweek_id > 19)
        if (isFirstHalf && pickedInFirstHalf) set.add(player.id)
        if (!isFirstHalf && pickedInSecondHalf) set.add(player.id)
      }
    }

    return set
  }, [allUserFantasticPicks, currentGw?.id, players])

  const isPlayerDisabled = (p: any) => {
    if (picksByPosition[p.position]?.id === p.id) return false
    return disabledPlayerIds.has(p.id)
  }

  // Extract unique clubs for the filter
  const uniqueClubs = useMemo(() => {
    return Array.from(new Set(players.map((p: any) => {
      if (p.teams) {
        return Array.isArray(p.teams) ? p.teams[0]?.name : p.teams.name
      }
      return null
    }).filter(Boolean))).sort()
  }, [players])

  const filteredPlayers = useMemo(() => {
    if (!activeSlot) return []
    const positionPlayers = playersByPosition[activeSlot] || []
    const query = deferredSearchQuery.trim().toLowerCase()

    let list = positionPlayers.filter((p: any) => {
      if (query && !p.name.toLowerCase().includes(query)) return false

      if (selectedClub !== 'All') {
        const clubName = p.teams ? (Array.isArray(p.teams) ? p.teams[0]?.name : p.teams.name) : null
        if (clubName !== selectedClub) return false
      }

      return true
    })

    return list.sort((a: any, b: any) => {
      if (sortBy === 'form') return (b.form || 0) - (a.form || 0)
      if (sortBy === 'points_per_game') return (b.points_per_game || 0) - (a.points_per_game || 0)
      if (sortBy === 'total_points') return (b.total_points || 0) - (a.total_points || 0)
      if (sortBy === 'selected_by_percent') return (b.selected_by_percent || 0) - (a.selected_by_percent || 0)
      return a.name.localeCompare(b.name)
    })
  }, [playersByPosition, activeSlot, deferredSearchQuery, selectedClub, sortBy])

  const positions = ['FWD', 'MID', 'DEF', 'GK']
  const pickedCount = positions.filter(pos => Boolean(picksByPosition[pos])).length

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="glass rounded-xl p-4 text-sm text-slate-700 dark:text-slate-300 border-amber-500/30 border-l-4">
        📌 <strong className="text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">Fantastic 4 Rules:</strong> Select your Fantastic Four. <strong>DEF/MID</strong> can be picked ONCE per season. <strong>GK/FWD</strong> can be picked ONCE per half-season. Click a player to swap them. Failure to submit a draft = <strong className="text-rose-500 font-bold text-lg">-5 pts</strong> penalty.
      </div>

      {/* Action Header: Draft Status & Clear All */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 glass rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
            Squad: <span className="text-emerald-600 dark:text-emerald-400">{pickedCount}/4</span>
          </span>
          <div className="flex items-center gap-1.5">
            {positions.map((pos) => {
              const isFilled = Boolean(picksByPosition[pos])
              return (
                <span
                  key={pos}
                  className={`text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-md uppercase tracking-wider transition-colors ${
                    isFilled
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-200/60 dark:bg-white/5 text-slate-400 dark:text-slate-500 border border-dashed border-slate-300 dark:border-white/10'
                  }`}
                >
                  {pos}
                </span>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pickedCount > 0 && !isLocked && (
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              disabled={isClearing || removingPos !== null || isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 border border-rose-500/30 transition-all hover:scale-105 disabled:opacity-50 cursor-pointer shadow-sm"
              title="Clear all players"
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
      
      {/* 3D Pitch Container */}
      <div className="relative w-full aspect-[3/4] sm:aspect-[4/5] md:aspect-auto min-h-[550px] sm:min-h-[600px] [perspective:1200px] mx-auto max-w-4xl gpu-accelerated">
        <div className="absolute inset-0 bg-emerald-600 dark:bg-emerald-800 rounded-[2.5rem] overflow-hidden shadow-[inset_0_0_100px_rgba(0,0,0,0.6),0_20px_40px_rgba(0,0,0,0.4)] border-[12px] border-emerald-700/50 dark:border-emerald-900/50 transition-all duration-700 hover:shadow-[0_0_60px_rgba(16,185,129,0.4)] [transform:rotateX(15deg)_scale(0.95)] [transform-origin:bottom] group/pitch">
          
          {/* Pitch Lines & Grass Pattern */}
          <div className="absolute inset-0 opacity-20 bg-[repeating-linear-gradient(0deg,transparent,transparent_40px,#000_40px,#000_80px)]" />
          <div className="absolute inset-x-0 top-0 h-[10%] border-b-[3px] border-white/40" />
          <div className="absolute inset-x-[20%] top-0 h-[20%] border-x-[3px] border-b-[3px] border-white/40" />
          <div className="absolute inset-x-0 bottom-0 h-[10%] border-t-[3px] border-white/40" />
          <div className="absolute inset-x-[20%] bottom-0 h-[20%] border-x-[3px] border-t-[3px] border-white/40" />
          <div className="absolute inset-0 m-auto w-40 h-40 border-[3px] border-white/40 rounded-full" />
          <div className="absolute inset-x-0 top-1/2 h-[3px] bg-white/40" />

          {/* Player Slots */}
          <div className="relative z-10 h-full flex flex-col justify-around py-4 sm:py-8 [transform:rotateX(-15deg)] transition-transform duration-700">
            {positions.map((pos) => {
              const selectedPlayer = picksByPosition[pos]
              const isSlotRemoving = removingPos === pos

              return (
                <div key={pos} className="flex justify-center">
                  <div className="relative flex flex-col items-center group transition-all duration-300 hover:-translate-y-2">
                    {/* Individual Player Remove Button (Cross) */}
                    {selectedPlayer && !isLocked && (
                      <button
                        type="button"
                        title={`Remove ${selectedPlayer.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemovePlayer(pos)
                        }}
                        disabled={isSlotRemoving || isClearing || isPending}
                        className="absolute -top-1 -right-2 sm:-right-3 z-30 w-6 h-6 rounded-full bg-rose-600/90 hover:bg-rose-500 active:scale-90 text-white flex items-center justify-center shadow-lg border border-white/40 transition-all hover:scale-110 cursor-pointer backdrop-blur-sm"
                      >
                        {isSlotRemoving ? (
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        )}
                      </button>
                    )}

                    {/* Clickable Slot Area */}
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedPlayer) {
                          setInfoSlot(pos)
                        } else {
                          setActiveSlot(pos)
                          setSearchQuery('')
                        }
                      }}
                      className="flex flex-col items-center outline-none cursor-pointer"
                    >
                      {selectedPlayer ? (
                        // Render Player Jersey and Details if Picked
                        <div className="flex flex-col items-center relative animate-in zoom-in duration-300">
                          {/* Fixed height container ensures layout never collapses */}
                          <div className="relative w-20 h-24 flex items-end justify-center mb-1 group-hover:scale-110 transition-transform duration-300">
                            {/* Glow behind jersey */}
                            <div className="absolute inset-0 bg-white/20 blur-xl rounded-full" />
                            <img
                              // Using the highly stable FPL specific CDN for shirts
                              src={`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${selectedPlayer.teamCode}-66.webp`}
                              alt="Jersey"
                              loading="lazy"
                              decoding="async"
                              className="w-16 h-auto object-contain drop-shadow-[0_10px_10px_rgba(0,0,0,0.6)] relative z-10"
                              onError={(e) => {
                                // Fallback to the generic FPL grey shirt if code is missing
                                ;(e.target as HTMLImageElement).src = 'https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_0-66.webp'
                              }}
                            />
                            {selectedPlayer.points !== null && selectedPlayer.points !== undefined && (
                              <span className="absolute -top-1 -left-3 px-2 py-1 bg-emerald-500 text-white text-[10px] font-extrabold rounded-full shadow-lg border-2 border-emerald-300 z-20">
                                {selectedPlayer.points} Pts
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-stretch">
                            <span className="px-3 py-1 bg-black/80 backdrop-blur-md text-white text-xs sm:text-sm font-bold rounded-t-lg shadow-xl border-x border-t border-white/20 max-w-[140px] text-center truncate z-10">
                              {selectedPlayer.name}
                            </span>
                            <span className="px-2 py-0.5 bg-black/50 backdrop-blur-sm text-emerald-400/90 text-[9px] font-semibold tracking-wide uppercase rounded-b-lg shadow-sm border border-white/20 z-10 text-center">
                              {selectedPlayer.teamShortName} • {selectedPlayer.nextFixture}
                            </span>
                          </div>
                        </div>
                      ) : (
                        // Render Add Button if Empty
                        <div className="w-16 h-16 rounded-full glass bg-white/10 text-white/50 font-bold text-3xl flex items-center justify-center border-2 border-dashed border-white/40 group-hover:bg-white/20 group-hover:border-white group-hover:text-white transition-all shadow-[0_10px_20px_rgba(0,0,0,0.3)] backdrop-blur-md">
                          +
                        </div>
                      )}

                      {!selectedPlayer && (
                        <span className="mt-3 px-3 py-1 bg-black/40 backdrop-blur-md text-white text-[10px] font-bold rounded-lg uppercase tracking-widest shadow-md">
                          {pos}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Clear All Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 animate-in zoom-in-95 duration-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Clear All Picks?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                This will remove all {pickedCount} selected {pickedCount === 1 ? 'player' : 'players'} from your Fantastic Four draft for Gameweek {currentGw?.id}.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold glass bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={isClearing}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-500/20 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {isClearing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Clearing...
                  </>
                ) : (
                  'Yes, Clear All'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player Info Overlay */}
      {infoSlot && (() => {
        const infoPlayerDetails = playersById.get(picksByPosition[infoSlot]?.id)
        if (!infoPlayerDetails) return null
        return (
          <div className="absolute inset-0 z-30 bg-slate-900/40 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="glass bg-white/90 dark:bg-neutral-950/90 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200">
              <button onClick={() => setInfoSlot(null)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 z-10 cursor-pointer">
                ✕
              </button>
              <div className="p-5 flex items-center gap-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
                <img
                  src={`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${picksByPosition[infoSlot].teamCode}-66.webp`}
                  alt="Jersey"
                  loading="lazy"
                  decoding="async"
                  className="w-16 h-auto object-contain drop-shadow-md"
                  onError={(e) => { ;(e.target as HTMLImageElement).src = 'https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_0-66.webp' }}
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
                  <div className="glass bg-white/50 dark:bg-black/40 p-3 rounded-lg border border-slate-200 dark:border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Upcoming Fixture</p>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{infoPlayerDetails.next_fixture || 'No fixture'}</p>
                  </div>
                  <div className="glass bg-white/50 dark:bg-black/40 p-3 rounded-lg border border-slate-200 dark:border-white/5">
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
                  <div className="text-center p-2 glass bg-white/50 dark:bg-black/40 rounded-lg border border-slate-200 dark:border-white/5">
                    <p className="text-xs text-slate-500">Pts</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{infoPlayerDetails.total_points}</p>
                  </div>
                  <div className="text-center p-2 glass bg-white/50 dark:bg-black/40 rounded-lg border border-slate-200 dark:border-white/5">
                    <p className="text-xs text-slate-500">Form</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{infoPlayerDetails.form}</p>
                  </div>
                  <div className="text-center p-2 glass bg-white/50 dark:bg-black/40 rounded-lg border border-slate-200 dark:border-white/5">
                    <p className="text-xs text-slate-500">PPG</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{infoPlayerDetails.points_per_game}</p>
                  </div>
                  <div className="text-center p-2 glass bg-white/50 dark:bg-black/40 rounded-lg border border-slate-200 dark:border-white/5">
                    <p className="text-xs text-slate-500">TSB</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{infoPlayerDetails.selected_by_percent}%</p>
                  </div>
                </div>

                {infoPlayerDetails.news && (
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-900/50">
                    {infoPlayerDetails.news}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => handleRemovePlayer(infoSlot)}
                      disabled={removingPos === infoSlot || isClearing}
                      className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm text-sm cursor-pointer"
                    >
                      {removingPos === infoSlot ? (
                        <span className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                          Remove
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setInfoSlot(null)
                      setActiveSlot(infoSlot)
                      setSearchQuery('')
                    }}
                    className="flex-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md text-sm cursor-pointer"
                  >
                    Swap Player
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Player Selection Overlay Drawer */}
      {activeSlot && (
        <div className="absolute inset-0 z-20 glass bg-white/90 dark:bg-neutral-900/90 backdrop-blur-2xl flex flex-col transition-colors shadow-2xl rounded-[2.5rem] overflow-hidden border border-slate-200 dark:border-white/20">
          <div className="p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-slate-100/50 dark:bg-black/40 transition-colors">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white uppercase tracking-widest">Select {activeSlot}</h3>
            <button onClick={() => setActiveSlot(null)} className="text-slate-600 dark:text-white hover:text-rose-500 dark:hover:text-rose-400 font-bold px-3 py-1 bg-white/50 dark:bg-black/60 border border-slate-200 dark:border-white/10 rounded-full transition-colors backdrop-blur-md cursor-pointer">✕</button>
          </div>

          <div className="p-4 bg-slate-50/50 dark:bg-black/20 space-y-3">
            <input
              type="text"
              placeholder="Search player name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 dark:border-white/10 glass bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-colors outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />

            <div className="flex gap-2">
              <select
                value={selectedClub}
                onChange={(e) => setSelectedClub(e.target.value)}
                className="flex-1 p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="All" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">All Clubs</option>
                {(uniqueClubs as string[]).map((club) => (
                  <option key={club} value={club} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{club}</option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="flex-1 p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="name" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sort by Name</option>
                <option value="form" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sort by Form</option>
                <option value="points_per_game" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sort by PPG</option>
                <option value="total_points" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sort by Total Points</option>
                <option value="selected_by_percent" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sort by Ownership</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 bg-transparent">
            {filteredPlayers.length === 0 ? (
              <p className="text-center text-slate-500 mt-4">No players found.</p>
            ) : (
              <>
                {filteredPlayers.slice(0, displayLimit).map((p: any) => {
                  const disabled = isPlayerDisabled(p)

                  return (
                    <form action={formAction} key={p.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3 p-3 glass bg-white/80 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors">
                      <input type="hidden" name="playerId" value={p.id} />
                      <input type="hidden" name="playerName" value={p.name} />
                      <input type="hidden" name="position" value={p.position} />

                      <div className="flex flex-col w-full sm:w-auto">
                        <span className="font-semibold text-slate-900 dark:text-white">{p.name} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">({p.teams ? (Array.isArray(p.teams) ? p.teams[0]?.short_name : p.teams.short_name) : ''})</span></span>
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
                          onClick={(e) => { e.preventDefault(); setComparePlayerId(p.id) }}
                          className="bg-slate-200 dark:bg-white/10 border border-transparent dark:border-white/10 text-slate-800 dark:text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-slate-300 dark:hover:bg-white/20 transition-colors shadow-sm cursor-pointer"
                        >
                          Compare
                        </button>
                        <button
                          type="submit"
                          disabled={isPending || disabled}
                          className={`px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm ml-2 transition-colors border cursor-pointer ${disabled
                            ? 'bg-slate-300 dark:bg-black/40 text-slate-500 border-transparent dark:border-white/5 cursor-not-allowed'
                            : 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500 disabled:bg-slate-600'
                            }`}
                        >
                          {isPending ? '...' : disabled ? 'Max Reached' : 'Pick'}
                        </button>
                      </div>
                    </form>
                  )
                })}
                {displayLimit < filteredPlayers.length && (
                  <button
                    type="button"
                    onClick={() => setDisplayLimit(prev => prev + 35)}
                    className="w-full py-3 my-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl transition-all shadow-sm cursor-pointer"
                  >
                    Show More Players ({filteredPlayers.length - displayLimit} remaining)
                  </button>
                )}
              </>
            )}
            {/* Comparison Overlay */}
            {comparePlayerId && (() => {
              const currentPickId = picksByPosition[activeSlot]?.id
              const currentPlayer = currentPickId ? playersById.get(currentPickId) : null
              const candidatePlayer = playersById.get(comparePlayerId)

              if (!candidatePlayer) return null

              const renderCard = (player: any, title: string) => {
                if (!player) {
                  return (
                    <div className="flex-1 glass bg-slate-100 dark:bg-black/40 rounded-2xl border border-dashed border-slate-300 dark:border-white/20 flex items-center justify-center p-4 min-h-[300px]">
                      <span className="text-slate-500 font-medium">Empty Slot</span>
                    </div>
                  )
                }

                const teamCode = Array.isArray(player.teams) ? player.teams[0]?.code : player.teams?.code || 0
                return (
                  <div className="flex-1 glass bg-white dark:bg-black/60 rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col">
                    <div className="bg-slate-50 dark:bg-white/5 py-2 px-3 text-xs font-bold text-center text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10">
                      {title}
                    </div>
                    <div className="p-3 flex flex-col items-center gap-2 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5">
                      <img
                        src={`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-66.webp`}
                        alt="Jersey"
                        loading="lazy"
                        decoding="async"
                        className="w-16 h-auto object-contain drop-shadow-md"
                        onError={(e) => { ;(e.target as HTMLImageElement).src = 'https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_0-66.webp' }}
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
                          {!['a', 'i', 'd', 's'].includes(player.status) && <><span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>Unknown</>}
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
                )
              }

              return (
                <div className="absolute inset-0 z-30 bg-slate-900/40 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
                  <div className="glass bg-white/90 dark:bg-neutral-950/90 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-white/10 max-h-full">
                    <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-white/10 bg-slate-100/50 dark:bg-black/40 shrink-0">
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white">Compare Players</h3>
                      <button onClick={() => setComparePlayerId(null)} className="text-slate-600 dark:text-white hover:text-rose-500 font-bold px-3 py-1 bg-slate-200 dark:bg-black/40 border border-transparent dark:border-white/10 rounded-full transition-colors cursor-pointer">✕</button>
                    </div>
                    <div className="p-2 sm:p-6 flex flex-row gap-2 sm:gap-6 flex-1 overflow-y-auto">
                      {renderCard(currentPlayer, "Current Pick")}
                      <div className="flex flex-col justify-center items-center font-black text-slate-400 dark:text-slate-600 text-2xl">VS</div>
                      {renderCard(candidatePlayer, "Candidate")}
                    </div>
                    <div className="p-4 bg-slate-50/50 dark:bg-black/40 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2 sm:gap-3 shrink-0">
                      <button onClick={() => setComparePlayerId(null)} className="px-5 py-2 glass bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white rounded-xl text-sm font-bold hover:bg-slate-300 dark:hover:bg-white/20 transition-colors border border-transparent dark:border-white/10 cursor-pointer">
                        Cancel
                      </button>
                      <form action={formAction}>
                        <input type="hidden" name="playerId" value={candidatePlayer.id} />
                        <input type="hidden" name="playerName" value={candidatePlayer.name} />
                        <input type="hidden" name="position" value={candidatePlayer.position} />
                        <button
                          type="submit"
                          disabled={isPending || isPlayerDisabled(candidatePlayer)}
                          className={`px-6 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer ${isPlayerDisabled(candidatePlayer)
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
              )
            })()}
          </div>
        </div>
      )}

      {/* Status Feedback */}
      <div className="text-center min-h-[1.5rem]">
        {state.success && <span className="text-green-600 dark:text-green-400 font-bold">✓ {state.message}</span>}
        {state.error && <span className="text-red-600 dark:text-red-400 font-bold">⚠ {state.error}</span>}
      </div>
    </div>
  )
})

export default FantasticFourUI