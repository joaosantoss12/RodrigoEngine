import Stripe from 'stripe'
import { verifySession } from './_lib/session.js'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { subscriptionPeriodEnd } from './_lib/stripePeriod.js'

// Cancels at the end of the current billing period rather than immediately —
// the buyer keeps access (and the group invite stays valid) until the period
// they already paid for actually ends. The webhook's subscription.updated
// handler is what actually flips `paid` to false once Stripe ends it.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = verifySession(req.cookies)
  if (!session) {
    return res.status(401).json({ error: 'Não autenticado' })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[cancel-subscription] STRIPE_SECRET_KEY is not set')
    return res.status(500).json({ error: 'Stripe não configurado.' })
  }

  const { data: subscriber, error } = await supabaseAdmin
    .from('subscribers')
    .select('id,stripe_subscription_id')
    .eq('telegram_user_id', session.id)
    .eq('paid', true)
    .eq('plan_type', 'monthly')
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !subscriber || !subscriber.stripe_subscription_id) {
    return res.status(403).json({ error: 'Não tens uma subscrição mensal ativa.' })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    const subscription = await stripe.subscriptions.update(subscriber.stripe_subscription_id, {
      cancel_at_period_end: true,
    })

    const periodEnd = subscriptionPeriodEnd(subscription)

    await supabaseAdmin
      .from('subscribers')
      .update({
        cancel_at_period_end: true,
        current_period_end: periodEnd,
      })
      .eq('id', subscriber.id)

    res.status(200).json({
      ok: true,
      current_period_end: periodEnd,
    })
  } catch (err) {
    console.error('[cancel-subscription]', err.message)
    res.status(500).json({ error: 'Não foi possível cancelar a subscrição. Tenta novamente.' })
  }
}
