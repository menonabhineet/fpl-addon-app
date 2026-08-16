// components/dashboard/manager-profile-button.tsx
'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { updateNickname } from '@/lib/actions/profile'

interface ManagerProfileButtonProps {
  userDisplayName: string
  userEmail?: string
  currentNickname?: string
  userFullName?: string
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function ManagerProfileButton({ 
  userDisplayName, 
  userEmail,
  currentNickname = '',
  userFullName = ''
}: ManagerProfileButtonProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [activeDeviceTab, setActiveDeviceTab] = useState<'ios' | 'android'>('ios')
  const [isSupported, setIsSupported] = useState(true)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [nicknameInput, setNicknameInput] = useState(currentNickname)
  const [isSavingNickname, startNicknameTransition] = useTransition()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Keep nicknameInput synced when props change
  useEffect(() => {
    setNicknameInput(currentNickname)
  }, [currentNickname])

  // Detect iOS vs Android user agent on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent.toLowerCase()
      if (ua.includes('android')) {
        setActiveDeviceTab('android')
      } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
        setActiveDeviceTab('ios')
      }

      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
      setIsSupported(supported)

      if (supported) {
        setPermission(Notification.permission)
        // Check if service worker and push subscription already exist
        navigator.serviceWorker.register('/sw.js').then(async (reg) => {
          const sub = await reg.pushManager.getSubscription()
          setIsSubscribed(!!sub)
        }).catch((err) => {
          console.error('Service worker registration failed:', err)
        })
      }
    }
  }, [])

  const handleSubscribe = () => {
    if (!isSupported) {
      toast.error('Web Push is not supported in this browser. Please install the PWA to your Home Screen first.')
      return
    }

    startTransition(async () => {
      try {
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidPublicKey) {
          toast.error('VAPID public key missing from environment.')
          return
        }

        // Request notification permission
        const permResult = await Notification.requestPermission()
        setPermission(permResult)

        if (permResult !== 'granted') {
          toast.error('Notification permission was not granted. Please enable notifications in your browser/device settings.')
          return
        }

        const registration = await navigator.serviceWorker.ready
        let subscription = await registration.pushManager.getSubscription()

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          })
        }

        const subJson = subscription.toJSON()

        let p256dh = subJson.keys?.p256dh
        let auth = subJson.keys?.auth

        if (!p256dh && subscription.getKey) {
          const rawKey = subscription.getKey('p256dh')
          if (rawKey) p256dh = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawKey))))
        }
        if (!auth && subscription.getKey) {
          const rawAuth = subscription.getKey('auth')
          if (rawAuth) auth = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(rawAuth))))
        }

        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            keys: {
              p256dh: p256dh,
              auth: auth,
            }
          })
        })

        const data = await res.json()
        if (data.success) {
          setIsSubscribed(true)
          toast.success('🔔 2h Deadline Alerts enabled successfully!')
        } else {
          toast.error(data.error || 'Failed to save notification subscription.')
        }
      } catch (err: any) {
        console.error('Failed to subscribe to push notifications:', err)
        toast.error(err.message || 'Failed to enable notifications. Please make sure the app is added to your Home Screen.')
      }
    })
  }

  const handleUnsubscribe = () => {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()

        if (subscription) {
          await subscription.unsubscribe()
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint })
          })
        }

        setIsSubscribed(false)
        toast.success('🔕 Deadline notifications disabled on this device.')
      } catch (err: any) {
        console.error('Failed to unsubscribe:', err)
        toast.error('Failed to unsubscribe.')
      }
    })
  }

  const handleSaveNickname = (e: React.FormEvent) => {
    e.preventDefault()
    startNicknameTransition(async () => {
      const res = await updateNickname(nicknameInput)
      if (res.success) {
        toast.success('Nickname updated successfully! 🏷️')
        router.refresh()
      } else {
        toast.error(res.error || 'Failed to update nickname.')
      }
    })
  }

  return (
    <>
      {/* Exact Native Look on Dashboard Header */}
      <div className="flex items-center shrink-0">
        <span className="text-[10px] sm:text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest hidden lg:inline-block mr-1.5">
          Manager:
        </span>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/30 dark:border-emerald-500/40 text-[10px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-xs hover:shadow-emerald-500/20 hover:scale-[1.03] active:scale-95 shrink-0"
          title="Click to manage notifications & app setup"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="truncate max-w-[130px] sm:max-w-[180px]">{userDisplayName}</span>
          <span className="text-[9px] sm:text-[10px] text-emerald-500/80 group-hover:text-emerald-400 transition-transform group-hover:rotate-45">⚙️</span>
        </button>
      </div>

      {/* Sleek Manager & Notifications Modal */}
      {isOpen && mounted && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="relative glass max-w-lg w-full p-6 sm:p-8 rounded-3xl border border-slate-700/80 dark:border-white/15 bg-neutral-950/95 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-xl shadow-inner">
                  👤
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-heading uppercase tracking-wider text-slate-900 dark:text-white">
                    {userDisplayName}
                  </h3>
                  {userEmail && (
                    <p className="text-[11px] font-medium text-slate-400">
                      {userEmail}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Manager Nickname Editor */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/5 dark:bg-black/30 border border-slate-200/20 dark:border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏷️</span>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                    Manager Nickname
                  </h4>
                </div>
                {userFullName && (
                  <span className="text-[10px] text-slate-400 font-medium">
                    Google: {userFullName}
                  </span>
                )}
              </div>
              
              <p className="text-xs text-slate-400 leading-relaxed">
                Set a custom nickname to display on the leaderboard and picks table.
              </p>

              <form onSubmit={handleSaveNickname} className="flex gap-2">
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder={userFullName || 'Enter a nickname...'}
                  maxLength={30}
                  disabled={isSavingNickname}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={isSavingNickname || nicknameInput.trim() === (currentNickname || '')}
                  className="py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-950 bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-emerald-500/20 cursor-pointer shrink-0 flex items-center justify-center min-w-[70px]"
                >
                  {isSavingNickname ? (
                    <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Save'
                  )}
                </button>
              </form>
            </div>

            {/* Notification Management Section */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/5 dark:bg-black/30 border border-slate-200/20 dark:border-white/10 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔔</span>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                      Gameweek Deadline Alerts
                    </h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Receive native lock screen reminders <strong>2 hours before</strong> every Gameweek deadline so you never miss a pick.
                  </p>
                </div>
                
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border ${
                  isSubscribed 
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                    : permission === 'denied'
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                    : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                }`}>
                  {isSubscribed ? '● Active' : permission === 'denied' ? '⚠ Blocked' : '○ Disabled'}
                </span>
              </div>

              {permission === 'denied' && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                  Notifications are blocked in your browser settings. Please allow notifications for this site in your phone or browser preferences.
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                {!isSubscribed ? (
                  <button
                    type="button"
                    onClick={handleSubscribe}
                    disabled={isPending}
                    className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isPending ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Enabling...</span>
                      </>
                    ) : (
                      <>
                        <span>🔔 Enable 2h Deadline Alerts</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-3 w-full p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 text-sm">✓</span>
                      <span className="text-xs font-semibold text-emerald-300">
                        2h Deadline Alerts are active
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleUnsubscribe}
                      disabled={isPending}
                      className="py-1.5 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 active:scale-95 border border-rose-500/20 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      Turn Off
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* PWA Phone Setup Instructions Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/5 dark:bg-black/30 border border-slate-200/20 dark:border-white/10 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">📲</span>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                    Save as App on Phone
                  </h4>
                </div>
                
                {/* Device Selector Tabs */}
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setActiveDeviceTab('ios')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      activeDeviceTab === 'ios'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🍏 iPhone
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDeviceTab('android')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      activeDeviceTab === 'android'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🤖 Android
                  </button>
                </div>
              </div>

              {activeDeviceTab === 'ios' ? (
                <div className="space-y-2 text-xs text-slate-300">
                  <p className="text-[11px] text-amber-400/90 font-medium">
                    ⚠️ <strong>iPhone Requirement:</strong> Apple iOS (16.4+) requires adding the app to your Home Screen before lock-screen push alerts can be delivered.
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-300 font-medium pt-1">
                    <li>Open this website in <strong>Safari</strong> on your iPhone.</li>
                    <li>Tap the <strong>Share button</strong> (square with upward arrow at bottom).</li>
                    <li>Scroll down and select <strong>&quot;Add to Home Screen&quot;</strong>.</li>
                    <li>Open the <strong>PPL App</strong> from your home screen and tap <strong>&quot;Enable 2h Deadline Alerts&quot;</strong> above!</li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-2 text-xs text-slate-300">
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-300 font-medium pt-1">
                    <li>Open this website in <strong>Chrome</strong> on your Android device.</li>
                    <li>Tap the <strong>3 dots (Menu)</strong> in the top-right corner.</li>
                    <li>Tap <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.</li>
                    <li>Open the installed <strong>PPL App</strong> and enable deadline alerts above!</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={async () => {
                  const { createClient } = await import('@/lib/supabase/client')
                  const supabase = createClient()
                  await supabase.auth.signOut()
                  window.location.href = '/'
                }}
                className="py-2 px-3.5 rounded-xl text-xs font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>🚪</span> Log Out
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  )
}
