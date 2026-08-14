import Stripe from 'stripe'
import { verifySession } from './_lib/session.js'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'

// Two products, both managed in the Stripe catalog (Products) rather than
// built ad hoc with price_data — that keeps a single canonical Price per
// plan instead of minting a new Product+Price on every checkout.
const LIFETIME_PRICE_ID = process.env.STRIPE_LIFETIME_PRICE_ID
const MONTHLY_PRICE_ID = process.env.STRIPE_MONTHLY_PRICE_ID

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[create-checkout] STRIPE_SECRET_KEY is not set')
    return res.status(500).json({ error: 'Stripe não configurado.' })
  }

  const plan = req.body?.plan === 'monthly' ? 'monthly' : 'lifetime'
  const priceId = plan === 'monthly' ? MONTHLY_PRICE_ID : LIFETIME_PRICE_ID

  if (!priceId) {
    console.error(`[create-checkout] missing Stripe price id for plan "${plan}"`)
    return res.status(500).json({ error: 'Stripe não configurado.' })
  }

  // Telegram login is mandatory — access is granted to whoever's logged in,
  // so an unauthenticated request can never start a purchase.
  const tgSession = verifySession(req.cookies)
  if (!tgSession) {
    return res.status(401).json({ error: 'Tens de iniciar sessão com o Telegram antes de comprar.' })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  try {
    // Already-paid users don't need a new checkout — send them straight to
    // the join flow instead of letting them pay twice.
    const { data: existing } = await supabaseAdmin
      .from('subscribers')
      .select('id')
      .eq('telegram_user_id', tgSession.id)
      .eq('paid', true)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return res.status(409).json({ error: 'Já tens acesso ao grupo.', already_paid: true })
    }

    const { data: subscriber, error: insertError } = await supabaseAdmin
      .from('subscribers')
      .insert({
        telegram_user_id: tgSession.id,
        telegram_username: tgSession.username ?? null,
        telegram_name: tgSession.first_name,
        paid: false,
        plan_type: plan,
      })
      .select('id')
      .single()

    if (insertError || !subscriber) {
      console.error('[create-checkout] subscriber insert failed:', insertError?.message)
      return res.status(500).json({ error: 'Não foi possível preparar a compra.' })
    }

    const origin = req.headers.origin || process.env.FRONTEND_URL || 'https://rodrigotipsengine.vercel.app'

    const session = await stripe.checkout.sessions.create({
      locale: 'pt',
      metadata: { product: `rodrigo-engine-${plan}`, purchase_id: subscriber.id },
      subscription_data: plan === 'monthly' ? { metadata: { product: 'rodrigo-engine-monthly', purchase_id: subscriber.id } } : undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: plan === 'monthly' ? 'subscription' : 'payment',
      payment_method_types: plan === 'monthly' ? ['card'] : ['card', 'mb_way'],
      billing_address_collection: 'auto',
      customer_creation: plan === 'monthly' ? undefined : 'always',
      success_url: `${origin}/?success=1&purchase_id=${subscriber.id}`,
      cancel_url: `${origin}/`,
    })

    res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[create-checkout]', err.message)
    res.status(500).json({ error: 'Não foi possível criar a sessão de pagamento.' })
  }
}
