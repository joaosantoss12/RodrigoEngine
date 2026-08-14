import Stripe from 'stripe'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { createGroupInviteLink } from './_lib/telegramBot.js'

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

    if (product !== 'rodrigo-engine-lifetime' || !purchaseId) {
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

    const { error: updateError } = await supabaseAdmin
      .from('subscribers')
      .update({
        paid: true,
        paid_at: new Date().toISOString(),
        stripe_session_id: session.id,
        customer_email: session.customer_details?.email ?? null,
        invite_link: inviteLink,
      })
      .eq('id', purchaseId)

    if (updateError) {
      console.error('[webhook] failed to mark subscriber paid:', updateError.message)
      return res.status(500).json({ error: 'Failed to record purchase' })
    }
  }

  res.status(200).json({ received: true })
}
