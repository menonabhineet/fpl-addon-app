// app/api/cron/send-deadline-notifications/route.ts
import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handleCron(req)
}

export async function POST(req: Request) {
  return handleCron(req)
}

async function handleCron(req: Request) {
  try {
    // 1. Verify Cron Secret
    const authHeader = req.headers.get('authorization')
    const { searchParams } = new URL(req.url)
    const queryKey = searchParams.get('key')
    const cronSecret = process.env.CRON_SECRET

    const isAuthorized =
      !cronSecret ||
      authHeader === `Bearer ${cronSecret}` ||
      queryKey === cronSecret

    if (!isAuthorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()

    // 2. Fetch current / upcoming gameweek
    const now = new Date()
    const nowIso = now.toISOString()

    const { data: gameweeks, error: gwError } = await supabase
      .from('gameweeks')
      .select('*')
      .gt('deadline_time', nowIso)
      .order('deadline_time', { ascending: true })
      .limit(1)

    if (gwError || !gameweeks || gameweeks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No upcoming gameweek deadline found.'
      })
    }

    const nextGw = gameweeks[0]
    const deadlineTime = new Date(nextGw.deadline_time).getTime()
    const diffHours = (deadlineTime - now.getTime()) / (1000 * 60 * 60)

    // Check if within the 1h to 3h safety window before deadline
    if (diffHours < 1.0 || diffHours > 3.0) {
      return NextResponse.json({
        success: true,
        gameweekId: nextGw.id,
        hoursToDeadline: Number(diffHours.toFixed(2)),
        message: `Gameweek ${nextGw.id} deadline is in ${diffHours.toFixed(1)} hours (outside 1-3h notification window). No alerts needed now.`
      })
    }

    // 3. Configure Web Push
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'

    if (!publicKey || !privateKey) {
      return NextResponse.json({ success: false, error: 'VAPID keys not configured.' }, { status: 500 })
    }

    webpush.setVapidDetails(subject, publicKey, privateKey)

    // 4. Fetch all push subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')

    if (subError || !subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        gameweekId: nextGw.id,
        message: 'No push subscriptions found in database.'
      })
    }

    // 5. Fetch who has already been notified for this gameweek
    const { data: alreadySent } = await supabase
      .from('deadline_notifications_sent')
      .select('user_id')
      .eq('gameweek_id', nextGw.id)
      .eq('notification_type', '2h_deadline')

    const alreadySentUserIds = new Set(alreadySent?.map(s => s.user_id) || [])

    // Filter to users who still need to be notified
    const pendingSubs = subscriptions.filter(sub => !alreadySentUserIds.has(sub.user_id))

    if (pendingSubs.length === 0) {
      return NextResponse.json({
        success: true,
        gameweekId: nextGw.id,
        message: `All ${subscriptions.length} subscribed users have already received the 2h deadline reminder for Gameweek ${nextGw.id}.`
      })
    }

    // 6. Pre-fetch selected fixtures for this Gameweek to verify incomplete score picks
    const { data: selectedFixtures } = await supabase
      .from('fixtures')
      .select('id')
      .eq('gameweek_id', nextGw.id)
      .eq('is_selected', true)

    const expectedScoreCount = selectedFixtures?.length || 0

    // 7. Send Notifications per User
    let successCount = 0
    let failureCount = 0
    const notifiedUserIds = new Set<string>()

    // Group subscriptions by user to avoid duplicate database queries
    const subsByUser = new Map<string, typeof subscriptions>()
    for (const sub of pendingSubs) {
      const list = subsByUser.get(sub.user_id) || []
      list.push(sub)
      subsByUser.set(sub.user_id, list)
    }

    const allPendingUserIds = Array.from(subsByUser.keys())
    const selectedFixtureIds = selectedFixtures?.map(f => f.id) || []

    // Bulk fetch all picks for all pending users in a single Promise.all
    const [
      { data: allScorePicks },
      { data: allTeamPicks },
      { data: allFantasticPicks }
    ] = await Promise.all([
      selectedFixtureIds.length > 0
        ? supabase.from('score_predictions').select('user_id, id').in('user_id', allPendingUserIds).in('fixture_id', selectedFixtureIds).range(0, 9999)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from('team_predictions').select('user_id, id').in('user_id', allPendingUserIds).eq('gameweek_id', nextGw.id).range(0, 9999),
      supabase.from('fantastic_four').select('user_id, id').in('user_id', allPendingUserIds).eq('gameweek_id', nextGw.id).range(0, 9999)
    ])

    const scorePicksByUser = new Map<string, number>()
    allScorePicks?.forEach(p => scorePicksByUser.set(p.user_id, (scorePicksByUser.get(p.user_id) || 0) + 1))
    
    const hasSurvivorByUser = new Set<string>()
    allTeamPicks?.forEach(p => hasSurvivorByUser.add(p.user_id))
    
    const fantasticPicksByUser = new Map<string, number>()
    allFantasticPicks?.forEach(p => fantasticPicksByUser.set(p.user_id, (fantasticPicksByUser.get(p.user_id) || 0) + 1))

    // Prepare all individual push delivery tasks
    interface PushTask {
      userId: string
      subId: string
      endpoint: string
      p256dh: string
      auth: string
      payload: string
    }

    const pushTasks: PushTask[] = []

    for (const [userId, userSubs] of Array.from(subsByUser.entries())) {
      const scoreCount = scorePicksByUser.get(userId) || 0
      const hasSurvivor = hasSurvivorByUser.has(userId)
      const fantasticCount = fantasticPicksByUser.get(userId) || 0

      const isMissingScores = expectedScoreCount > 0 && scoreCount < expectedScoreCount
      const isMissingSurvivor = !nextGw.is_survivor_skipped && !hasSurvivor
      const isMissingFantastic = fantasticCount < 4

      const hasIncompletePicks = isMissingScores || isMissingSurvivor || isMissingFantastic

      let body = ''
      if (hasIncompletePicks) {
        const missingItems: string[] = []
        if (isMissingScores) missingItems.push('Score Picks')
        if (isMissingSurvivor) missingItems.push('Survivor')
        if (isMissingFantastic) missingItems.push('Fantastic 4')
        body = `⏳ GW${nextGw.id} deadline in ~${Math.round(diffHours)}h! You still need to submit: ${missingItems.join(', ')}. Tap to lock in!`
      } else {
        body = `⏳ GW${nextGw.id} deadline in ~${Math.round(diffHours)}h! All your picks are locked in. Good luck!`
      }

      const payload = JSON.stringify({
        title: `🚨 Gameweek ${nextGw.id} Deadline Alert`,
        body: body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        url: '/dashboard',
        tag: `gw-${nextGw.id}-deadline`
      })

      for (const sub of userSubs) {
        pushTasks.push({
          userId,
          subId: sub.id,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          payload
        })
      }
    }

    // Execute in parallel batches of 25 to ensure completion under 3 seconds
    const expiredSubIds: string[] = []
    const BATCH_SIZE = 25

    for (let i = 0; i < pushTasks.length; i += BATCH_SIZE) {
      const batch = pushTasks.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (task) => {
          const pushSubscription = {
            endpoint: task.endpoint,
            keys: {
              p256dh: task.p256dh,
              auth: task.auth
            }
          }
          await webpush.sendNotification(pushSubscription, task.payload)
          return task
        })
      )

      for (let j = 0; j < results.length; j++) {
        const res = results[j]
        const task = batch[j]

        if (res.status === 'fulfilled') {
          successCount++
          notifiedUserIds.add(task.userId)
        } else {
          failureCount++
          const err = res.reason
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            expiredSubIds.push(task.subId)
          } else {
            console.error(`[send-deadline-notifications] Error sending push to user ${task.userId}:`, err?.message || err)
          }
        }
      }
    }

    // Bulk cleanup expired / unsubscribed endpoints
    if (expiredSubIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredSubIds)
    }

    // 8. Record sent notifications in database to prevent re-sending
    if (notifiedUserIds.size > 0) {
      const recordsToInsert = Array.from(notifiedUserIds).map(uId => ({
        gameweek_id: nextGw.id,
        user_id: uId,
        notification_type: '2h_deadline',
        sent_at: new Date().toISOString()
      }))

      await supabase
        .from('deadline_notifications_sent')
        .insert(recordsToInsert)
    }

    return NextResponse.json({
      success: true,
      gameweekId: nextGw.id,
      hoursToDeadline: Number(diffHours.toFixed(2)),
      notificationsSent: successCount,
      failures: failureCount,
      usersNotified: notifiedUserIds.size,
      message: `Sent ${successCount} notification(s) to ${notifiedUserIds.size} user(s) for Gameweek ${nextGw.id}.`
    })

  } catch (error: any) {
    console.error('[send-deadline-notifications] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
