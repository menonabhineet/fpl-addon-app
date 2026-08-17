// components/dashboard/fantastic-four-ui.tsx
'use client'

import { useState, useActionState, useEffect, useMemo, useDeferredValue, memo } from 'react'
import { useRouter } from 'next/navigation'
import { submitFantasticFourPrediction, removeFantasticFourPick, clearAllFantasticFourPicks } from '@/lib/actions/fantastic-four'
import { toast } from 'sonner'

// Lightweight zero-allocation string normalizer (handles accents like Ø, é, ć, ã)
function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// Blazing-fast in-memory client-side fuzzy match scoring (0 Supabase / Vercel cost, < 0.2ms execution)
function getFuzzyMatchScore(query: string, playerName: string, teamShort: string, teamName: string): number {
  if (!query) return 100

  const q = normalizeText(query)
  const name = normalizeText(playerName)
  const clubShort = normalizeText(teamShort || '')
  const clubFull = normalizeText(teamName || '')

  // 1. Direct exact name match (highest relevance)
  const exactIndex = name.indexOf(q)
  if (exactIndex !== -1) {
    return 1000 - exactIndex * 10
  }

  // 2. Word prefix match (e.g., "mo" -> "Mohamed Salah", "sal" -> "Salah")
  const words = name.split(/[\s-]+/)
  for (const w of words) {
    if (w.startsWith(q)) {
      return 900
    }
  }

  // 3. Team name / short code match (e.g. typing "ARS" or "Arsenal")
  if (clubShort === q || (clubFull && clubFull.startsWith(q))) {
    return 800
  }

  // 4. Subsequence matching (e.g. "hlnd" -> "Haaland", "brno" -> "Bruno")
  let qIdx = 0
  let nIdx = 0
  let consecutive = 0
  let score = 0

  while (qIdx < q.length && nIdx < name.length) {
    if (q[qIdx] === name[nIdx]) {
      qIdx++
      consecutive++
      score += 15 + consecutive * 5
    } else {
      consecutive = 0
    }
    nIdx++
  }

  if (qIdx === q.length) {
    return 500 + score
  }

  // 5. Typo tolerance (1 typo for 3-5 chars, 2 for >= 6 chars)
  if (q.length >= 3) {
    const maxEdits = q.length <= 5 ? 1 : 2
    for (const w of words) {
      if (Math.abs(w.length - q.length) <= maxEdits) {
        let edits = 0
        let i = 0, j = 0
        while (i < q.length && j < w.length) {
          if (q[i] !== w[j]) {
            edits++
            if (edits > maxEdits) break
            if (q.length > w.length) i++
            else if (w.length > q.length) j++
            else { i++; j++; }
          } else {
            i++; j++;
          }
        }
        edits += (q.length - i) + (w.length - j)
        if (edits <= maxEdits) {
          return 300 - edits * 50
        }
      }
    }
  }

  return 0
}

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

  // Blazing-fast client-side fuzzy search & sorting
  const filteredPlayers = useMemo(() => {
    if (!activeSlot) return []
    const positionPlayers = playersByPosition[activeSlot] || []
    const rawQuery = deferredSearchQuery.trim()

    let list = positionPlayers

    // 1. Club filter
    if (selectedClub !== 'All') {
      list = list.filter((p: any) => {
        const clubName = p.teams ? (Array.isArray(p.teams) ? p.teams[0]?.name : p.teams.name) : null
        return clubName === selectedClub
      })
    }

    // 2. Fuzzy search filter & ranking (if query present)
    if (rawQuery) {
      const scored: Array<{ player: any; score: number }> = []
      for (let i = 0; i < list.length; i++) {
        const p = list[i]
        const teamShort = p.teams ? (Array.isArray(p.teams) ? p.teams[0]?.short_name : p.teams?.short_name) || '' : ''
        const teamName = p.teams ? (Array.isArray(p.teams) ? p.teams[0]?.name : p.teams?.name) || '' : ''
        const score = getFuzzyMatchScore(rawQuery, p.name, teamShort, teamName)
        if (score > 0) {
          scored.push({ player: p, score })
        }
      }

      // Sort by fuzzy relevance score first, then by selected metric
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (sortBy === 'form') return (b.player.form || 0) - (a.player.form || 0)
        if (sortBy === 'points_per_game') return (b.player.points_per_game || 0) - (a.player.points_per_game || 0)
        if (sortBy === 'total_points') return (b.player.total_points || 0) - (a.player.total_points || 0)
        if (sortBy === 'selected_by_percent') return (b.player.selected_by_percent || 0) - (a.player.selected_by_percent || 0)
        return a.player.name.localeCompare(b.player.name)
      })

      return scored.map(s => s.player)
    }

    // 3. No query: standard sort
    return [...list].sort((a: any, b: any) => {
      if (sortBy === 'form') return (b.form || 0) - (a.form || 0)
      if (sortBy === 'points_per_game') return (b.points_per_game || 0) - (a.points_per_game || 0)
      if (sortBy === 'total_points') return (b.total_points || 0) - (a.total_points || 0)
      if (sortBy === 'selected_by_percent') return (b.selected_by_percent || 0) - (a.selected_by_percent || 0)
      return a.name.localeCompare(b.name)
    })
  }, [playersByPosition, activeSlot, deferredSearchQuery, selectedClub, sortBy])

  const [showRules, setShowRules] = useState(false)

  const positions = ['FWD', 'MID', 'DEF', 'GK']
  const pickedCount = positions.filter(pos => Boolean(picksByPosition[pos])).length

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Collapsible Rules Accordion */}
      <div className="glass rounded-2xl border border-amber-500/20 overflow-hidden shadow-xs transition-all">
        <button
          type="button"
          onClick={() => setShowRules(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-500/5 transition-colors cursor-pointer"
          aria-expanded={showRules}
        >
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg">⚡</span>
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Fantastic 4 Rules & Scoring
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>{showRules ? 'Hide Rules' : 'View Rules'}</span>
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showRules ? 'rotate-180 text-amber-500' : ''}`}
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
          <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-1 text-sm text-slate-700 dark:text-slate-300 space-y-2.5 border-t border-amber-500/10 animate-in fade-in slide-in-from-top-2 duration-200">
            <p className="font-medium text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Select 4 players (1 GK, 1 DEF, 1 MID, 1 FWD) to earn their official Premier League fantasy points for the gameweek.
            </p>

            <div className="grid sm:grid-cols-2 gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 pt-0.5">
              <div className="flex items-center gap-2 bg-amber-500/5 dark:bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                <span className="text-amber-500 text-sm">🔒</span>
                <span><strong>DEF & MID:</strong> Pickable <strong className="text-amber-600 dark:text-amber-400">ONCE</strong> per full season.</span>
              </div>
              <div className="flex items-center gap-2 bg-sky-500/5 dark:bg-sky-500/10 p-2.5 rounded-xl border border-sky-500/20">
                <span className="text-sky-500 text-sm">🔄</span>
                <span><strong>GK & FWD:</strong> Pickable <strong className="text-sky-600 dark:text-sky-400">ONCE</strong> per half-season (GW 1-19 & GW 20-38).</span>
              </div>
            </div>

            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 pt-0.5 leading-relaxed">
              💡 <strong>Tip:</strong> You can edit or swap your Fantastic 4 picks anytime until the gameweek deadline passes.
            </div>
          </div>
        )}
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
                        className="absolute -top-1 -right-2 sm:-right-3 z-30 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-90 text-white flex items-center justify-center shadow-lg border border-white/40 transition-all hover:scale-110 cursor-pointer"
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
                        <div className="flex flex-col items-center relative animate-in zoom-in duration-200">
                          {/* Fixed height container ensures layout never collapses */}
                          <div className="relative w-20 h-24 flex items-end justify-center mb-1 group-hover:scale-110 transition-transform duration-200">
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
                            <span className="px-3 py-1 bg-black/85 text-white text-xs sm:text-sm font-bold rounded-t-lg shadow-xl border-x border-t border-white/20 max-w-[140px] text-center truncate z-10">
                              {selectedPlayer.name}
                            </span>
                            <span className="px-2 py-0.5 bg-black/75 text-emerald-400/90 text-[9px] font-semibold tracking-wide uppercase rounded-b-lg shadow-sm border border-white/20 z-10 text-center">
                              {selectedPlayer.teamShortName} • {selectedPlayer.nextFixture}
                            </span>
                          </div>
                        </div>
                      ) : (
                        // Render Add Button if Empty
                        <div className="w-16 h-16 rounded-full bg-white/15 hover:bg-white/25 text-white/70 hover:text-white font-bold text-3xl flex items-center justify-center border-2 border-dashed border-white/40 group-hover:border-white transition-all shadow-[0_10px_20px_rgba(0,0,0,0.3)]">
                          +
                        </div>
                      )}

                      {!selectedPlayer && (
                        <span className="mt-3 px-3 py-1 bg-black/60 text-white text-[10px] font-bold rounded-lg uppercase tracking-widest shadow-md">
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
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-6 animate-in zoom-in-95 duration-150 text-center space-y-4 transform-gpu">
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

      {/* Player Info / Swap Overlay */}
      {infoSlot && (() => {
        const infoPlayerDetails = playersById.get(picksByPosition[infoSlot]?.id)
        if (!infoPlayerDetails) return null

        const teamCode = picksByPosition[infoSlot]?.teamCode || 0
        const teamShort = infoPlayerDetails.teams ? (Array.isArray(infoPlayerDetails.teams) ? infoPlayerDetails.teams[0]?.short_name : infoPlayerDetails.teams.short_name) : ''
        const teamName = infoPlayerDetails.teams ? (Array.isArray(infoPlayerDetails.teams) ? infoPlayerDetails.teams[0]?.name : infoPlayerDetails.teams.name) : 'Unknown Club'

        return (
          <div className="absolute inset-0 z-30 bg-black/75 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-150 transform-gpu">
              <button 
                onClick={() => setInfoSlot(null)} 
                className="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-neutral-800 cursor-pointer transition-colors"
              >
                ✕
              </button>

              {/* Modal Header with Jersey & Club Badge */}
              <div className="p-5 flex items-center gap-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-950">
                <div className="relative shrink-0">
                  <img
                    src={`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-66.webp`}
                    alt="Jersey"
                    loading="lazy"
                    decoding="async"
                    className="w-14 h-14 object-contain drop-shadow-md"
                    onError={(e) => { ;(e.target as HTMLImageElement).src = 'https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_0-66.webp' }}
                  />
                  <img
                    src={`https://resources.premierleague.com/premierleague/badges/t${teamCode}.png`}
                    alt={teamShort}
                    loading="lazy"
                    decoding="async"
                    className="w-5 h-5 object-contain absolute -bottom-1 -right-1 drop-shadow-sm bg-white dark:bg-slate-900 rounded-full p-0.5 border border-slate-200 dark:border-white/10"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white truncate">{infoPlayerDetails.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {teamName} • <span className="font-bold text-indigo-600 dark:text-indigo-400">{infoSlot}</span>
                  </p>
                </div>
              </div>

              {/* Stats & Details Grid */}
              <div className="p-5 space-y-3.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-slate-50 dark:bg-neutral-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Next Fixture</p>
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 mt-0.5 truncate">{infoPlayerDetails.next_fixture || 'No fixture'}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-neutral-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Status</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {infoPlayerDetails.status === 'a' ? (
                        <><span className="w-2 h-2 rounded-full bg-emerald-500"></span><span className="font-semibold text-xs text-emerald-600 dark:text-emerald-400">Available</span></>
                      ) : infoPlayerDetails.status === 'i' ? (
                        <><span className="w-2 h-2 rounded-full bg-rose-500"></span><span className="font-semibold text-xs text-rose-600 dark:text-rose-400">Injured</span></>
                      ) : infoPlayerDetails.status === 'd' ? (
                        <><span className="w-2 h-2 rounded-full bg-amber-500"></span><span className="font-semibold text-xs text-amber-600 dark:text-amber-400">Doubtful</span></>
                      ) : infoPlayerDetails.status === 's' ? (
                        <><span className="w-2 h-2 rounded-full bg-rose-500"></span><span className="font-semibold text-xs text-rose-600 dark:text-rose-400">Suspended</span></>
                      ) : (
                        <><span className="w-2 h-2 rounded-full bg-slate-400"></span><span className="font-semibold text-xs text-slate-400">Unknown</span></>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div className="text-center p-2.5 bg-slate-50 dark:bg-neutral-800/60 rounded-xl border border-slate-200/80 dark:border-white/5">
                    <p className="text-[11px] text-slate-400 font-semibold">Pts</p>
                    <p className="font-extrabold text-sm text-slate-800 dark:text-slate-200">{infoPlayerDetails.total_points}</p>
                  </div>
                  <div className="text-center p-2.5 bg-slate-50 dark:bg-neutral-800/60 rounded-xl border border-slate-200/80 dark:border-white/5">
                    <p className="text-[11px] text-slate-400 font-semibold">Form</p>
                    <p className="font-extrabold text-sm text-slate-800 dark:text-slate-200">{infoPlayerDetails.form}</p>
                  </div>
                  <div className="text-center p-2.5 bg-slate-50 dark:bg-neutral-800/60 rounded-xl border border-slate-200/80 dark:border-white/5">
                    <p className="text-[11px] text-slate-400 font-semibold">PPG</p>
                    <p className="font-extrabold text-sm text-slate-800 dark:text-slate-200">{infoPlayerDetails.points_per_game}</p>
                  </div>
                  <div className="text-center p-2.5 bg-slate-50 dark:bg-neutral-800/60 rounded-xl border border-slate-200/80 dark:border-white/5">
                    <p className="text-[11px] text-slate-400 font-semibold">TSB</p>
                    <p className="font-extrabold text-sm text-slate-800 dark:text-slate-200">{infoPlayerDetails.selected_by_percent}%</p>
                  </div>
                </div>

                {infoPlayerDetails.news && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 p-2.5 rounded-xl border border-rose-200/80 dark:border-rose-900/40">
                    {infoPlayerDetails.news}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2.5 pt-1">
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => handleRemovePlayer(infoSlot)}
                      disabled={removingPos === infoSlot || isClearing}
                      className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs text-xs uppercase tracking-wider cursor-pointer active:scale-95"
                    >
                      {removingPos === infoSlot ? (
                        <span className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        'Remove'
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setInfoSlot(null)
                      setActiveSlot(infoSlot)
                      setSearchQuery('')
                    }}
                    className="flex-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 text-xs uppercase tracking-wider cursor-pointer active:scale-95"
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
        <div className="absolute inset-0 z-20 bg-white dark:bg-neutral-900 flex flex-col transition-colors shadow-2xl rounded-[2.5rem] overflow-hidden border border-slate-200 dark:border-white/20 animate-in fade-in zoom-in-95 duration-150 transform-gpu">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-slate-100 dark:bg-neutral-950 transition-colors shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">
                {activeSlot === 'FWD' ? '🎯' : activeSlot === 'MID' ? '⚡' : activeSlot === 'DEF' ? '🛡️' : '🧤'}
              </span>
              <div>
                <h3 className="font-heading text-lg sm:text-xl text-slate-900 dark:text-white uppercase tracking-wider">
                  Select {activeSlot === 'FWD' ? 'Forward' : activeSlot === 'MID' ? 'Midfielder' : activeSlot === 'DEF' ? 'Defender' : 'Goalkeeper'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  {filteredPlayers.length} {activeSlot}s available
                </p>
              </div>
            </div>
            <button 
              onClick={() => setActiveSlot(null)} 
              className="text-slate-600 dark:text-slate-300 hover:text-rose-500 dark:hover:text-rose-400 font-bold w-8 h-8 flex items-center justify-center bg-white dark:bg-black/60 border border-slate-200 dark:border-white/10 rounded-full transition-all hover:scale-105 active:scale-95 shadow-xs cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-4 bg-slate-50 dark:bg-black/30 space-y-2.5 shrink-0 border-b border-slate-200/60 dark:border-white/5">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder={`Search ${activeSlot} by name...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-neutral-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 transition-colors outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center bg-slate-200 dark:bg-white/10 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <select
                value={selectedClub}
                onChange={(e) => setSelectedClub(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs cursor-pointer"
              >
                <option value="All" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">All Clubs</option>
                {(uniqueClubs as string[]).map((club) => (
                  <option key={club} value={club} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{club}</option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs cursor-pointer"
              >
                <option value="name" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sort by Name</option>
                <option value="form" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sort by Form</option>
                <option value="points_per_game" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sort by PPG</option>
                <option value="total_points" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sort by Total Points</option>
                <option value="selected_by_percent" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sort by Ownership</option>
              </select>
            </div>
          </div>

          {/* Players List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50/40 dark:bg-black/20 custom-scrollbar overscroll-contain transform-gpu [contain:content]">
            {filteredPlayers.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <span className="text-3xl">🔍</span>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">No players found matching your search.</p>
              </div>
            ) : (
              <>
                {filteredPlayers.slice(0, displayLimit).map((p: any) => {
                  const disabled = isPlayerDisabled(p)
                  const isCurrentPick = picksByPosition[activeSlot]?.id === p.id
                  const isHotForm = (p.form || 0) >= 5.0

                  const teamCode = p.teams ? (Array.isArray(p.teams) ? p.teams[0]?.code : p.teams?.code) || 0 : 0
                  const teamShort = p.teams ? (Array.isArray(p.teams) ? p.teams[0]?.short_name : p.teams?.short_name) || '' : ''

                  const hasFixture = p.next_fixture && p.next_fixture !== 'No fixture' && p.next_fixture !== 'None'
                  const isHomeFix = hasFixture && p.next_fixture.includes('(H)')

                  return (
                    <form 
                      action={formAction} 
                      key={p.id} 
                      className={`group relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-3.5 rounded-2xl border transition-colors ${
                        isCurrentPick 
                          ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40' 
                          : isHotForm && !disabled
                          ? 'border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/20 hover:border-amber-500/60'
                          : disabled
                          ? 'border-slate-200/50 dark:border-white/5 bg-slate-100/50 dark:bg-neutral-800/30 opacity-50'
                          : 'border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-800/70 hover:border-indigo-500/50 hover:bg-slate-50 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <input type="hidden" name="playerId" value={p.id} />
                      <input type="hidden" name="playerName" value={p.name} />
                      <input type="hidden" name="position" value={p.position} />

                      {/* Left: Club Crest + Player Details */}
                      <div className="flex items-center gap-3 w-full sm:w-auto flex-1 min-w-0">
                        {/* Club Crest Badge */}
                        <div className="relative shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 p-1.5 shadow-xs">
                          <img
                            src={`https://resources.premierleague.com/premierleague/badges/t${teamCode}.png`}
                            alt={teamShort}
                            loading="lazy"
                            decoding="async"
                            className="w-8 h-8 object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://resources.premierleague.com/premierleague/badges/t1.png' }}
                          />
                        </div>

                        {/* Info Column */}
                        <div className="flex flex-col min-w-0 flex-1">
                          {/* Name + Club + Status Row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base tracking-tight truncate">
                              {p.name}
                            </span>
                            
                            {teamShort && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-white/10 shrink-0">
                                {teamShort}
                              </span>
                            )}

                            {p.now_cost && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 shrink-0">
                                £{p.now_cost}m
                              </span>
                            )}

                            {/* Hot Form Badge */}
                            {isHotForm && !disabled && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
                                Hot Form
                              </span>
                            )}

                            {/* Status Badges */}
                            {p.status === 'i' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0" title={p.news || 'Injured'}>
                                Injured
                              </span>
                            )}
                            {p.status === 'd' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0" title={p.news || 'Doubtful'}>
                                Doubtful
                              </span>
                            )}
                            {p.status === 's' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0" title={p.news || 'Suspended'}>
                                Suspended
                              </span>
                            )}
                          </div>

                          {/* Stats Chips Row */}
                          <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                            {hasFixture && (
                              <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 shrink-0">
                                <span className="text-[9px] text-slate-400 uppercase font-medium">Fix:</span>
                                <strong className={isHomeFix ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-600 dark:text-sky-400'}>
                                  {p.next_fixture}
                                </strong>
                              </span>
                            )}
                            
                            {/* Last Gameweek Points */}
                            {p.event_points !== undefined && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-semibold ${p.event_points > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'text-slate-500 dark:text-slate-400'}`}>
                                Last GW: <strong>{p.event_points > 0 ? `+${p.event_points}` : p.event_points} pts</strong>
                              </span>
                            )}

                            <span className="shrink-0">
                              Form: <strong className={`font-semibold ${isHotForm ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'}`}>{p.form}</strong>
                            </span>
                            <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                            <span className="shrink-0">
                              PPG: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{p.points_per_game}</strong>
                            </span>
                            <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                            <span className="shrink-0">
                              Pts: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{p.total_points}</strong>
                            </span>
                            <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                            <span className="shrink-0">
                              TSB: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{p.selected_by_percent}%</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center justify-end w-full sm:w-auto gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/50 dark:border-white/5">
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setComparePlayerId(p.id) }}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-200/70 dark:bg-white/10 hover:bg-slate-300/80 dark:hover:bg-white/20 active:scale-95 transition-all border border-slate-300/50 dark:border-white/10 shadow-xs cursor-pointer"
                        >
                          Compare
                        </button>
                        
                        {isCurrentPick ? (
                          <span className="px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 shadow-xs flex items-center gap-1">
                            <span>✓</span> Picked
                          </span>
                        ) : (
                          <button
                            type="submit"
                            disabled={isPending || disabled}
                            className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all border cursor-pointer active:scale-95 ${
                              disabled
                                ? 'bg-slate-200 dark:bg-black/40 text-slate-400 dark:text-slate-500 border-transparent dark:border-white/5 cursor-not-allowed'
                                : isHotForm
                                ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'
                            }`}
                          >
                            {isPending ? '...' : disabled ? 'Max Reached' : 'Pick'}
                          </button>
                        )}
                      </div>
                    </form>
                  )
                })}
                {displayLimit < filteredPlayers.length && (
                  <button
                    type="button"
                    onClick={() => setDisplayLimit(prev => prev + 35)}
                    className="w-full py-3 my-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-2xl transition-all shadow-sm cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                  >
                    Show More Players ({filteredPlayers.length - displayLimit} remaining)
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Direct Stat Comparison Modal */}
      {comparePlayerId && (() => {
        const candidatePlayer = playersById.get(comparePlayerId)
        if (!candidatePlayer) return null

        const slot = activeSlot || candidatePlayer.position
        const currentPickId = slot ? picksByPosition[slot]?.id : null
        const currentPlayer = currentPickId ? playersById.get(currentPickId) : null

        const p1 = currentPlayer
        const p2 = candidatePlayer

        const p1TeamCode = p1?.teams ? (Array.isArray(p1.teams) ? p1.teams[0]?.code : p1.teams?.code) : 0
        const p2TeamCode = p2?.teams ? (Array.isArray(p2.teams) ? p2.teams[0]?.code : p2.teams?.code) : 0

        const p1TeamShort = p1?.teams ? (Array.isArray(p1.teams) ? p1.teams[0]?.short_name : p1.teams?.short_name) : ''
        const p2TeamShort = p2?.teams ? (Array.isArray(p2.teams) ? p2.teams[0]?.short_name : p2.teams?.short_name) : ''

        // Comparison metrics definition (Clean labels without emojis)
        const metrics = [
          {
            label: 'Form',
            v1: Number(p1?.form || 0),
            v2: Number(p2?.form || 0),
            display1: `${p1?.form || 0}`,
            display2: `${p2?.form || 0}`,
          },
          {
            label: 'Points Per Game (PPG)',
            v1: Number(p1?.points_per_game || 0),
            v2: Number(p2?.points_per_game || 0),
            display1: `${p1?.points_per_game || 0}`,
            display2: `${p2?.points_per_game || 0}`,
          },
          {
            label: 'Total Points',
            v1: Number(p1?.total_points || 0),
            v2: Number(p2?.total_points || 0),
            display1: `${p1?.total_points || 0} pts`,
            display2: `${p2?.total_points || 0} pts`,
          },
          {
            label: 'Last Gameweek',
            v1: Number(p1?.event_points || 0),
            v2: Number(p2?.event_points || 0),
            display1: `+${p1?.event_points || 0} pts`,
            display2: `+${p2?.event_points || 0} pts`,
          },
          {
            label: 'Ownership (TSB)',
            v1: Number(p1?.selected_by_percent || 0),
            v2: Number(p2?.selected_by_percent || 0),
            display1: `${p1?.selected_by_percent || 0}%`,
            display2: `${p2?.selected_by_percent || 0}%`,
          }
        ]

        let p1Wins = 0
        let p2Wins = 0
        metrics.forEach(m => {
          if (m.v1 > m.v2) p1Wins++
          else if (m.v2 > m.v1) p2Wins++
        })

        return (
          <div className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center p-3 sm:p-5">
            <div className="bg-white dark:bg-neutral-900 rounded-[2rem] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-150 border border-slate-200 dark:border-white/10 max-h-full transform-gpu">
              {/* Header */}
              <div className="flex justify-between items-center px-5 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-100/60 dark:bg-black/30 shrink-0">
                <h3 className="font-heading text-lg sm:text-xl text-slate-900 dark:text-white uppercase tracking-wider">
                  Player Comparison
                </h3>
                <button 
                  onClick={() => setComparePlayerId(null)} 
                  className="text-slate-600 dark:text-white hover:text-rose-500 font-bold w-8 h-8 flex items-center justify-center bg-slate-200/80 dark:bg-black/60 rounded-full transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Player Top Cards */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar">
                <div className="grid grid-cols-2 gap-3 sm:gap-4 relative">
                  {/* Player 1 Card (Current Pick) */}
                  <div className={`p-4 rounded-2xl border text-center relative overflow-hidden flex flex-col items-center justify-between ${
                    p1Wins > p2Wins 
                      ? 'border-emerald-500/60 bg-emerald-50/40 dark:bg-emerald-950/20' 
                      : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800/50'
                  }`}>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                      Current Selection
                    </span>
                    {p1 ? (
                      <>
                        <div className="relative my-2">
                          <img
                            src={`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p1TeamCode}-66.webp`}
                            alt={p1.name}
                            loading="lazy"
                            decoding="async"
                            className="w-14 h-14 object-contain drop-shadow-md"
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_0-66.webp' }}
                          />
                          <img
                            src={`https://resources.premierleague.com/premierleague/badges/t${p1TeamCode}.png`}
                            alt={p1TeamShort}
                            loading="lazy"
                            decoding="async"
                            className="w-5 h-5 object-contain absolute -bottom-1 -right-1 drop-shadow-sm bg-white dark:bg-slate-900 rounded-full p-0.5 border border-slate-200 dark:border-white/10"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        </div>
                        <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate w-full">
                          {p1.name}
                        </h4>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                          {p1TeamShort} • {p1.next_fixture || 'No fixture'}
                        </span>
                      </>
                    ) : (
                      <div className="my-6 text-slate-400 text-xs italic">No current pick</div>
                    )}
                  </div>

                  {/* VS Badge in Center */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-xs flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-900">
                    VS
                  </div>

                  {/* Player 2 Card (Candidate) */}
                  <div className={`p-4 rounded-2xl border text-center relative overflow-hidden flex flex-col items-center justify-between ${
                    p2Wins > p1Wins 
                      ? 'border-indigo-500/60 bg-indigo-50/40 dark:bg-indigo-950/20' 
                      : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-neutral-800/50'
                  }`}>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 font-black mb-1">
                      Candidate
                    </span>
                    <div className="relative my-2">
                      <img
                        src={`https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p2TeamCode}-66.webp`}
                        alt={p2.name}
                        loading="lazy"
                        decoding="async"
                        className="w-14 h-14 object-contain drop-shadow-md"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_0-66.webp' }}
                      />
                      <img
                        src={`https://resources.premierleague.com/premierleague/badges/t${p2TeamCode}.png`}
                        alt={p2TeamShort}
                        loading="lazy"
                        decoding="async"
                        className="w-5 h-5 object-contain absolute -bottom-1 -right-1 drop-shadow-sm bg-white dark:bg-slate-900 rounded-full p-0.5 border border-slate-200 dark:border-white/10"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>
                    <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate w-full">
                      {p2.name}
                    </h4>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                      {p2TeamShort} • {p2.next_fixture || 'No fixture'}
                    </span>
                  </div>
                </div>

                {/* Comparative Stat Battle Bars */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 text-center">
                    Stat Comparison
                  </h4>

                  {metrics.map((m, idx) => {
                    const total = Math.max(0.1, m.v1 + m.v2)
                    const p1Percent = p1 ? Math.round((m.v1 / total) * 100) : 0
                    const p2Percent = p1 ? 100 - p1Percent : 100

                    const p1IsLeader = p1 && m.v1 > m.v2
                    const p2IsLeader = !p1 || m.v2 > m.v1
                    const isTie = p1 && m.v1 === m.v2

                    return (
                      <div key={idx} className="p-3 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-neutral-800/40 space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className={`font-bold ${p1IsLeader ? 'text-emerald-600 dark:text-emerald-400 font-extrabold' : 'text-slate-600 dark:text-slate-400'}`}>
                            {m.display1}
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {m.label}
                          </span>
                          <span className={`font-bold ${p2IsLeader && !isTie ? 'text-indigo-600 dark:text-indigo-400 font-extrabold' : 'text-slate-600 dark:text-slate-400'}`}>
                            {m.display2}
                          </span>
                        </div>

                        {/* Dual Progress Bar */}
                        <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden flex">
                          <div 
                            style={{ width: `${p1 ? p1Percent : 0}%` }}
                            className={`h-full transition-all duration-300 ${
                              p1IsLeader ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'
                            }`}
                          />
                          <div 
                            style={{ width: `${p1 ? p2Percent : 100}%` }}
                            className={`h-full transition-all duration-300 ${
                              p2IsLeader && !isTie ? 'bg-indigo-500' : 'bg-slate-400 dark:bg-slate-600'
                            }`}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="p-4 bg-slate-50 dark:bg-black/40 border-t border-slate-200 dark:border-white/10 flex justify-end gap-3 shrink-0">
                <button 
                  onClick={() => setComparePlayerId(null)} 
                  className="px-5 py-2 bg-slate-200/80 dark:bg-white/10 text-slate-800 dark:text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-300 dark:hover:bg-white/20 transition-all border border-slate-300/50 dark:border-white/10 cursor-pointer active:scale-95"
                >
                  Cancel
                </button>
                <form action={formAction}>
                  <input type="hidden" name="playerId" value={p2.id} />
                  <input type="hidden" name="playerName" value={p2.name} />
                  <input type="hidden" name="position" value={p2.position} />
                  <button
                    type="submit"
                    disabled={isPending || isPlayerDisabled(p2)}
                    className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all border cursor-pointer active:scale-95 ${
                      isPlayerDisabled(p2)
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500 border-transparent'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                    }`}
                  >
                    {isPending ? 'Swapping...' : isPlayerDisabled(p2) ? 'Max Reached' : `Swap to ${p2.name}`}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Status Feedback */}
      <div className="text-center min-h-[1.5rem]">
        {state.success && <span className="text-green-600 dark:text-green-400 font-bold">✓ {state.message}</span>}
        {state.error && <span className="text-red-600 dark:text-red-400 font-bold">⚠ {state.error}</span>}
      </div>
    </div>
  )
})

export default FantasticFourUI