import { verifySession } from './_lib/session.js'
import { supabaseAdmin } from './_lib/supabaseAdmin.js'
import { createGroupInviteLink } from './_lib/telegramBot.js'

// Invite links are single-use (member_limit: 1) and expire after an hour, so
// a returning buyer needs a fresh one each time they want to (re)join.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = verifySession(req.cookies)
  if (!session) {
    return res.status(401).json({ error: 'Não autenticado' })
  }

  const { data: subscriber, error } = await supabaseAdmin
    .from('subscribers')
    .select('id')
    .eq('telegram_user_id', session.id)
    .eq('paid', true)
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !subscriber) {
    return res.status(403).json({ error: 'Sem acesso vitalício associado a esta conta.' })
  }

  const inviteLink = await createGroupInviteLink()
  if (!inviteLink) {
    return res.status(500).json({ error: 'Não foi possível gerar o link de convite. Tenta novamente.' })
  }

  await supabaseAdmin.from('subscribers').update({ invite_link: inviteLink }).eq('id', subscriber.id)

  res.status(200).json({ url: inviteLink })
}
