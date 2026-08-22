import Stripe from 'stripe'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { createGroupInviteLink } from './_lib/telegramBot.js'
import { subscriptionPeriodEnd } from './_lib/stripePeriod.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Read raw body from stream (needed for Stripe signature verification)
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rawBody = await getRawBody(req)
  const sig = req.headers['stripe-signature']

  let event
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
    } else {
      console.warn('[webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature verification')
      event = JSON.parse(rawBody.toString())
    }
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const product = session.metadata?.product
    const purchaseId = session.metadata?.purchase_id

    if ((product !== 'rodrigo-engine-lifetime' && product !== 'rodrigo-engine-monthly') || !purchaseId) {
      return res.status(200).json({ received: true })
    }

    // Idempotência à prova de reenvio: o Stripe pode reenviar o mesmo evento.
    // `paid` na própria linha do subscriber é a marca de "já processado".
    const { data: subscriber, error: fetchError } = await supabaseAdmin
      .from('subscribers')
      .select('*')
      .eq('id', purchaseId)
      .single()

    if (fetchError || !subscriber) {
      console.error('[webhook] subscriber not found:', purchaseId, fetchError?.message)
      return res.status(200).json({ received: true, skipped: 'subscriber not found' })
    }

    if (subscriber.paid) {
      return res.status(200).json({ received: true, skipped: 'already processed' })
    }

    // Best-effort: generate the invite link now so it's ready the moment the
    // buyer lands on the success page. If the bot call fails, access-status
    // and refresh-invite both retry on demand, so this is not fatal.
    const inviteLink = await createGroupInviteLink()

    // Monthly plans need the current billing period end for the "active
    // until" display — the checkout session itself doesn't carry it.
    let currentPeriodEnd = null
    if (product === 'rodrigo-engine-monthly' && session.subscription) {
      try {
        const subscription = await stripe.subscriptions.retrieve(session.subscription)
        currentPeriodEnd = subscriptionPeriodEnd(subscription)
      } catch (err) {
        console.error('[webhook] failed to retrieve subscription for period end:', err.message)
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('subscribers')
      .update({
        paid: true,
        paid_at: new Date().toISOString(),
        plan_type: product === 'rodrigo-engine-monthly' ? 'monthly' : 'lifetime',
        stripe_session_id: session.id,
        stripe_customer_id: session.customer ?? null,
        stripe_subscription_id: session.subscription ?? null,
        customer_email: session.customer_details?.email ?? null,
        invite_link: inviteLink,
        cancel_at_period_end: false,
        current_period_end: currentPeriodEnd,
      })
      .eq('id', purchaseId)

    if (updateError) {
      console.error('[webhook] failed to mark subscriber paid:', updateError.message)
      return res.status(500).json({ error: 'Failed to record purchase' })
    }
  }

  // Monthly plan only: when a subscription lapses (cancelled, or payment
  // finally fails after Stripe's retry schedule), revoke access. Lifetime
  // purchases have no subscription id, so they're untouched by this.
  if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object
    const isEnded = event.type === 'customer.subscription.deleted' || ['canceled', 'unpaid', 'incomplete_expired'].includes(subscription.status)

    const { error: syncError } = await supabaseAdmin
      .from('subscribers')
      .update({
        paid: isEnded ? false : undefined,
        cancel_at_period_end: subscription.cancel_at_period_end ?? false,
        current_period_end: subscriptionPeriodEnd(subscription),
      })
      .eq('stripe_subscription_id', subscription.id)
      .eq('plan_type', 'monthly')

    if (syncError) {
      console.error('[webhook] failed to sync subscriber subscription state:', syncError.message)
    }
  }

  res.status(200).json({ received: true })
}
