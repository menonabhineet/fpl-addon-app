// components/theme-toggle.tsx
'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch by waiting for mount
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-9 h-9" /> // placeholder

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
      aria-label="Toggle Dark Mode"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}