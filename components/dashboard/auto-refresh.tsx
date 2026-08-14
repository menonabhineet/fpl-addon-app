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
        
        // If it succeeds (200 OK), it means data was updated (it wasn't rate limited)
        if (response.ok) {
          // Refresh the server components to show the latest data
          // Refresh the server components to show the latest data
          router.refresh()
        } else {
          // 429 Too Many Requests is expected and fine (rate limit)
          // 429 Too Many Requests is expected and fine (rate limit)
        }
      } catch (error) {
        console.error('Auto-refresh failed:', error)
      }
    }

    syncData()
  }, [router])

  return null // This component has no UI
}
