// app/api/push/subscribe/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, isSubscribed: false }, { status: 401 })
    }

    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)

    if (error) {
      console.error('[push/subscribe GET] Error checking subscription:', error)
      return NextResponse.json({ success: false, isSubscribed: false })
    }

    return NextResponse.json({
      success: true,
      isSubscribed: !!(data && data.length > 0)
    })
  } catch (error: any) {
    console.error('[push/subscribe GET] Unexpected error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const endpoint = body.endpoint
    const p256dh = body.keys?.p256dh || body.p256dh
    const auth = body.keys?.auth || body.auth

    if (!endpoint || !p256dh || !auth) {
      console.error('[push/subscribe POST] Missing fields:', { endpoint: !!endpoint, p256dh: !!p256dh, auth: !!auth })
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid subscription payload. Missing endpoint or encryption keys.' 
      }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const { error: upsertError } = await adminClient
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        endpoint: endpoint,
        p256dh: p256dh,
        auth: auth,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'endpoint'
      })

    if (upsertError) {
      console.error('[push/subscribe POST] Database upsert error:', upsertError)
      return NextResponse.json({ 
        success: false, 
        error: upsertError.message || 'Failed to save subscription to database.' 
      }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Subscription saved successfully' })
  } catch (error: any) {
    console.error('[push/subscribe POST] Unexpected error:', error)
    return NextResponse.json({ success: false, error: error.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const endpoint = body.endpoint

    const adminClient = createAdminClient()
    let query = adminClient.from('push_subscriptions').delete().eq('user_id', user.id)
    if (endpoint) {
      query = query.eq('endpoint', endpoint)
    }

    const { error: deleteError } = await query

    if (deleteError) {
      console.error('[push/subscribe DELETE] Error deleting subscription:', deleteError)
      return NextResponse.json({ success: false, error: 'Failed to delete subscription' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Unsubscribed successfully' })
  } catch (error: any) {
    console.error('[push/subscribe DELETE] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
