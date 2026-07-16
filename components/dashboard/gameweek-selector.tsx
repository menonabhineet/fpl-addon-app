// components/dashboard/gameweek-selector.tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

export default function GameweekSelector({ allGameweeks, selectedGwId }: { allGameweeks: any[], selectedGwId: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newGw = e.target.value;
    
    // Safely construct the new URL string
    const params = new URLSearchParams(searchParams.toString())
    params.set('gw', newGw)
    
    // Push the new URL to the browser
    router.push(`${pathname}?${params.toString()}`)
    
    // Force the server to re-run the page.tsx queries with the new parameter
    router.refresh()
  }

  return (
    <select 
      value={selectedGwId} 
      onChange={handleChange}
      className="ml-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-sm font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
    >
      {allGameweeks.map((gw) => (
        <option key={gw.id} value={gw.id}>
          Gameweek {gw.id}
        </option>
      ))}
    </select>
  )
}