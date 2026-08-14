import Stripe from 'stripe'
import { verifySession } from './_lib/session.js'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'

// Single product: lifetime access to the private Telegram group. Price is
// configurable via env so it can change without a redeploy of the checkout
// logic itself.
const LIFETIME_PRICE_CENTS = Number(process.env.LIFETIME_PRICE_CENTS || 19700)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[create-checkout] STRIPE_SECRET_KEY is not set')
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
      return res.status(409).json({ error: 'Já tens acesso vitalício ao grupo.', already_paid: true })
    }

    const { data: subscriber, error: insertError } = await supabaseAdmin
      .from('subscribers')
      .insert({
        telegram_user_id: tgSession.id,
        telegram_username: tgSession.username ?? null,
        telegram_name: tgSession.first_name,
        paid: false,
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
      metadata: { product: 'rodrigo-engine-lifetime', purchase_id: subscriber.id },
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'RODRIGOTIPS ENGINE — Acesso Vitalício',
              description: 'Acesso vitalício ao grupo privado no Telegram, sinais de value betting e gestão de banca via Critério de Kelly.',
            },
            unit_amount: LIFETIME_PRICE_CENTS,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      payment_method_types: ['card', 'mb_way'],
      billing_address_collection: 'auto',
      customer_creation: 'always',
      success_url: `${origin}/?success=1&purchase_id=${subscriber.id}`,
      cancel_url: `${origin}/`,
    })

    res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[create-checkout]', err.message)
    res.status(500).json({ error: 'Não foi possível criar a sessão de pagamento.' })
  }
}
