'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function AutoRefresh() {
  const router = useRouter()
  const hasAttempted = useRef(false)

  useEffect(() => {
    // Only attempt once per mount
    if (hasAttempted.current) return
    hasAttempted.current = true

    const syncData = async () => {
      try {
        const response = await fetch('/api/refresh', { method: 'POST' })
        
        if (response.ok) {
          const data = await response.json().catch(() => null)
          // Only refresh the page if there were actual score/fixture updates
          if (data && data.hasUpdates) {
            router.refresh()
          }
        }
      } catch (error) {
        console.error('Auto-refresh failed:', error)
      }
    }

    syncData()
  }, [router])

  return null // This component has no UI
}
