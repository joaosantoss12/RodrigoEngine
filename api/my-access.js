import { verifySession } from './_lib/session.js'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'

export default async function handler(req, res) {
  const session = verifySession(req.cookies)
  if (!session) {
    return res.status(200).json({ hasAccess: false })
  }

  const { data, error } = await supabaseAdmin
    .from('subscribers')
    .select('id,invite_link,paid_at,plan_type,cancel_at_period_end,current_period_end')
    .eq('telegram_user_id', session.id)
    .eq('paid', true)
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[my-access]', error.message)
    return res.status(500).json({ hasAccess: false })
  }

  if (!data) {
    return res.status(200).json({ hasAccess: false, plan_type: null })
  }

  res.status(200).json({
    hasAccess: true,
    invite_link: data.invite_link,
    plan_type: data.plan_type,
    cancel_at_period_end: data.cancel_at_period_end,
    current_period_end: data.current_period_end,
  })
}
